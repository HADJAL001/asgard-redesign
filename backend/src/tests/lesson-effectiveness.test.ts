import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Польза урока: отбор в промпт и переписывание (волна 6).

   ЧТО ЗДЕСЬ ЗАЩИЩАЕТСЯ. Волна 5 научила платформу формулировать уроки
   и ИЗМЕРЯТЬ их пользу, но выводов из измерения никто не делал: отбор в
   промпт шёл по одной частоте. Это давало два вывернутых наизнанку
   следствия, и оба здесь закрыты тестами:

     1. Плохой урок ПОДНИМАЕТСЯ. Формулировка не работает → дефект
        повторяется → счётчик растёт → правило лезет в топ. Чем хуже
        урок, тем крепче он держит место в промпте.
     2. Хороший урок ВЫТЕСНЯЕТСЯ. Урок сработал → дефект прекратился →
        частота не растёт → правило выпадает из топа → дефект
        возвращается. Успех выглядит как ненужность.

   Мест в промпте ровно `limit`, поэтому каждый бесполезный урок стоит
   одного полезного. Отсюда же вторая половина волны: провалившаяся
   формулировка переписывается, а прежняя уходит в отвал и больше не
   может быть принята — иначе переписывание крутилось бы по кругу за
   деньги, показывая в витрине «урок обновлён».

   Отдельная забота тестов — НЕГАТИВНЫЙ КОНТРОЛЬ: механизм обязан не
   трогать то, что работает. Рукописные уроки, уроки с одним-двумя
   повторами и уже переписанные однажды правила на переписывание не
   идут; проверяется это здесь, а не рассуждением.

   Сеть не используется: вызов модели передаётся параметром.
   ================================================================ */

let db: any;
let author: typeof import('../lib/lesson-author');
let corpus: typeof import('../lib/craft-corpus');

function reply(payload: Record<string, unknown>): import('../lib/lesson-author').ReasoningCall {
  return async () => JSON.stringify(payload);
}

const FIRST_TEXT =
  'не обращайся к свойствам объекта до проверки на существование: сначала убедись, что значение есть, и только потом читай поле';

const SECOND_TEXT =
  'считай любое значение из данных отсутствующим, пока не доказано обратное: подставляй значение по умолчанию прямо при разборе';

const SAMPLE = {
  rule: 'nullable-access',
  message: "Cannot read properties of undefined (reading 'title')",
  file: 'components/Placeholder.tsx',
  line: 12,
  snippet: 'export default function Placeholder({ note }) {\n  return <h2>{note.title}</h2>\n}',
};

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));
  await import('../migrations/092_craft_corpus');
  await import('../migrations/093_lesson_authoring');
  await import('../migrations/097_lesson_effectiveness');
  await import('../migrations/098_lesson_teaching_baseline');
  corpus = await import('../lib/craft-corpus');
  author = await import('../lib/lesson-author');
});

beforeEach(() => {
  db.exec('DELETE FROM generation_lesson_texts');
  db.exec('DELETE FROM generation_lessons');
  delete process.env.LESSON_AUTHORING;
});

/**
 * Сколько раз урок должен дойти до модели, чтобы ноль повторов стал доказательством
 * (волна 8). Держим числом здесь, а не импортом: тест обязан краснеть, если порог
 * молча изменят в коде.
 */
const PROOF_TEACHINGS = 3;

/**
 * Эмулирует то, что делает генерация: урок ушёл в промпт `times` раз.
 *
 * С волны 8 точка отсчёта пользы ставится ИМЕННО здесь — в момент, когда урок реально
 * доходит до модели, а не в момент авторства. Поэтому фикстуре недостаточно записать
 * текст: без отправки в промпт урок остаётся неизмеряемым, как и в проде.
 */
function teach(rule: string, times = PROOF_TEACHINGS) {
  for (let i = 0; i < times; i++) corpus.markLessonsTaught([rule]);
}

/** Свой (машинный) урок с заданной судьбой: сформулирован на `at`, дефект повторился `repeats` раз. */
async function selfLesson(rule: string, at: number, repeats: number, text = FIRST_TEXT) {
  corpus.recordLessons([{ rule, count: at }]);
  await author.authorMissingLessons([{ ...SAMPLE, rule }], new Map([[rule, at]]), {
    call: reply({ lesson: text, confidence: 0.9 }),
  });
  teach(rule); // урок начал доходить до модели — с этого мгновения он и измеряется
  if (repeats > 0) corpus.recordLessons([{ rule, count: repeats }]);
}

/** Рукописный урок, который уже уходит в промпт: `at` поломок до обучения, `repeats` после. */
function handLesson(rule: string, at: number, repeats: number, times = PROOF_TEACHINGS) {
  corpus.recordLessons([{ rule, count: at }]);
  teach(rule, times);
  if (repeats > 0) corpus.recordLessons([{ rule, count: repeats }]);
}

/* ---------------- классификация пользы ---------------- */

test('вердикт о пользе урока: ноль повторов — работает, два — не работает', () => {
  assert.equal(corpus.classifyLessonEffect(0), 'works');
  assert.equal(corpus.classifyLessonEffect(1), 'unclear');
  assert.equal(corpus.classifyLessonEffect(2), 'fails');
  assert.equal(corpus.classifyLessonEffect(9), 'fails');
});

test('«не измеряем» и «нуль повторов» — разные вещи, а не одно и то же', () => {
  assert.equal(corpus.classifyLessonEffect(null), 'unmeasured');
  assert.notEqual(corpus.classifyLessonEffect(null), corpus.classifyLessonEffect(0));
});

test('один повтор урок не осуждает: генерация могла идти, когда урок только записался', () => {
  assert.equal(corpus.classifyLessonEffect(1), 'unclear', 'иначе рабочие уроки переписывались бы за деньги');
});

/* ---------------- отбор в промпт ---------------- */

test('сработавший урок не вытесняется собственным успехом', async () => {
  /* Расстановка ровно та, на которой ломался отбор по одной частоте: полезный урок
     остановил свой дефект и потому стал самым РЕДКИМ, а два бесполезных обогнали его.
     Мест два — значит при отборе по частоте полезный урок выпадает, дефект возвращается,
     и его частота снова растёт. Проверка обязана этому мешать. */
  await selfLesson('worked-rule', 5, 0); // сработал: 5 поломок и ни одной после урока
  await selfLesson('failed-rule', 3, 20, SECOND_TEXT); // не сработал: 23 поломки
  corpus.recordLessons([{ rule: 'empty-file', count: 15 }]); // рукописный, эффект не измерен

  const chosen = corpus.selectPromptLessons(2).map((l) => l.rule);
  assert.ok(chosen.includes('worked-rule'), 'место за доказанной пользой закреплено');
  assert.equal(chosen.length, 2);
  assert.ok(!chosen.includes('failed-rule'), 'самое частое правило уступило: его формулировка не работает');

  // Закрепляется ПОЛОВИНА мест, не все: иначе новое знание не попадёт в промпт никогда.
  const wide = corpus.selectPromptLessons(6).map((l) => l.rule);
  assert.ok(wide.includes('failed-rule'), 'когда места есть — говорим модели хоть что-то');
});

test('провалившийся урок уходит в конец очереди, а не держит место частотой', async () => {
  await selfLesson('failed-rule', 2, 30, FIRST_TEXT);
  await selfLesson('unclear-rule', 4, 1, SECOND_TEXT);

  const failed = corpus.rankedLessons().find((l) => l.rule === 'failed-rule');
  assert.ok(failed!.count > 30, 'по частоте провалившееся правило впереди');
  assert.equal(failed!.effect, 'fails');

  const chosen = corpus.selectPromptLessons(1).map((l) => l.rule);
  assert.deepEqual(chosen, ['unclear-rule'], 'единственное место досталось не провалившемуся');
});

test('мест меньше, чем уроков — но пустым место не остаётся', async () => {
  await selfLesson('only-failed', 2, 30);
  const chosen = corpus.selectPromptLessons(3);
  assert.equal(chosen.length, 1, 'плохая формулировка лучше пустого места: правило и дефект настоящие');
  assert.equal(chosen[0].rule, 'only-failed');
});

test('витрина показывает ровно то, что уходит в промпт', async () => {
  await selfLesson('worked-rule', 5, 0);
  await selfLesson('failed-rule', 3, 20, SECOND_TEXT);

  const report = corpus.getLessonsReport(1);
  const prompt = corpus.renderLessonsContract(1);
  assert.equal(report.taught.length, 1);
  assert.ok(prompt.includes(report.taught[0].text), 'иначе витрина врёт основателю про обучение');
  assert.equal(report.working, 1);
  assert.equal(report.failing, 1);
});

test('урок, не попавший в промпт, объясняет причину — вина формулировки или редкость дефекта', async () => {
  await selfLesson('worked-rule', 5, 0);
  await selfLesson('failed-rule', 3, 20, SECOND_TEXT);

  const demoted = corpus.getLessonsReport(1).demoted;
  assert.equal(demoted.length, 1);
  assert.equal(demoted[0].rule, 'failed-rule');
  assert.equal(demoted[0].reason, 'не работает', 'редкость и негодность нельзя сливать в одно');
});

test('рукописный урок не объявляется доказанно работающим без измерения', () => {
  corpus.recordLessons([{ rule: 'empty-file', count: 7 }]);
  const hand = corpus.rankedLessons().find((l) => l.rule === 'empty-file');
  assert.equal(hand?.origin, 'hand');
  assert.equal(hand?.effect, 'unmeasured');
  assert.equal(corpus.getLessonsReport().working, 0, 'иначе рукописные заняли бы все закреплённые места');
});

/* ---------------- переписывание провалившейся формулировки ---------------- */

test('провалившийся урок переписывается, прежний текст уходит в отвал', async () => {
  await selfLesson('nullable-access', 3, 20);

  const before = corpus.rankedLessons().find((l) => l.rule === 'nullable-access');
  assert.equal(before?.effect, 'fails');

  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: SECOND_TEXT, confidence: 0.9 }),
  });

  assert.deepEqual(outcome.rejected, []);
  assert.equal(outcome.revised.length, 1);
  assert.equal(outcome.revised[0].previous, FIRST_TEXT);

  const row = corpus.listAuthoredLessons().find((r) => r.rule === 'nullable-access')!;
  assert.equal(row.text, SECOND_TEXT);
  assert.equal(row.revisions, 1);
  assert.deepEqual(row.retiredTexts, [FIRST_TEXT], 'прежняя формулировка помечена негодной');
  assert.ok(row.lastRevisedAt, 'дата ревизии записана: иначе «переписан» неотличим от «такой и был»');
  assert.ok(corpus.renderLessonsContract().includes(SECOND_TEXT), 'до модели доходит новая формулировка');
});

test('новую формулировку судят с нуля, а не по грехам прежней', async () => {
  await selfLesson('nullable-access', 3, 20);
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: SECOND_TEXT, confidence: 0.9 }),
  });

  const after = corpus.rankedLessons().find((l) => l.rule === 'nullable-access')!;
  assert.equal(after.repeatedAfterLearning, 0, 'точка отсчёта сдвинута на момент ревизии');
  assert.equal(after.revisions, 1);
  /* Волна 8: сразу после ревизии вердикт — «идёт измерение», а не «работает». Модель
     новый текст ещё не видела ни разу, и зачесть ему показы прежнего значило бы объявить
     переписывание успешным по факту переписывания. */
  assert.equal(after.effect, 'measuring');

  teach('nullable-access');
  const proven = corpus.rankedLessons().find((l) => l.rule === 'nullable-access')!;
  assert.equal(proven.effect, 'works', 'дефект не вернулся за три отправки в промпт — вот это уже доказательство');
});

test('возврат той же формулировки отклоняется отдельной причиной, текст не меняется', async () => {
  await selfLesson('nullable-access', 3, 20);

  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: `  ${FIRST_TEXT.toUpperCase()}!  `, confidence: 0.95 }),
  });

  assert.equal(outcome.revised.length, 0);
  assert.match(outcome.rejected[0].reason, /отбракованной/);

  const row = corpus.listAuthoredLessons().find((r) => r.rule === 'nullable-access')!;
  assert.equal(row.text, FIRST_TEXT, 'пока новой формулировки нет, прежняя — единственное, что можно сказать модели');
  assert.equal(row.revisions, 0);
  assert.equal(row.attempts, 2, 'провал ревизии стоил попытки — иначе он повторялся бы вечно');
});

test('уже отбракованная формулировка не может вернуться второй раз', async () => {
  await selfLesson('nullable-access', 3, 20);
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: SECOND_TEXT, confidence: 0.9 }),
  });

  const verdict = author.validateLessonText(FIRST_TEXT, { retiredTexts: [FIRST_TEXT] });
  assert.equal(verdict.ok, false);
  assert.match((verdict as any).reason, /отбракованной/);
});

test('модели прямо показывают, что прежний урок не сработал', async () => {
  await selfLesson('nullable-access', 3, 20);

  let prompt = '';
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: async (p) => {
      prompt = p;
      return JSON.stringify({ lesson: SECOND_TEXT, confidence: 0.9 });
    },
  });

  assert.ok(prompt.includes(FIRST_TEXT), 'без прежнего текста модель повторит его же');
  assert.match(prompt, /НЕ СРАБОТАЛИ/);
  assert.match(prompt, /повторился ПОСЛЕ[^\n]*20/, 'число повторов — главный аргумент против прежней формулировки');
});

/* ---------------- негативный контроль: чего механизм трогать не должен ---------------- */

test('урок с одним повтором не переписывается', async () => {
  await selfLesson('nullable-access', 3, 1);
  const candidates = author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons());
  assert.deepEqual(candidates, [], 'иначе платформа ломала бы рабочие формулировки за деньги');
});

test('сработавший урок не переписывается', async () => {
  await selfLesson('nullable-access', 5, 0);
  assert.deepEqual(author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons()), []);
});

test('рукописный урок без точки отсчёта не переписывается: вердикта «не работает» у него нет', () => {
  corpus.recordLessons([{ rule: 'empty-file', count: 40 }]); // в промпт ещё не уходил
  assert.deepEqual(author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons()), []);
});

test('рукописный урок, который работает, не переписывается никогда', () => {
  handLesson('empty-file', 40, 0);
  const hand = corpus.rankedLessons().find((l) => l.rule === 'empty-file')!;
  assert.equal(hand.effect, 'works', 'дефект прекратился после того, как урок дошёл до модели');
  assert.deepEqual(
    author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons()),
    [],
    'иначе платформа спорила бы с разработчиком без всякого повода',
  );
});

test('правило без формулировки не идёт на переписывание — это работа первичного разбора', () => {
  corpus.recordLessons([{ rule: 'unknown-rule', count: 40 }]);
  assert.deepEqual(author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons()), []);
});

test('переписываем один раз: если и вторая формулировка не помогла — это работа человека', async () => {
  await selfLesson('nullable-access', 3, 20);
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: reply({ lesson: SECOND_TEXT, confidence: 0.9 }),
  });

  // Вторая формулировка тоже не помогла — дефект повторяется дальше.
  corpus.recordLessons([{ rule: 'nullable-access', count: 20 }]);
  const failing = corpus.rankedLessons().find((l) => l.rule === 'nullable-access')!;
  assert.equal(failing.effect, 'fails', 'провал виден');
  assert.deepEqual(
    author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons()),
    [],
    'но третьей формулировки за деньги платформы не будет',
  );
});

test('за один прогон переписывается не больше одного правила', async () => {
  await selfLesson('rule-a', 3, 20, FIRST_TEXT);
  await selfLesson('rule-b', 3, 20, SECOND_TEXT);

  let calls = 0;
  await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: async () => {
      calls++;
      return JSON.stringify({ lesson: 'проверяй наличие значения до чтения его свойств и подставляй пустое значение по умолчанию', confidence: 0.9 });
    },
  });
  assert.equal(calls, 1, 'переписывание — такие же деньги, как и первичный разбор');
});

test('первым переписывается самый вредный урок', async () => {
  await selfLesson('mild-rule', 3, 3, FIRST_TEXT);
  await selfLesson('harmful-rule', 3, 40, SECOND_TEXT);

  const candidates = author.pendingRevisionCandidates(corpus.rankedLessons(), corpus.listAuthoredLessons());
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].lesson.rule, 'harmful-rule', 'больше повторов после обучения — больше сломанных генераций');
});

test('аварийный выключатель останавливает и переписывание, а не только разбор', async () => {
  await selfLesson('nullable-access', 3, 20);
  process.env.LESSON_AUTHORING = 'off';

  let called = false;
  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: async () => {
      called = true;
      return null;
    },
  });
  assert.equal(called, false, 'иначе выключатель глушил бы половину самообучения');
  assert.deepEqual(outcome.revised, []);
});

test('недоступность модели при ревизии не роняет ничего и видна причиной', async () => {
  await selfLesson('nullable-access', 3, 20);

  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: async (_p, _t, _s, onFailure) => {
      onFailure('HTTP 502 Bad Gateway');
      return null;
    },
  });

  assert.match(outcome.rejected[0].reason, /502/);
  const row = corpus.listAuthoredLessons().find((r) => r.rule === 'nullable-access')!;
  assert.equal(row.text, FIRST_TEXT, 'урок остался на месте');
  assert.match(row.lastError!, /502/);
});

test('сбой вызова при ревизии не выходит наружу', async () => {
  await selfLesson('nullable-access', 3, 20);
  const outcome = await author.reviseFailedLessons(corpus.rankedLessons(), corpus.listAuthoredLessons(), {
    call: async () => {
      throw new Error('сеть оборвалась');
    },
  });
  assert.deepEqual(outcome.revised, []);
});

test('битый JSON в отвале читается как пустой список, а не роняет память платформы', async () => {
  await selfLesson('nullable-access', 3, 20);
  db.prepare(`UPDATE generation_lesson_texts SET retired_texts = '{не json' WHERE rule = ?`).run('nullable-access');

  const row = corpus.listAuthoredLessons().find((r) => r.rule === 'nullable-access')!;
  assert.deepEqual(row.retiredTexts, []);
  assert.equal(row.text, FIRST_TEXT);
});
