import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Давление дефекта: частота на генерацию и затухание (волна 7, п.3)

   Отбор уроков работал против себя двумя способами сразу.

   1. АБСОЛЮТНЫЙ СЧЁТЧИК НИКОГДА НЕ УМЕНЬШАЕТСЯ. Дефект, побеждённый сто
      генераций назад, держал место в промпте навсегда. Мест шесть.
      Новый класс дефекта, ломающий код прямо сейчас, не пробивался:
      его счётчик мал по определению — он только начался. `last_seen`
      писался с волны 2 и при отборе не читался ни разу.

   2. У ВЕРДИКТА НЕ БЫЛО ЗНАМЕНАТЕЛЯ. «Два повтора после обучения» —
      провал урока при десяти генерациях и блестящий успех при тысяче.
      При растущем трафике улучшение неотличимо от деградации.

   Здесь проверяется не «функция делит одно на другое», а свойства, без
   которых механизм навредил бы:

   — свежий дефект ОБГОНЯЕТ мёртвую историю и доходит до модели;
   — свежесть сама по себе не побеждает: затухание — поправка, а не
     правило «кто новее, тот и прав»;
   — НЕГАТИВНЫЙ КОНТРОЛЬ, которого требует доска: доказанно ПОЛЕЗНЫЙ
     урок затуханием НЕ выбрасывается. У сработавшего урока дефект
     прекращается по определению, поэтому наивное затухание вычистило бы
     из промпта именно то, что работает;
   — НЕГАТИВНЫЙ КОНТРОЛЬ: простой платформы не забывает уроки. Возраст
     считается в генерациях, а не в днях: месяц без работы не даёт ни
     одного факта ни за урок, ни против него;
   — НЕГАТИВНЫЙ КОНТРОЛЬ: без журнала генераций (схема без 094) всё
     поведение сходится к прежнему — накат кода без миграции не имеет
     права менять ни один вердикт.

   Правила берутся ТОЛЬКО настоящие (из `LESSON_TEXT`): выдуманное правило
   не имеет формулировки, в промпт не попадает вовсе — и тест доказывал бы
   свойство механизма, которого механизм не касается.
   ================================================================ */

let db: any;
let corpus: typeof import('../lib/craft-corpus');
let decay: typeof import('../lib/lesson-decay');

/* Журнал генераций — знаменатель. Одна строка = одна генерация; «N генераций назад»
   выражается меткой времени, а не календарём. */
const GEN_STEP_MS = 60_000;
const NOW = 1_800_000_000_000;

/** Метка времени генерации, случившейся `gensAgo` генераций назад. */
function genStamp(gensAgo: number): number {
  return NOW - gensAgo * GEN_STEP_MS;
}

/** Правило со счётчиком, свежестью и точкой отсчёта — ровно то, чем судит отбор. */
function putRule(params: {
  rule: string;
  count: number;
  lastSeenGensAgo: number;
  taught?: { atGensAgo: number; occurrencesAt: number; times: number };
}) {
  db.prepare(
    `INSERT INTO generation_lessons (rule, occurrences, last_seen, taught_from, occurrences_at_teaching, taught_times)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    params.rule,
    params.count,
    genStamp(params.lastSeenGensAgo),
    params.taught ? genStamp(params.taught.atGensAgo) : null,
    params.taught?.occurrencesAt ?? null,
    params.taught?.times ?? 0,
  );
}

/** Кладёт в журнал `n` генераций: последняя — только что, остальные назад по шагу. */
function putGenerations(n: number) {
  const insert = db.prepare(
    `INSERT INTO generation_learning (project_id, depth, path, lessons_taught, lessons_learned, fingerprint, created_at)
     VALUES (?, 'quick', 'ai', 1, 1, 'f', ?)`,
  );
  for (let i = 0; i < n; i += 1) insert.run(i + 1, genStamp(n - 1 - i));
}

/** Какие правила уйдут в промпт, в порядке отбора. */
function promptRules(limit = 6): string[] {
  return corpus.selectPromptLessons(limit).map((l) => l.rule);
}

/* Настоящие правила платформы. OLD — давний частый дефект, FRESH — класс дефекта из
   волны 7 (его знает только настоящая сборка), NOISE — свежий шум для конкуренции. */
const OLD = 'use-client-missing';
const FRESH = 'suspense-boundary-missing';
const NOISE = ['import-missing', 'dependency-missing', 'syntax', 'markdown-leak', 'empty-file'];

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  await import('../migrations/092_craft_corpus');
  await import('../migrations/093_lesson_authoring');
  await import('../migrations/094_generation_learning');
  await import('../migrations/098_lesson_teaching_baseline');
  corpus = await import('../lib/craft-corpus');
  decay = await import('../lib/lesson-decay');
});

beforeEach(() => {
  db.exec(`DELETE FROM generation_lessons; DELETE FROM generation_lesson_texts; DELETE FROM generation_learning;`);
});

/* ---------------- арифметика затухания ---------------- */

test('затухание: период полураспада уменьшает вес вдвое, и вес никогда не достигает нуля', () => {
  assert.equal(decay.decayFactor(0), 1);
  assert.ok(
    Math.abs(decay.decayFactor(decay.PRESSURE_HALF_LIFE_GENERATIONS) - 0.5) < 1e-9,
    'один период полураспада — ровно половина веса',
  );
  assert.equal(decay.decayFactor(100_000), decay.PRESSURE_DECAY_FLOOR, 'пол не даёт истории обнулиться');
  assert.ok(decay.PRESSURE_DECAY_FLOOR > 0, 'ноль сделал бы старые правила неотличимыми друг от друга');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ арифметики: без знаменателя затухания нет вовсе', () => {
  assert.equal(decay.decayFactor(null), 1, 'нет журнала генераций — вес не трогаем');
  assert.equal(decay.lessonPressure(50, null), 50, 'давление сводится к прежнему счётчику');
});

test('частота: «мерить нечем» и «ноль повторов» — разные факты', () => {
  assert.equal(decay.repeatRate(null, 100), null, '«не измеряем» это не «ноль повторов»');
  assert.equal(decay.repeatRate(3, null), null, 'знаменателя нет — частоты нет');
  assert.equal(decay.repeatRate(0, 100), 0, 'а вот измеренный ноль — это именно ноль');
  assert.equal(decay.repeatRate(1, 4), 0.25);
  assert.equal(decay.repeatRate(50, 10), 1, 'чаще, чем каждую генерацию, дефект возвращаться не может');
});

/* ---------------- вердикт получает знаменатель ---------------- */

test('два повтора на тысячу генераций больше НЕ приговор формулировке', () => {
  assert.equal(
    corpus.classifyLessonEffect(2, 500, 1000),
    'unclear',
    'при растущем трафике улучшение не имеет права выглядеть как деградация',
  );
  assert.equal(corpus.classifyLessonEffect(2, 500, 10), 'fails', 'а два повтора на десять генераций — приговор');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: одна поломка формулировку не опровергает', () => {
  /* Один повтор из пяти генераций — ровно порог частоты (20%), но абсолютный порог
     остаётся: одна поломка могла случиться в генерации, уже шедшей в момент обучения. */
  assert.equal(corpus.classifyLessonEffect(1, 500, 5), 'unclear');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: молодой пробег не даёт приговора по частоте', () => {
  /* Два повтора на четыре генерации — 50%, но судить по четырём генерациям значит
     переписывать формулировку, которую модель почти не видела. */
  assert.equal(corpus.classifyLessonEffect(2, 500, 4), 'unclear');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: без журнала генераций вердикт остаётся прежним, абсолютным', () => {
  assert.equal(corpus.classifyLessonEffect(2, 500), 'fails', 'поведение волны 6 обязано сохраниться');
  assert.equal(corpus.classifyLessonEffect(2, 500, null), 'fails');
  assert.equal(corpus.classifyLessonEffect(0, 500, null), 'works');
  assert.equal(corpus.classifyLessonEffect(null, 500, 1000), 'unmeasured', '«мерить нечем» вердиктом не стало');
});

/* ---------------- затухание меняет очередь в промпт ---------------- */

test('свежий дефект обгоняет мёртвую историю и доходит до модели', () => {
  putGenerations(200);
  putRule({ rule: OLD, count: 50, lastSeenGensAgo: 160 }); // ломал платформу когда-то
  putRule({ rule: FRESH, count: 5, lastSeenGensAgo: 0 }); // ломает прямо сейчас

  assert.deepEqual(promptRules(1), [FRESH], 'промпт обязан предупреждать о том, что ломается, а не что ломалось');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: свежесть сама по себе не побеждает — активно ломающее правило впереди', () => {
  putGenerations(60);
  putRule({ rule: OLD, count: 40, lastSeenGensAgo: 0 });
  putRule({ rule: FRESH, count: 2, lastSeenGensAgo: 0 });

  assert.deepEqual(promptRules(1), [OLD], 'затухание — поправка на свежесть, а не «кто новее, тот и прав»');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: простой платформы не забывает уроки — возраст в генерациях, а не в днях', () => {
  /* Журнал пуст: генераций не было вовсе, хотя по календарю прошёл месяц. */
  putRule({ rule: OLD, count: 50, lastSeenGensAgo: 40_000 });
  putRule({ rule: FRESH, count: 5, lastSeenGensAgo: 0 });

  assert.deepEqual(promptRules(1), [OLD], 'месяц простоя не даёт ни одного факта ни за урок, ни против него');
});

test('затухание меняет очередь, а не переписывает факты', () => {
  putGenerations(200);
  putRule({ rule: OLD, count: 50, lastSeenGensAgo: 160 });
  putRule({ rule: FRESH, count: 5, lastSeenGensAgo: 0 });

  const report = corpus.getLessonsReport(6);
  assert.equal(report.faded, 1, 'ровно одно правило потеряло вес по свежести');

  const fresh = report.taught.find((l) => l.rule === FRESH);
  const old = report.taught.find((l) => l.rule === OLD);
  assert.ok(fresh && old, 'мест хватает обоим: затухание меняет порядок, а не выбрасывает уроки');
  assert.ok(fresh!.decay > 0.9, 'дефект встречался только что — вес почти полный');
  assert.ok(old!.decay < 0.1, 'вес истории уменьшился');
  assert.equal(old!.count, 50, 'счётчик в базе не тронут: дефект, вернувшийся через год, поднимется одним повтором');
  assert.ok(old!.pressure < fresh!.pressure, 'давление свежего дефекта выше');
});

/* ---------------- ГЛАВНЫЙ НЕГАТИВНЫЙ КОНТРОЛЬ ДОСКИ ---------------- */

test('НЕГАТИВНЫЙ КОНТРОЛЬ: полезный урок затуханием НЕ выбрасывается', () => {
  putGenerations(200);
  /* Урок сработал: после начала обучения дефект не возвращался — и именно поэтому его
     `last_seen` замер 180 генераций назад. Наивное затухание вычистило бы из промпта
     ровно то, что работает, и дефект вернулся бы. */
  putRule({ rule: OLD, count: 30, lastSeenGensAgo: 180, taught: { atGensAgo: 190, occurrencesAt: 30, times: 12 } });
  /* Свежий шум: кандидатов больше, чем мест. */
  NOISE.forEach((rule, i) => putRule({ rule, count: 9 - i, lastSeenGensAgo: 0 }));

  const chosen = corpus.selectPromptLessons(4);
  const proven = chosen.find((l) => l.rule === OLD);

  assert.ok(proven, 'сработавший урок обязан остаться в промпте, иначе дефект вернётся');
  assert.equal(proven!.effect, 'works', 'и остаётся он именно как доказанно полезный');
  assert.equal(chosen[0].rule, OLD, 'закреплённая половина мест идёт первой');
  assert.ok(proven!.decay < 0.1, 'при этом урок ЗАТУХШИЙ — значит место ему дало не давление, а доказанная польза');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ: провалившаяся формулировка всё ещё показывается, когда места есть', () => {
  putGenerations(50);
  putRule({ rule: OLD, count: 30, lastSeenGensAgo: 0, taught: { atGensAgo: 40, occurrencesAt: 10, times: 12 } });

  const failing = corpus.selectPromptLessons(6).find((l) => l.rule === OLD);

  assert.ok(failing, 'плохая формулировка лучше пустого места — поведение волны 6 сохранено');
  assert.equal(failing!.effect, 'fails');
  assert.ok(failing!.repeatRate !== null && failing!.repeatRate >= decay.REPEAT_FAIL_RATE);
});

/* ---------------- витрина ---------------- */

test('витрина показывает, чем именно судили урок — частотой или счётчиком', () => {
  putGenerations(100);
  putRule({ rule: OLD, count: 30, lastSeenGensAgo: 5, taught: { atGensAgo: 80, occurrencesAt: 28, times: 20 } });
  putRule({ rule: FRESH, count: 4, lastSeenGensAgo: 0 });

  const report = corpus.getLessonsReport(6);
  assert.equal(report.rateJudged, 1, 'частотой судится только правило с точкой отсчёта');

  const judged = report.taught.find((l) => l.rule === OLD);
  assert.ok(judged!.generationsSinceTeaching !== null && judged!.generationsSinceTeaching > 0);
  assert.ok(judged!.repeatRate !== null && judged!.repeatRate < decay.REPEAT_FAIL_RATE);
  assert.equal(judged!.effect, 'unclear', 'два повтора на восемьдесят генераций — не приговор');

  const untaught = report.taught.find((l) => l.rule === FRESH);
  assert.equal(untaught!.repeatRate, null, 'урок без точки отсчёта частотой не судится');
  assert.equal(untaught!.effect, 'unmeasured');
});

test('НЕГАТИВНЫЙ КОНТРОЛЬ витрины: пустой журнал даёт rateJudged = 0, и это диагноз, а не косметика', () => {
  putRule({ rule: OLD, count: 30, lastSeenGensAgo: 5, taught: { atGensAgo: 80, occurrencesAt: 28, times: 20 } });

  const report = corpus.getLessonsReport(6);
  assert.equal(report.rateJudged, 0, 'журнала нет — значит вердикты выносятся по старому, абсолютному правилу');
  assert.equal(report.faded, 0, 'и затухания тоже нет: знаменателя не существует');
  assert.equal(report.taught.find((l) => l.rule === OLD)!.effect, 'fails', 'ровно как до волны 7');
});
