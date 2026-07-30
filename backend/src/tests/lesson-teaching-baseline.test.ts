import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Точка отсчёта есть у КАЖДОГО урока (волна 8, миграция 098).

   ЧТО ЗДЕСЬ ЗАЩИЩАЕТСЯ. Волны 5 и 6 умели мерить пользу урока и
   реагировать на измерение — и на проде оба механизма оказались
   ИНЕРТНЫ. Цепочка была такая: у всех боевых правил формулировка
   рукописная → авторство волны 5 не срабатывает ни разу → у рукописного
   урока нет момента, с которого считать повторы → волне 6 нечего
   классифицировать → ревизия не запускается. Витрина показывала
   `working: 0, failing: 0` и показывала бы вечно.

   Волна 8 завела точку отсчёта в `generation_lessons` — рядом со
   счётчиком, к которому она относится, — и привязала её к РЕАЛЬНОМУ
   событию: урок ушёл в промпт. Отсюда три вещи, которые проверяются
   ниже, и каждая может сломаться незаметно:

     1. Точку отсчёта ставит отправка в промпт, а НЕ просмотр витрины.
        Иначе измерение стало бы функцией наблюдателя: открыл страницу —
        начал учить.
     2. Ноль повторов у урока, который модель видела один раз, — это
        отсутствие данных, а не доказательство пользы. Без порога зрелости
        миграция мгновенно объявила бы все рукописные уроки доказанно
        работающими и закрепила бы за ними половину мест в промпте.
     3. Рукописная формулировка уступает машинной ровно тогда, когда
        ИЗМЕРЕННО не работает, — и не раньше. Это снятие безусловного
        приоритета рукописного текста, поэтому его границы проверяются
        отдельно, а не рассуждением.

   Сеть не используется: вызов модели передаётся параметром.
   ================================================================ */

let db: any;
let corpus: typeof import('../lib/craft-corpus');
let author: typeof import('../lib/lesson-author');
let migration: typeof import('../migrations/098_lesson_teaching_baseline');

/** Сколько отправок в промпт превращают «ноль повторов» в доказательство. */
const PROOF_TEACHINGS = 3;

/** Рукописное правило: формулировка живёт в коде (craft-corpus:LESSON_TEXT). */
const HAND_RULE = 'empty-file';

const REPLACEMENT =
  'пустой файл модель отдавать не должна: если содержимого нет, не создавай файл вовсе';

function reply(payload: Record<string, unknown>): import('../lib/lesson-author').ReasoningCall {
  return async () => JSON.stringify(payload);
}

function teach(rule: string, times = 1) {
  for (let i = 0; i < times; i++) corpus.markLessonsTaught([rule]);
}

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  await import('../migrations/092_craft_corpus');
  await import('../migrations/093_lesson_authoring');
  await import('../migrations/097_lesson_effectiveness');
  migration = await import('../migrations/098_lesson_teaching_baseline');
  corpus = await import('../lib/craft-corpus');
  author = await import('../lib/lesson-author');
});

beforeEach(() => {
  db.exec('DELETE FROM generation_lesson_texts');
  db.exec('DELETE FROM generation_lessons');
  delete process.env.LESSON_AUTHORING;
});

/* ---------------- сама точка отсчёта ---------------- */

test('до первой отправки в промпт урок не измеряется — и это не ноль повторов', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 9 }]);

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(lesson.repeatedAfterLearning, null, 'точки отсчёта нет — null, а не 0');
  assert.equal(lesson.effect, 'unmeasured');
  assert.equal(lesson.taughtFrom, null);
});

test('отправка урока в промпт начинает отсчёт и запоминает счётчик повторов', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 9 }]);
  teach(HAND_RULE);

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.ok(lesson.taughtFrom, 'момент начала обучения записан');
  assert.equal(lesson.repeatedAfterLearning, 0, 'после начала обучения дефект пока не повторялся');

  corpus.recordLessons([{ rule: HAND_RULE, count: 4 }]);
  const after = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(after.count, 13);
  assert.equal(after.repeatedAfterLearning, 4, 'считаются только повторы ПОСЛЕ точки отсчёта');
});

test('точка отсчёта ставится один раз: следующие отправки её не сдвигают', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]);
  teach(HAND_RULE);
  const first = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!.taughtFrom;

  corpus.recordLessons([{ rule: HAND_RULE, count: 7 }]); // дефект повторился
  teach(HAND_RULE, 2); // урок ушёл в промпт ещё дважды

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(lesson.taughtFrom, first, 'иначе каждая генерация обнуляла бы повторы');
  assert.equal(lesson.repeatedAfterLearning, 7, 'сдвиг точки скрыл бы провал формулировки');
  assert.equal(lesson.taughtTimes, 3, 'пробег растёт на каждой отправке');
});

test('точку отсчёта ставит промпт, а не витрина', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 6 }]);

  corpus.getLessonsReport();
  corpus.selectPromptLessons(6);
  assert.equal(
    corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!.taughtFrom,
    null,
    'иначе обучение начиналось бы от открытия /dev/memory — измерение стало бы функцией наблюдателя',
  );

  corpus.renderLessonsContract(6);
  assert.ok(
    corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!.taughtFrom,
    'а вот сборка промпта — это и есть «урок дошёл до модели»',
  );
});

test('правило без формулировки не получает точки отсчёта даже из промпта', () => {
  corpus.recordLessons([{ rule: 'unknown-rule', count: 30 }]);
  corpus.renderLessonsContract(6);

  const row = db.prepare('SELECT taught_from FROM generation_lessons WHERE rule = ?').get('unknown-rule');
  assert.equal(row.taught_from, null, 'в промпт оно не уходило: формулировки нет, учить нечем');
});

/* ---------------- зрелость: доказательство требует пробега ---------------- */

test('ноль повторов при малом пробеге — «идёт измерение», а не «работает»', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 12 }]);
  teach(HAND_RULE, PROOF_TEACHINGS - 1);

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(lesson.repeatedAfterLearning, 0);
  assert.equal(lesson.effect, 'measuring', 'один-два показа ничего не доказывают');
  assert.equal(corpus.getLessonsReport().working, 0, 'иначе витрина соврала бы на следующий день после миграции');
  assert.equal(corpus.getLessonsReport().measuring, 1, 'но и молчать нельзя: измерение идёт, и это видно числом');
});

test('пробег набран, повторов нет — вот теперь урок доказанно работает', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 12 }]);
  teach(HAND_RULE, PROOF_TEACHINGS);

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(lesson.effect, 'works');
  assert.equal(corpus.getLessonsReport().working, 1, 'ровно то число, которое на проде было обречено на ноль');
});

test('провал зрелости не требует: два повтора осуждают формулировку сразу', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 4 }]);
  teach(HAND_RULE); // один показ — пробега для доказательства пользы мало
  corpus.recordLessons([{ rule: HAND_RULE, count: 2 }]);

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(lesson.effect, 'fails', 'дефект вернулся после урока — это факт против формулировки');
});

test('доказанно работающий рукописный урок закрепляет место в промпте', () => {
  /* Расстановка, на которой отбор по одной частоте выкидывал полезный урок: он
     остановил свой дефект и стал самым редким. */
  corpus.recordLessons([{ rule: HAND_RULE, count: 3 }]);
  teach(HAND_RULE, PROOF_TEACHINGS);
  corpus.recordLessons([{ rule: 'syntax', count: 40 }]);
  corpus.recordLessons([{ rule: 'markdown-leak', count: 30 }]);

  const chosen = corpus.selectPromptLessons(2).map((l) => l.rule);
  assert.ok(chosen.includes(HAND_RULE), 'до волны 8 рукописный урок не мог занять закреплённое место');
  assert.equal(chosen.length, 2);
});

/* ---------------- grandfather: что делает сама миграция ---------------- */

test('миграция начинает отсчёт рукописным правилам, а правило без формулировки не трогает', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 25 }]);
  corpus.recordLessons([{ rule: 'unknown-rule', count: 25 }]);
  db.exec('UPDATE generation_lessons SET taught_from = NULL, occurrences_at_teaching = NULL, taught_times = 0');

  migration.runLessonTeachingBaselineMigration();

  const hand = db.prepare('SELECT * FROM generation_lessons WHERE rule = ?').get(HAND_RULE);
  assert.ok(hand.taught_from, 'рукописный урок давно уходит в промпт — отсчёт начинается сейчас');
  assert.equal(hand.occurrences_at_teaching, 25, 'прошлые повторы новой формулировке не в укор');

  const unknown = db.prepare('SELECT * FROM generation_lessons WHERE rule = ?').get('unknown-rule');
  assert.equal(unknown.taught_from, null, 'формулировки нет — обучения не было, и выдавать миграцию за него нельзя');
});

test('миграция не сдвигает уже начатое измерение при повторном запуске', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 10 }]);
  teach(HAND_RULE);
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]); // дефект повторился после урока

  migration.runLessonTeachingBaselineMigration();

  const lesson = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(lesson.repeatedAfterLearning, 5, 'иначе перезапуск сервера стирал бы провал формулировки');
});

test('миграция переносит измерение машинного урока, а не обнуляет его', async () => {
  corpus.recordLessons([{ rule: 'nullable-access', count: 3 }]);
  await author.authorMissingLessons(
    [{ rule: 'nullable-access', message: 'Cannot read properties of undefined', file: 'a.tsx', line: 1, snippet: 'x' }],
    new Map([['nullable-access', 3]]),
    { call: reply({ lesson: REPLACEMENT, confidence: 0.9 }) },
  );
  corpus.recordLessons([{ rule: 'nullable-access', count: 6 }]);
  db.exec('UPDATE generation_lessons SET taught_from = NULL, occurrences_at_teaching = NULL, taught_times = 0');

  migration.runLessonTeachingBaselineMigration();

  const row = db.prepare('SELECT * FROM generation_lessons WHERE rule = ?').get('nullable-access');
  assert.equal(row.occurrences_at_teaching, 3, 'точка отсчёта волны 5 сохранена, а не сброшена на текущий счётчик');
  assert.equal(
    corpus.rankedLessons().find((l) => l.rule === 'nullable-access')!.repeatedAfterLearning,
    6,
    'повторы после обучения не потерялись при переносе',
  );
});

/* ---------------- замена провалившейся рукописной формулировки ---------------- */

test('провалившийся рукописный урок переписывается, и замена доходит до модели', async () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]);
  teach(HAND_RULE);
  corpus.recordLessons([{ rule: HAND_RULE, count: 20 }]); // рукописный текст не помог

  const before = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(before.effect, 'fails');
  const handText = before.text;

  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: REPLACEMENT, confidence: 0.9 }),
  });

  assert.deepEqual(outcome.rejected, []);
  assert.equal(outcome.revised.length, 1);
  assert.equal(outcome.revised[0].previous, handText, 'в отвал уходит именно рукописный текст');

  const row = corpus.listAuthoredLessons().find((r) => r.rule === HAND_RULE)!;
  assert.equal(row.text, REPLACEMENT);
  assert.equal(row.supersedesHandwritten, true, 'без этого флага замена не дошла бы до модели');
  assert.deepEqual(row.retiredTexts, [handText], 'иначе модель вернула бы ту же фразу за деньги');

  assert.equal(corpus.resolveLessonText(HAND_RULE), REPLACEMENT, 'приоритет рукописного уступил измерению');
  assert.ok(corpus.renderLessonsContract().includes(REPLACEMENT));
});

test('замена судится с нуля: провал прежней формулировки ей не наследуется', async () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]);
  teach(HAND_RULE);
  corpus.recordLessons([{ rule: HAND_RULE, count: 20 }]);
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: REPLACEMENT, confidence: 0.9 }),
  });

  const after = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!;
  assert.equal(after.repeatedAfterLearning, 0, 'точка отсчёта сдвинута на момент замены');
  assert.equal(after.taughtTimes, 0, 'новый текст модель ещё не видела ни разу');
  assert.equal(after.effect, 'measuring', 'и потому он пока не «работает», а «измеряется»');
  assert.equal(after.origin, 'self', 'формулировка теперь машинная — витрина обязана это показывать');
});

test('неудачная попытка замены не отбирает у рукописного текста приоритет', async () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]);
  teach(HAND_RULE);
  corpus.recordLessons([{ rule: HAND_RULE, count: 20 }]);
  const handText = corpus.rankedLessons().find((l) => l.rule === HAND_RULE)!.text;

  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: 'см. https://example.com/rules', confidence: 0.9 }),
  });

  assert.equal(outcome.revised.length, 0);
  assert.equal(corpus.resolveLessonText(HAND_RULE), handText, 'пока замены нет, рукописный текст остаётся главным');

  const row = corpus.listAuthoredLessons().find((r) => r.rule === HAND_RULE)!;
  assert.equal(row.text, null);
  assert.equal(row.supersedesHandwritten, false);
  assert.equal(row.attempts, 1, 'попытка записана — иначе платформа жгла бы вызовы на этом правиле вечно');
});

test('предел попыток работает и для рукописного правила', async () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]);
  teach(HAND_RULE);
  corpus.recordLessons([{ rule: HAND_RULE, count: 20 }]);
  db.prepare('UPDATE generation_lesson_texts SET attempts = 4 WHERE rule = ?').run(HAND_RULE);
  db.prepare(
    `INSERT INTO generation_lesson_texts (rule, text, source, attempts, occurrences_at_authoring, created_at, updated_at)
     VALUES (?, NULL, 'ai', 4, 0, 0, 0) ON CONFLICT(rule) DO UPDATE SET attempts = 4`,
  ).run(HAND_RULE);

  assert.deepEqual(
    author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons()),
    [],
    'потолок расхода на правило не зависит от того, кто написал прежний текст',
  );
});

test('аварийный выключатель глушит и замену рукописного', async () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 5 }]);
  teach(HAND_RULE);
  corpus.recordLessons([{ rule: HAND_RULE, count: 20 }]);
  process.env.LESSON_AUTHORING = 'off';

  let called = false;
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: async () => {
      called = true;
      return null;
    },
  });

  assert.equal(called, false);
  assert.equal(corpus.listAuthoredLessons().length, 0, 'выключенное самообучение не оставляет следов в памяти');
});

/* ---------------- обратная совместимость ---------------- */

test('отметка отправки в промпт не роняет генерацию на схеме без 098', () => {
  corpus.recordLessons([{ rule: HAND_RULE, count: 3 }]);
  db.exec('ALTER TABLE generation_lessons RENAME COLUMN taught_from TO taught_from_gone');
  try {
    assert.doesNotThrow(() => corpus.markLessonsTaught([HAND_RULE]));
    assert.doesNotThrow(() => corpus.renderLessonsContract(3));
  } finally {
    db.exec('ALTER TABLE generation_lessons RENAME COLUMN taught_from_gone TO taught_from');
  }
});
