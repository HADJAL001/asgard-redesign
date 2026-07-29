import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Корпус ремесла (lib/craft-corpus + template-store).

   Платформа обязана становиться сильнее с каждым циклом, а не просто
   копить файлы. Здесь проверяем обе памяти:

   • ПАМЯТЬ УДАЧ: в корпус попадает только проверенный код, лучший
     ВЫТЕСНЯЕТ худшего, а выбор шаблона идёт по качеству, а не по
     популярности (раньше первый шаблон темы фиксировался навсегда,
     и корпус не улучшался в принципе).
   • ПАМЯТЬ ОШИБОК: частоты правил, на которых ломается генерация,
     превращаются в блок «выученные уроки» для следующих промптов.
   ================================================================ */

let db: any;
let corpus: typeof import('../lib/craft-corpus');
let store: typeof import('../services/template-store');

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
  `);

  await import('../migrations/092_craft_corpus');
  corpus = await import('../lib/craft-corpus');
  store = await import('../services/template-store');
});

/* ---------------- качество ---------------- */

test('качество: сломанный и непроверенный код в память не попадают', () => {
  assert.equal(corpus.craftQuality({ verdict: 'broken', designScore: 95, repairs: 0 }), 0);
  assert.equal(corpus.craftQuality({ verdict: 'unverified', designScore: 95, repairs: 0 }), 0);
  assert.equal(corpus.isWorthLearning('broken'), false);
  assert.equal(corpus.isWorthLearning('unverified'), false);
  assert.equal(corpus.isWorthLearning('passed'), true);
  assert.equal(corpus.isWorthLearning('repaired'), true);
});

test('качество: рождённый рабочим код ценнее починенного', () => {
  const born = corpus.craftQuality({ verdict: 'passed', designScore: 80, repairs: 0 });
  const fixed = corpus.craftQuality({ verdict: 'repaired', designScore: 80, repairs: 3 });
  assert.ok(born > fixed, `${born} должно быть больше ${fixed}`);
});

test('качество монотонно по баллу интерфейса и ограничено 0..100', () => {
  const low = corpus.craftQuality({ verdict: 'passed', designScore: 40, repairs: 0 });
  const high = corpus.craftQuality({ verdict: 'passed', designScore: 90, repairs: 0 });
  assert.ok(high > low);
  assert.ok(corpus.craftQuality({ verdict: 'passed', designScore: 100, repairs: 0 }) <= 100);
  assert.ok(corpus.craftQuality({ verdict: 'repaired', designScore: 0, repairs: 99 }) >= 0);
});

/* ---------------- отбор в корпусе ---------------- */

const TEMPLATE = (files: string, quality: number, verdict: string) => ({
  name: 'магазин редких артефактов',
  hint: 'каталог и корзина',
  description: 'Магазин',
  badge: 'sparkles',
  manifest: [{ path: 'app/page.tsx', purpose: 'главная' }],
  files: [{ path: 'app/page.tsx', content: files }],
  artifactTypes: [],
  quality,
  verdict,
  designScore: quality,
  repairs: 0,
});

test('лучший вытесняет худшего: корпус улучшается, а не фиксируется навсегда', () => {
  store.saveTemplateFromGeneration(TEMPLATE('// слабая версия', 40, 'repaired') as any);
  const first = db.prepare(`SELECT quality_score, files FROM project_templates WHERE theme = 'ecommerce'`).get();
  assert.equal(first.quality_score, 40);

  store.saveTemplateFromGeneration(TEMPLATE('// сильная версия', 88, 'passed') as any);
  const better = db.prepare(`SELECT quality_score, files FROM project_templates WHERE theme = 'ecommerce'`).get();
  assert.equal(better.quality_score, 88, 'более качественная генерация обязана заменить прежнюю');
  assert.match(better.files, /сильная версия/);
});

test('худший не затирает лучшего', () => {
  store.saveTemplateFromGeneration(TEMPLATE('// снова слабая', 20, 'repaired') as any);
  const row = db.prepare(`SELECT quality_score, files FROM project_templates WHERE theme = 'ecommerce'`).get();
  assert.equal(row.quality_score, 88);
  assert.match(row.files, /сильная версия/);
});

test('статистика переиспользования переживает замену шаблона', () => {
  const before = db.prepare(`SELECT id, usage_count FROM project_templates WHERE theme = 'ecommerce'`).get();
  store.incrementTemplateUsage(before.id, 5000);
  store.saveTemplateFromGeneration(TEMPLATE('// ещё сильнее', 95, 'passed') as any);

  const after = db.prepare(`SELECT usage_count, tokens_saved_estimate, quality_score FROM project_templates WHERE theme = 'ecommerce'`).get();
  assert.equal(after.quality_score, 95);
  assert.equal(after.usage_count, before.usage_count + 1, 'счётчик использований не сбрасывается');
  assert.equal(after.tokens_saved_estimate, 5000);
});

test('выбор шаблона идёт по качеству, а не по популярности', () => {
  const now = Date.now();
  db.prepare(
    `INSERT INTO project_templates (hash, theme, keywords, manifest, files, artifact_types, usage_count, tokens_saved_estimate, created_at, updated_at, quality_score)
     VALUES ('popular-weak', 'blog', 'блог', '[]', '[{"path":"app/page.tsx","content":"// популярный слабый"}]', '[]', 999, 0, ?, ?, 12)`,
  ).run(now, now);
  db.prepare(
    `INSERT INTO project_templates (hash, theme, keywords, manifest, files, artifact_types, usage_count, tokens_saved_estimate, created_at, updated_at, quality_score)
     VALUES ('rare-strong', 'blog', 'блог', '[]', '[{"path":"app/page.tsx","content":"// редкий сильный"}]', '[]', 1, 0, ?, ?, 91)`,
  ).run(now, now);

  // Ключевые слова не совпадают ни с одним хэшем → выбор идёт по теме.
  const match = store.findBestTemplate('blog', ['несуществующее-слово']);
  assert.ok(match);
  assert.match(match!.files[0].content, /редкий сильный/);
});

/* ---------------- память ошибок ---------------- */

test('уроки копятся и складываются по правилу', () => {
  corpus.recordLessons([
    { rule: 'use-client-missing', count: 2 },
    { rule: 'import-missing', count: 1 },
  ]);
  corpus.recordLessons([{ rule: 'use-client-missing', count: 3 }]);

  const top = corpus.topLessons(5);
  assert.equal(top[0].rule, 'use-client-missing');
  assert.equal(top[0].count, 5, 'частоты обязаны складываться между генерациями');
});

test('блок уроков строится из реальной статистики и попадает в промпт', () => {
  const contract = corpus.renderLessonsContract();
  assert.match(contract, /ВЫУЧЕННЫЕ УРОКИ/);
  assert.match(contract, /use client/i, 'самое частое правило обязано быть первым уроком');
});

test('пустая статистика — пустой блок (промпт не меняется)', async () => {
  db.exec(`DELETE FROM generation_lessons`);
  assert.equal(corpus.renderLessonsContract(), '');
  assert.deepEqual(corpus.topLessons(), []);
});

test('неизвестные правила не превращаются в мусорные советы', () => {
  corpus.recordLessons([{ rule: 'совершенно-неизвестное-правило', count: 99 }]);
  const contract = corpus.renderLessonsContract();
  assert.equal(contract.includes('совершенно-неизвестное-правило'), false);
});

test('сводка обучения считает правила и повторения', () => {
  const report = corpus.getLessonsReport();
  assert.ok(report.rules >= 1);
  assert.ok(report.occurrences >= 99);
});

test('запись уроков никогда не бросает наружу', () => {
  assert.doesNotThrow(() => corpus.recordLessons([]));
  assert.doesNotThrow(() => corpus.recordLessons([{ rule: '', count: 0 }]));
});

/* ================================================================
   Наблюдаемость памяти (волна 4).

   До этой волны обе памяти были СЛЕПЫМИ: `getLessonsReport` и
   `getTemplateSavingsReport` существовали, но не были подключены ни к
   одному роуту, а шелла в прод-контейнер нет — то есть проверить, учится
   ли платформа, было нечем в принципе.

   Главное, что должна показывать сводка, — не сумма счётчиков, а РАЗРЫВ
   между «посчитано» и «выучено»: правило без формулировки копится в базе,
   но `renderLessonsContract` его отбрасывает. Именно этот тихий регресс
   случился до волны 2 с правилами досборки контракта, и именно он
   возвращается незаметно, пока цифру некому показать.
   ================================================================ */

test('сводка разделяет выученное и бесполезно накопленное', () => {
  db.exec(`DELETE FROM generation_lessons`);
  corpus.recordLessons([
    { rule: 'use-client-missing', count: 4 }, // формулировка есть → дойдёт до модели
    { rule: 'выдуманное-правило', count: 7 }, // формулировки нет → учёба впустую
  ]);

  const report = corpus.getLessonsReport();

  assert.deepEqual(
    report.taught.map((l) => l.rule),
    ['use-client-missing'],
    'в промпт обязаны попадать только правила с формулировкой',
  );
  assert.match(report.taught[0].text, /use client/i, 'сводка обязана отдавать сам текст урока, а не только имя правила');
  assert.deepEqual(
    report.silent.map((l) => l.rule),
    ['выдуманное-правило'],
    'правило без формулировки обязано быть видно как накопленное впустую',
  );
  assert.equal(report.rules, 2, 'счётчик правил считает и то, что не учится');
  assert.equal(report.occurrences, 11);
});

test('бесполезное правило видно, даже если оно НЕ в топе', () => {
  db.exec(`DELETE FROM generation_lessons`);
  /* Ключевая деталь: `silent` считается по ВСЕМ правилам, а не по топу. Иначе редкий
     дефект без формулировки прятался бы именно там, где его важно заметить. */
  corpus.recordLessons([
    { rule: 'use-client-missing', count: 50 },
    { rule: 'import-missing', count: 40 },
    { rule: 'dependency-missing', count: 30 },
    { rule: 'default-export-missing', count: 20 },
    { rule: 'named-import-missing', count: 10 },
    { rule: 'placeholder-code', count: 9 },
    { rule: 'редкое-безымянное', count: 1 },
  ]);

  const report = corpus.getLessonsReport();

  assert.equal(report.top.length, 5, 'топ остаётся коротким — он для глаз, не для полноты');
  assert.ok(
    report.silent.some((l) => l.rule === 'редкое-безымянное'),
    'правило вне топа обязано попасть в silent',
  );
  assert.ok(report.taught.length <= report.promptLimit, 'в промпт уходит не больше promptLimit правил');
});

test('правило с формулировкой вне топа честно не считается выученным', () => {
  db.exec(`DELETE FROM generation_lessons`);
  /* Асимметрия, которую легко не заметить: формулировка есть, но правило не попало в
     топ — значит до модели оно НЕ доходит. Сводка не имеет права выдавать это за
     обучение, иначе витрина будет врать в самую выгодную для себя сторону. */
  const heavy = [
    'use-client-missing',
    'import-missing',
    'dependency-missing',
    'default-export-missing',
    'named-import-missing',
    'placeholder-code',
  ];
  corpus.recordLessons(heavy.map((rule, i) => ({ rule, count: 100 - i })));
  corpus.recordLessons([{ rule: 'prop-type-mismatch', count: 1 }]);

  const report = corpus.getLessonsReport(6);

  assert.equal(report.taught.length, 6);
  assert.ok(
    !report.taught.some((l) => l.rule === 'prop-type-mismatch'),
    'правило вне promptLimit не обязано выглядеть выученным',
  );
  assert.ok(
    !report.silent.some((l) => l.rule === 'prop-type-mismatch'),
    'но и в «впустую» его записывать нельзя — формулировка у него есть',
  );
});

test('пустая память — витрина честно пустая, а не выдуманная', () => {
  db.exec(`DELETE FROM generation_lessons`);
  const report = corpus.getLessonsReport();
  assert.deepEqual(report.taught, []);
  assert.deepEqual(report.silent, []);
  assert.equal(report.rules, 0);
  assert.equal(report.occurrences, 0);
});

test('сводка памяти никогда не бросает наружу', () => {
  /* Витрина диагностическая: уронить ответ она права не имеет. */
  assert.doesNotThrow(() => corpus.getLessonsReport());
  assert.doesNotThrow(() => store.getTemplateSavingsReport());
});
