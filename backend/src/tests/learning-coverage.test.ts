import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Доля генераций, участвующих в обучении (волна 7).

   ЧТО ЗДЕСЬ ЗАЩИЩАЕТСЯ. Платформа умела отвечать, ЧТО она выучила, и не
   умела отвечать, в какой ДОЛЕ генераций это знание участвует. Разница
   оказалась решающей: уроки собирались в одну память, а код выдавался
   пятью путями, и два самых массовых уроков не видели вовсе —

     · адаптация шаблона (глубина `quick`, путь по умолчанию, то есть
       основной трафик) собирала промпт без уроков;
     · попадание в кэш отдавало код, рождённый под ПРОШЛЫМ набором
       уроков, ещё сутки после любого изменения памяти.

   При этом витрина честно светила «платформа учится». Поэтому тесты
   здесь стоят не только на механизме, но и на самой ЦИФРЕ: доля обязана
   быть занижаемой. Метрика, которая не может показать провал, ничего не
   измеряет.

   НЕГАТИВНЫЕ КОНТРОЛИ, без которых остальное не имеет силы:
     · без уроков промпт адаптации их не содержит — иначе проверка
       «уроки дошли» срабатывала бы всегда;
     · тот же набор уроков даёт ТОТ ЖЕ ключ кэша — иначе «кэш промахнулся
       при изменении уроков» было бы неотличимо от «кэш не работает»;
     · пустая память уроков НЕ считается обучением — иначе доля читалась
       бы как 100% на платформе, которая не выучила ничего;
     · пустой журнал даёт `null`, а не 0% — «генераций не было» и «ни одна
       не училась» разные факты.

   Сеть не используется: вызов модели передаётся параметром (тот же приём,
   что у lib/lesson-author и lesson-effectiveness.test.ts).
   ================================================================ */

let db: any;
let coverage: typeof import('../lib/learning-coverage');
let fingerprint: typeof import('../lib/lessons-fingerprint');
let adapter: typeof import('../services/template-adapter');
let generator: typeof import('../services/app-generator');

/** Контракт уроков ровно той формы, которую отдаёт craft-corpus.renderLessonsContract. */
const LESSONS = [
  'ВЫУЧЕННЫЕ УРОКИ (не повторяй эти ошибки):',
  '1. каждый файл с хуками начинай директивой "use client" на первой строке',
  '2. не объявляй одно имя дважды в одном файле',
].join('\n');

const LESSONS_REWRITTEN = [
  'ВЫУЧЕННЫЕ УРОКИ (не повторяй эти ошибки):',
  '1. компонент с состоянием обязан начинаться с "use client" — иначе сборка падает',
  '2. не объявляй одно имя дважды в одном файле',
].join('\n');

const TEMPLATE = {
  id: 1,
  theme: 'tracker',
  nameSample: 'Прежнее имя',
  description: 'Прежнее описание',
  badge: 'sparkles',
  manifest: [],
  files: [
    { path: 'app/page.tsx', content: 'export default function Page() { return <div>Прежнее имя</div> }' },
    { path: 'app/layout.tsx', content: 'export const metadata = { title: "Прежнее имя" }' },
    { path: 'README.md', content: '# Прежнее имя' },
  ],
  artifactTypes: [{ name: 'Артефакт', type: 'weapon' }],
} as any;

const GOOD_REPLY = `===META===
{"description": "новое описание", "badge": "zap", "artifactNames": ["Меч"]}
===PAGE===
export default function Page() { return <div>Новое имя</div> }
===LAYOUT===
export const metadata = { title: "Новое имя" }
===README===
# Новое имя`;

/** Записывает вызов модели, чтобы промпт можно было проверить глазами теста. */
function recorder(reply: string | null) {
  const prompts: string[] = [];
  const call = async (prompt: string) => {
    prompts.push(prompt);
    return reply;
  };
  return { prompts, call };
}

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  await import('../migrations/094_generation_learning');
  coverage = await import('../lib/learning-coverage');
  fingerprint = await import('../lib/lessons-fingerprint');
  adapter = await import('../services/template-adapter');
  generator = await import('../services/app-generator');
});

beforeEach(() => {
  db.exec('DELETE FROM generation_learning');
});

/* ================================================================
   (а) Шаблонный путь получает контракт уроков
   ================================================================ */

test('адаптация шаблона получает уроки в промпте', async () => {
  const rec = recorder(GOOD_REPLY);
  const result = await adapter.adaptTemplate(TEMPLATE, 'Новое имя', undefined, {
    lessons: LESSONS,
    call: rec.call,
  });

  assert.equal(result.source, 'template-ai');
  assert.equal(rec.prompts.length, 1);
  assert.ok(
    rec.prompts[0].includes('ВЫУЧЕННЫЕ УРОКИ'),
    'основной путь генерации обязан видеть память платформы',
  );
  assert.ok(rec.prompts[0].includes('"use client"'), 'до модели должен доходить текст урока, а не заголовок');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: без уроков промпт адаптации их не содержит', async () => {
  const rec = recorder(GOOD_REPLY);
  await adapter.adaptTemplate(TEMPLATE, 'Новое имя', undefined, { call: rec.call });

  assert.ok(
    !rec.prompts[0].includes('ВЫУЧЕННЫЕ УРОКИ'),
    'иначе проверка «уроки дошли» срабатывала бы всегда и ничего не проверяла',
  );
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: пустой контракт уроков не подмешивает пустой блок', async () => {
  const rec = recorder(GOOD_REPLY);
  await adapter.adaptTemplate(TEMPLATE, 'Новое имя', undefined, { lessons: '   \n  ', call: rec.call });

  assert.ok(!rec.prompts[0].includes('ВЫУЧЕННЫЕ УРОКИ'));
  assert.ok(!/\n\s{2,}\n\s*\n/.test(rec.prompts[0]), 'пустая память не должна портить промпт пустотой');
});

test('модель не ответила — путь честно локальный и обучением не считается', async () => {
  const rec = recorder(null);
  const result = await adapter.adaptTemplate(TEMPLATE, 'Новое имя', undefined, {
    lessons: LESSONS,
    call: rec.call,
  });

  /* Уроки в промпт ушли, но код родился заменой строк, а не моделью. Считать такую
     генерацию обучающейся значило бы завышать долю на всех отказах провайдера. */
  assert.equal(result.source, 'template-local');
});

/* ================================================================
   (б) Ключ кэша включает отпечаток набора уроков
   ================================================================ */

test('изменение формулировки урока промахивает кэш', () => {
  const before = generator.appCacheKey('Трекер', 'привычки', fingerprint.lessonsFingerprint(LESSONS));
  const after = generator.appCacheKey('Трекер', 'привычки', fingerprint.lessonsFingerprint(LESSONS_REWRITTEN));

  assert.notEqual(
    before,
    after,
    'иначе после каждой правки памяти сутки выдавался бы код, рождённый под прежним знанием',
  );
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: тот же набор уроков даёт тот же ключ', () => {
  const a = generator.appCacheKey('Трекер', 'привычки', fingerprint.lessonsFingerprint(LESSONS));
  const b = generator.appCacheKey('Трекер', 'привычки', fingerprint.lessonsFingerprint(LESSONS));

  assert.equal(a, b, 'кэш обязан промахиваться от изменения уроков, а не от самого факта их наличия');
});

test('пустая память уроков даёт читаемый отпечаток, а не пустоту в ключе', () => {
  assert.equal(fingerprint.lessonsFingerprint(''), 'none');
  assert.equal(fingerprint.lessonsFingerprint('   \n '), 'none');
  assert.ok(generator.appCacheKey('Трекер').includes(':lnone:'), 'ключ печатается в логи и обязан читаться глазами');
});

test('отпечаток считается от доставленного текста, а не от имён правил', () => {
  /* Волна 6 научилась ПЕРЕПИСЫВАТЬ формулировку того же правила. Хэш от имён правил
     такое изменение пропустил бы: набор правил тот же, текст другой. */
  const sameRulesOtherText = fingerprint.lessonsFingerprint(LESSONS_REWRITTEN);
  assert.notEqual(sameRulesOtherText, fingerprint.lessonsFingerprint(LESSONS));
});

test('считаем уроки по нумерованным строкам контракта — то есть доставленные', () => {
  assert.equal(fingerprint.countLessonsInContract(LESSONS), 2);
  assert.equal(fingerprint.countLessonsInContract(''), 0);
  assert.equal(
    fingerprint.countLessonsInContract('ВЫУЧЕННЫЕ УРОКИ (не повторяй эти ошибки):'),
    0,
    'заголовок без уроков — это ноль уроков, а не один',
  );
});

/* ================================================================
   (в) Сама цифра: доля генераций, участвующих в обучении
   ================================================================ */

function put(projectId: number, path: any, depth: string, taught: number, learned = 0) {
  coverage.recordGenerationLearning({
    projectId,
    depth,
    path,
    lessonsTaught: taught,
    lessonsLearned: learned,
    fingerprint: taught > 0 ? 'abc123' : null,
  });
}

test('НЕГАТИВНЫЙ КОНТРОЛЬ: пустой журнал даёт null, а не 0%', () => {
  const c = coverage.learningCoverage();

  assert.equal(c.total, 0);
  assert.equal(c.taughtShare, null, '«генераций не было» и «ни одна не училась» — разные факты');
  assert.equal(c.learnedShare, null);
  assert.deepEqual(c.byPath, []);
});

test('доля считается по факту доставки уроков в промпт', () => {
  put(1, 'ai', 'standard', 3);
  put(2, 'template-ai', 'quick', 3);
  put(3, 'template-local', 'quick', 0);
  put(4, 'fallback', 'quick', 0);

  const c = coverage.learningCoverage();
  assert.equal(c.total, 4);
  assert.equal(c.taught, 2);
  assert.equal(c.taughtShare, 0.5);
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: генерация с пустой памятью уроков не считается обучающейся', () => {
  /* Ровно та ловушка, в которую метрика провалилась бы молча: платформа без единого
     урока прогнала генерации, блок уроков собрался пустым — и доля показала бы 100%
     «обучающихся» генераций на платформе, не выучившей ничего. */
  put(1, 'ai', 'standard', 0);
  put(2, 'template-ai', 'quick', 0);

  const c = coverage.learningCoverage();
  assert.equal(c.total, 2);
  assert.equal(c.taught, 0);
  assert.equal(c.taughtShare, 0, 'доля обязана быть занижаемой, иначе она ничего не измеряет');
});

test('кэш не завышает долю собственным попаданием', () => {
  put(1, 'ai', 'deep', 3);
  put(2, 'ai-cached', 'quick', 0);

  const c = coverage.learningCoverage();
  assert.equal(c.taughtShare, 0.5, 'при попадании в кэш ни один промпт сейчас не собирался');
});

test('разрез по ветвям показывает, какой именно путь не учится', () => {
  put(1, 'template-ai', 'quick', 2);
  put(2, 'template-ai', 'quick', 2);
  put(3, 'template-local', 'quick', 0);

  const byPath = new Map(coverage.learningCoverage().byPath.map((s) => [s.key, s]));
  assert.deepEqual(byPath.get('template-ai'), { key: 'template-ai', total: 2, taught: 2 });
  assert.deepEqual(byPath.get('template-local'), { key: 'template-local', total: 1, taught: 0 });
});

test('разрез по глубине отвечает, беден ли обучением бесплатный путь', () => {
  put(1, 'template-ai', 'quick', 2);
  put(2, 'ai', 'standard', 2);

  const byDepth = new Map(coverage.learningCoverage().byDepth.map((s) => [s.key, s]));
  assert.equal(byDepth.get('quick')?.taught, 1);
  assert.equal(byDepth.get('standard')?.taught, 1);
});

test('обучение платформы и обучение генерации считаются раздельно', () => {
  /* Шаблонный путь вёл себя именно так: дефекты в память писал, уроков не получал.
     Одна общая цифра этот случай спрятала бы. */
  put(1, 'template-local', 'quick', 0, 4);

  const c = coverage.learningCoverage();
  assert.equal(c.taught, 0);
  assert.equal(c.learned, 1);
  assert.equal(c.taughtShare, 0);
  assert.equal(c.learnedShare, 1);
});

test('повторная запись по тому же проекту не удваивает знаменатель', () => {
  put(7, 'template-local', 'quick', 0);
  put(7, 'template-ai', 'quick', 2);

  const c = coverage.learningCoverage();
  assert.equal(c.total, 1, 'журнал отвечает за последнюю выдачу, а не за историю попыток');
  assert.equal(c.taught, 1);
});

test('окно наблюдения отсекает прошлое — иначе регресс тонет в истории', () => {
  put(1, 'ai', 'standard', 3);
  db.prepare(`UPDATE generation_learning SET created_at = ? WHERE project_id = 1`).run(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  );
  put(2, 'template-local', 'quick', 0);

  assert.equal(coverage.learningCoverage().taughtShare, 0.5, 'за всю историю — половина');
  assert.equal(coverage.learningCoverage({ sinceDays: 7 }).taughtShare, 0, 'за неделю — ни одной');
});

test('запись не роняет генерацию, если журнала нет (урок инцидента #59)', () => {
  db.exec('DROP TABLE generation_learning');
  assert.doesNotThrow(() => put(1, 'ai', 'standard', 3));
  assert.deepEqual(coverage.learningCoverage().taughtShare, null, 'без схемы витрина честно пустая');

  db.exec(`
    CREATE TABLE IF NOT EXISTS generation_learning (
      project_id      INTEGER PRIMARY KEY,
      depth           TEXT NOT NULL,
      path            TEXT NOT NULL,
      lessons_taught  INTEGER NOT NULL DEFAULT 0,
      lessons_learned INTEGER NOT NULL DEFAULT 0,
      fingerprint     TEXT,
      created_at      INTEGER NOT NULL
    );
  `);
});
