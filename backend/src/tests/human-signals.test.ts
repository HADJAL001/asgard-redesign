import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Человеческие сигналы в качество корпуса (волна 7, п.2)

   До этой волны качество шаблона было мнением одной машины:
   собралось / сколько ремонтов / балл интерфейса. Что человек сделал
   с кодом дальше — выложил наружу или пошёл просить переделать —
   платформа знала (миграции 029 и 089) и в отбор не пускала.

   Здесь проверяется не «функция возвращает число», а четыре свойства,
   без которых механизм врал бы:

   1. Сигнал МЕНЯЕТ ОТБОР: при равном машинном балле выигрывает тот
      шаблон, который человек выложил наружу.
   2. Сигнал ПРОИЗВОДЕН: он считается по живым счётчикам в момент
      чтения. Деплой случился после сохранения шаблона — отбор меняется
      сам, без единой записи в строку шаблона.
   3. НЕГАТИВНЫЕ КОНТРОЛИ (главное). Отсутствие сигнала не смеет
      работать как штраф: шаблон без проекта-родителя и проект без
      деплоя получают ровно ноль. Иначе «человеческое качество»
      выродилось бы в поголовный штраф за отсутствие данных.
   4. Сигнал НЕ ПЕРЕБИВАЕТ ИНЖЕНЕРИЮ: он сравним с шагом балла
      интерфейса, а не сильнее вердикта сборки, и не поднимает код,
      качество которого никто не измерял.
   ================================================================ */

let db: any;
let signals: typeof import('../lib/human-signals');
let store: typeof import('../services/template-store');

/** Вставляет шаблон напрямую: тесты отбора не должны зависеть от логики вытеснения. */
function putTemplate(params: {
  hash: string;
  theme: string;
  keywords?: string;
  quality: number | null;
  sourceProjectId: number | null;
  usage?: number;
}) {
  db.prepare(
    `INSERT INTO project_templates
       (hash, theme, keywords, name_sample, description_sample, badge, manifest, files, artifact_types,
        usage_count, tokens_saved_estimate, created_at, updated_at, quality_score, source_project_id)
     VALUES (?, ?, ?, 'x', 'x', 'x', '[]', '[]', '[]', ?, 0, 1, 1, ?, ?)`,
  ).run(
    params.hash,
    params.theme,
    params.keywords ?? '',
    params.usage ?? 0,
    params.quality,
    params.sourceProjectId,
  );
}

function putProject(id: number, deployStatus: string | null) {
  db.prepare(`INSERT INTO projects (id, user_id, name, deploy_status) VALUES (?, 1, 'p', ?)`).run(id, deployStatus);
}

function putRefinements(projectId: number, count: number) {
  for (let i = 0; i < count; i += 1) {
    db.prepare(
      `INSERT INTO project_refinements (user_id, project_id, prompt, status, cost_credits, created_at)
       VALUES (1, ?, 'переделай', 'ready', 0, 1)`,
    ).run(projectId);
  }
}

/** Какой шаблон темы выберет отбор. Возвращает hash — по нему видно, кто победил. */
function chosenHash(theme: string): string | null {
  const row = db
    .prepare(
      `SELECT hash FROM project_templates t WHERE t.theme = ?
       ORDER BY ${signals.effectiveQualitySql('t')} DESC, t.usage_count DESC LIMIT 1`,
    )
    .get(theme) as { hash: string } | undefined;
  return row?.hash ?? null;
}

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  db.exec(`
    CREATE TABLE project_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE NOT NULL,
      theme TEXT NOT NULL,
      keywords TEXT,
      name_sample TEXT,
      description_sample TEXT,
      badge TEXT,
      manifest TEXT NOT NULL,
      files TEXT NOT NULL,
      artifact_types TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      tokens_saved_estimate INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      deploy_status TEXT,
      live_url TEXT
    );
    CREATE TABLE project_refinements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL,
      cost_credits INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);

  await import('../migrations/092_craft_corpus');
  await import('../migrations/100_template_human_signals');
  signals = await import('../lib/human-signals');
  store = await import('../services/template-store');
});

/* ---------------- миграция ---------------- */

test('миграция 100 добавляет связь с проектом-родителем и идемпотентна', async () => {
  const cols = () =>
    (db.prepare(`PRAGMA table_info(project_templates)`).all() as Array<{ name: string }>).map((c) => c.name);

  assert.ok(cols().includes('source_project_id'), 'колонки source_project_id нет');

  const migration = await import('../migrations/100_template_human_signals');
  migration.runTemplateHumanSignalsMigration();
  migration.runTemplateHumanSignalsMigration();

  assert.equal(cols().filter((c) => c === 'source_project_id').length, 1, 'колонка задвоилась');
});

/* ---------------- арифметика дельты ---------------- */

test('дельта: деплой в плюс, просьба переделать в минус', () => {
  const deployed = signals.humanQualityDelta({ sourceProjectId: 1, deployed: true, refinements: 0 });
  const refined = signals.humanQualityDelta({ sourceProjectId: 1, deployed: false, refinements: 1 });

  assert.equal(deployed, signals.DEPLOY_BONUS);
  assert.equal(refined, -signals.REFINEMENT_PENALTY);
  assert.ok(deployed > 0 && refined < 0);
});

test('дельта: штраф за доработки не растёт выше потолка', () => {
  const three = signals.humanQualityDelta({ sourceProjectId: 1, deployed: false, refinements: 3 });
  const twenty = signals.humanQualityDelta({ sourceProjectId: 1, deployed: false, refinements: 20 });

  assert.equal(three, -signals.REFINEMENT_PENALTY_CAP);
  assert.equal(twenty, -signals.REFINEMENT_PENALTY_CAP, 'человек, доводящий проект итерациями, вовлечён, а не обманут');
});

test('дельта: оба сигнала складываются, а не отменяют друг друга по правилу «есть деплой — всё хорошо»', () => {
  const both = signals.humanQualityDelta({ sourceProjectId: 1, deployed: true, refinements: 3 });
  assert.equal(both, signals.DEPLOY_BONUS - signals.REFINEMENT_PENALTY_CAP);
  assert.ok(both < 0, 'выложил, но трижды переделывал — итог всё равно отрицательный');
});

/* ---------------- НЕГАТИВНЫЕ КОНТРОЛИ ---------------- */

test('НЕГАТИВНЫЙ КОНТРОЛЬ: шаблон без проекта-родителя не получает штрафа (дельта ровно 0)', () => {
  assert.equal(signals.humanQualityDelta({ sourceProjectId: null, deployed: false, refinements: 0 }), 0);
  /* И даже если сигналы «подсунуть» — без родителя их не существует. */
  assert.equal(signals.humanQualityDelta({ sourceProjectId: null, deployed: true, refinements: 7 }), 0);
  assert.equal(signals.effectiveTemplateQuality(70, { sourceProjectId: null, deployed: false, refinements: 0 }), 70);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: деплой не работает как поголовный штраф — «не деплоил» это ноль, а не минус', () => {
  const notDeployed = signals.humanQualityDelta({ sourceProjectId: 42, deployed: false, refinements: 0 });
  assert.equal(notDeployed, 0, 'отсутствие деплоя — отсутствие данных, а не приговор');

  putProject(42, null);
  putTemplate({ hash: 'h-quiet', theme: 'fantasy', quality: 70, sourceProjectId: 42 });
  putTemplate({ hash: 'h-orphan', theme: 'fantasy', quality: 70, sourceProjectId: null });

  const quiet = db.prepare(`SELECT ${signals.effectiveQualitySql('t')} AS q FROM project_templates t WHERE hash = 'h-quiet'`).get();
  const orphan = db.prepare(`SELECT ${signals.effectiveQualitySql('t')} AS q FROM project_templates t WHERE hash = 'h-orphan'`).get();
  assert.equal(quiet.q, 70);
  assert.equal(orphan.q, 70, 'корпус без связи с проектами обязан судиться ровно как до волны 7');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: человеческий восторг не поднимает НЕИЗМЕРЕННОЕ качество', () => {
  putProject(43, 'deployed');
  putTemplate({ hash: 'h-unmeasured', theme: 'scifi', quality: null, sourceProjectId: 43 });

  const row = db
    .prepare(`SELECT ${signals.effectiveQualitySql('t')} AS q FROM project_templates t WHERE hash = 'h-unmeasured'`)
    .get();
  assert.equal(row.q, 0, 'сначала «работает», и только потом «понравилось»');
  assert.equal(signals.effectiveTemplateQuality(null, { sourceProjectId: 43, deployed: true, refinements: 0 }), 0);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: сигнал не перебивает инженерный балл — заметно лучший код побеждает деплой', () => {
  putProject(44, 'deployed');
  putTemplate({ hash: 'h-liked', theme: 'blog', quality: 60, sourceProjectId: 44 });
  putTemplate({ hash: 'h-better', theme: 'blog', quality: 60 + signals.DEPLOY_BONUS + 5, sourceProjectId: null });

  assert.equal(chosenHash('blog'), 'h-better', 'человеческая дельта — поправка, а не право вето');
});

/* ---------------- сигнал меняет отбор ---------------- */

test('при равном машинном балле выигрывает тот шаблон, который человек выложил наружу', () => {
  putProject(45, 'deployed');
  putProject(46, null);
  putTemplate({ hash: 'h-deployed', theme: 'game', quality: 75, sourceProjectId: 45 });
  putTemplate({ hash: 'h-shelved', theme: 'game', quality: 75, sourceProjectId: 46, usage: 99 });

  assert.equal(chosenHash('game'), 'h-deployed', 'популярность больше не важнее человеческого результата');
});

test('шаблон, который просили переделать, уступает нетронутому при равном балле', () => {
  putProject(47, null);
  putProject(48, null);
  putRefinements(47, 2);
  putTemplate({ hash: 'h-refined', theme: 'social', quality: 80, sourceProjectId: 47 });
  putTemplate({ hash: 'h-clean', theme: 'social', quality: 80, sourceProjectId: 48 });

  assert.equal(chosenHash('social'), 'h-clean');
});

test('сигнал ПРОИЗВОДЕН: деплой после сохранения меняет отбор сам, без записи в шаблон', () => {
  putProject(49, null);
  putProject(50, null);
  putTemplate({ hash: 'h-a', theme: 'portfolio', quality: 70, sourceProjectId: 49, usage: 5 });
  putTemplate({ hash: 'h-b', theme: 'portfolio', quality: 70, sourceProjectId: 50 });

  assert.equal(chosenHash('portfolio'), 'h-a', 'до деплоя решает переиспользование');

  const before = db.prepare(`SELECT updated_at, quality_score FROM project_templates WHERE hash = 'h-b'`).get();
  db.prepare(`UPDATE projects SET deploy_status = 'deployed' WHERE id = 50`).run();
  const after = db.prepare(`SELECT updated_at, quality_score FROM project_templates WHERE hash = 'h-b'`).get();

  assert.equal(chosenHash('portfolio'), 'h-b', 'человек выложил результат — корпус узнал об этом сам');
  assert.deepEqual(after, before, 'строка шаблона не тронута: качество производно, а не накоплено');
});

test('витрина: доля шаблонов под человеческим сигналом считается по живым фактам', () => {
  const report = signals.humanSignalsReport();

  assert.ok(report.templates > 0);
  assert.ok(report.linked > 0 && report.linked < report.templates, 'в корпусе есть и связанные, и старые шаблоны');
  assert.ok(report.deployed > 0, 'деплои в базе есть');
  assert.ok(report.refined > 0, 'доработки в базе есть');
  assert.ok(report.lifted > 0 && report.penalized > 0);
  assert.ok(
    report.signalShare !== null && report.signalShare > 0 && report.signalShare < 1,
    'сигнал доходит до части корпуса, и доля обязана это показывать',
  );
});

/* ---------------- вытеснение с учётом человека ---------------- */

test('задеплоенный человеком шаблон не вытесняется генерацией, которая лучше лишь на пару пунктов', () => {
  putProject(51, 'deployed');
  const saved = store.saveTemplateFromGeneration({
    name: 'магазин снаряжения',
    description: 'd',
    badge: 'b',
    manifest: [],
    files: [],
    artifactTypes: [],
    quality: 70,
    verdict: 'passed',
    designScore: 70,
    repairs: 0,
    sourceProjectId: 51,
  });
  void saved;

  const hash = db.prepare(`SELECT hash FROM project_templates WHERE source_project_id = 51`).get() as
    | { hash: string }
    | undefined;
  assert.ok(hash, 'шаблон должен был сохраниться со связью');

  /* Претендент лучше на 3 пункта — меньше бонуса за деплой (8). Место остаётся за тем,
     что человек уже выложил наружу. */
  store.saveTemplateFromGeneration({
    name: 'магазин снаряжения',
    description: 'd2',
    badge: 'b2',
    manifest: [],
    files: [],
    artifactTypes: [],
    quality: 73,
    verdict: 'passed',
    designScore: 73,
    repairs: 0,
    sourceProjectId: 52,
  });

  const row = db.prepare(`SELECT quality_score, source_project_id FROM project_templates WHERE hash = ?`).get(hash!.hash);
  assert.equal(row.quality_score, 70, 'шаблон, проверенный человеком, отдан за +3 балла');
  assert.equal(row.source_project_id, 51);

  /* А заметно лучший код место забирает — иначе корпус перестал бы улучшаться. */
  store.saveTemplateFromGeneration({
    name: 'магазин снаряжения',
    description: 'd3',
    badge: 'b3',
    manifest: [],
    files: [],
    artifactTypes: [],
    quality: 70 + signals.DEPLOY_BONUS + 4,
    verdict: 'passed',
    designScore: 82,
    repairs: 0,
    sourceProjectId: 53,
  });

  const after = db.prepare(`SELECT quality_score, source_project_id FROM project_templates WHERE hash = ?`).get(hash!.hash);
  assert.equal(after.quality_score, 70 + signals.DEPLOY_BONUS + 4, 'заметно лучший код обязан вытеснять');
  assert.equal(after.source_project_id, 53, 'вместе с кодом меняется и адрес человеческого сигнала');
});

test('генерация записывает проект-родителя, а без него сохранение всё равно работает', () => {
  store.saveTemplateFromGeneration({
    name: 'дашборд аналитики',
    description: 'd',
    badge: 'b',
    manifest: [],
    files: [],
    artifactTypes: [],
    quality: 65,
    verdict: 'passed',
    designScore: 65,
    repairs: 0,
  });

  const row = db.prepare(`SELECT source_project_id FROM project_templates WHERE theme = 'dashboard'`).get();
  assert.ok(row, 'шаблон без проекта-родителя обязан сохраняться как раньше');
  assert.equal(row.source_project_id, null, 'связи нет — и это честный NULL, а не выдуманный проект');
});
