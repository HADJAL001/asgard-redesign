import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateGenerationCost,
  estimateAllDepths,
  spreadOf,
  MIN_ESTIMATE_SAMPLES,
  SPREAD_MIN_COVERAGE,
  type GenerationSample,
} from '../lib/generation-estimate';

/* ================================================================
   OSGARD · Смета генерации ДО запуска (lib/generation-estimate).

   ЧТО ЗДЕСЬ ЗАЩИЩАЕТСЯ. Миграция 095 научила платформу честно называть
   расход ПОСЛЕ генерации. Смета обещает большее: назвать его ДО — то
   есть до того, как списана квота или кредиты. Такое обещание опасно
   ровно одним способом: смета, которая врёт, хуже отсутствующей. Она
   переносит риск на пользователя, при этом выглядя заботой.

   Поэтому тесты проверяют не «умеет ли модуль считать медиану», а пять
   обещаний, которые смета даёт человеку перед кнопкой:

   0. КОРИДОР НАКРЫВАЕТ ПОЧТИ ВСЕ ЗАПУСКИ. Самое дорогое обещание сметы —
      слова «обычно от… до…». Тест проверяет его как свойство, а не как
      совпадение индексов: доля наблюдений внутри границ обязана быть не
      ниже SPREAD_MIN_COVERAGE на любых данных. Прежний межквартильный
      размах это обещание нарушал by design (накрывал ровно половину), и
      живая проверка поймала его на настоящих генерациях.
   1. ТИПИЧНЫЙ СЛУЧАЙ, А НЕ СРЕДНИЙ. Ориентир внутри коридора — медиана:
      одна аварийная генерация с десятком раундов ремонта не имеет права
      сдвинуть смету, среднее она ломает, медиана — нет.
   2. ПРОФИЛЬ, А НЕ ОБЩИЙ КОТЁЛ. Шаблонный путь дешевле полной AI-сборки
      на порядок. Смета обязана считать по своему профилю, иначе она
      систематически обманывает — в обе стороны.
   3. ЧЕСТНОЕ «НЕ ЗНАЮ». Мало данных → числа не выдаются вовсе. Кредиты и
      квота при этом известны точно и отдаются всегда.
   4. ОГОВОРКА К ТОЧНОСТИ ВИДНА. Часть провайдеров не отдаёт usage; доля
      таких вызовов выходит наружу, а не прячется в «точной» цифре.

   Ни БД, ни сети: история передаётся аргументом (урок волны 5 —
   NODE_ENV под `tsx --test` остаётся undefined, и полагаться на него
   внутри модуля нельзя).
   ================================================================ */

/** Замеренная генерация с разумными значениями по умолчанию. */
function sample(over: Partial<GenerationSample> = {}): GenerationSample {
  return {
    depth: 'quick',
    path: 'template',
    calls: 4,
    tokens: 20_000,
    durationMs: 30_000,
    firstTry: true,
    unmeasured: 0,
    ...over,
  };
}

/** n однотипных наблюдений — «история платформы» нужного размера. */
function history(n: number, over: Partial<GenerationSample> = {}): GenerationSample[] {
  return Array.from({ length: n }, () => sample(over));
}

/* ---------------- статистика: типичный случай и коридор ---------------- */

test('коридор накрывает почти все наблюдения — это и есть обещание «обычно от… до…»', () => {
  /* Проверяется свойство, а не конкретные индексы: смета вправе менять способ
     подсчёта границ, но не вправе снижать покрытие. Прежний размах p25–p75 давал
     здесь ровно 0.5 и этот тест валил бы — что и требуется. */
  const datasets = [
    [10, 20, 30, 40, 100],
    [226, 248, 301, 344, 390, 412, 455, 470, 512, 548], // настоящие токены живой проверки, тыс.
    [48, 52, 55, 61, 62, 68, 74, 80, 84, 88], // настоящие обращения к ИИ живой проверки
    Array.from({ length: 37 }, (_, i) => i * i), // сильно скошенное распределение
  ];

  for (const values of datasets) {
    const s = spreadOf(values)!;
    const inside = values.filter((v) => v >= s.low && v <= s.high).length / values.length;
    assert.ok(
      inside >= SPREAD_MIN_COVERAGE,
      `коридор ${s.low}–${s.high} накрыл ${Math.round(inside * 100)}% наблюдений — ` +
        `подпись «обычно от… до…» соврала бы ${Math.round((1 - inside) * 100)}% людей`,
    );
  }
});

test('ориентир лежит внутри коридора, а не рядом с ним', () => {
  const s = spreadOf([226, 248, 301, 344, 390, 412, 455, 470, 512, 548])!;
  assert.ok(s.low <= s.median && s.median <= s.high, 'ориентир вне своего же коридора — бессмыслица');
  assert.ok(s.low < s.high, 'схлопнутый коридор выдавал бы разброс за точность');
});

test('коридор шире межквартильного размаха — иначе правка p10–p90 не состоялась', () => {
  /* Негативный контроль самой правки: на скошенных данных возврат к p25–p75 обязан
     сузить коридор. Если этот тест зелёный при любых константах, он ничего не стережёт. */
  const values = [226, 248, 301, 344, 390, 412, 455, 470, 512, 548];
  const s = spreadOf(values)!;
  const sorted = [...values].sort((a, b) => a - b);
  const iqrLow = sorted[Math.ceil(0.25 * sorted.length) - 1];
  const iqrHigh = sorted[Math.ceil(0.75 * sorted.length) - 1];
  assert.ok(s.high - s.low > iqrHigh - iqrLow, 'p10–p90 обязан быть шире p25–p75');
});

test('пустая выборка не превращается в нули: коридора нет вовсе', () => {
  assert.equal(spreadOf([]), null, 'ноль токенов и «не знаем» — разные утверждения');
});

test('одна аварийная генерация не сдвигает смету (медиана, а не среднее)', () => {
  const rows = [...history(4, { tokens: 100_000 }), sample({ tokens: 5_000_000 })];
  const estimate = estimateGenerationCost({ depth: 'quick', path: 'template', samples: rows });

  assert.equal(estimate.tokens?.median, 100_000);
  const average = rows.reduce((sum, r) => sum + r.tokens, 0) / rows.length;
  assert.ok(
    estimate.tokens!.median < average / 5,
    `среднее (${Math.round(average)}) обмануло бы человека втрое-вдесятеро`,
  );
});

/* ---------------- профиль: шаблон и полная AI-сборка — разные деньги ---------------- */

test('смета считается по своему профилю: шаблонный путь не удорожается AI-историей', () => {
  const rows = [
    ...history(5, { path: 'template', depth: 'quick', tokens: 20_000, calls: 3 }),
    ...history(5, { path: 'ai', depth: 'quick', tokens: 400_000, calls: 80 }),
  ];

  const viaTemplate = estimateGenerationCost({ depth: 'quick', path: 'template', samples: rows });
  const viaAi = estimateGenerationCost({ depth: 'quick', path: 'ai', samples: rows });

  assert.equal(viaTemplate.basis, 'profile');
  assert.equal(viaTemplate.tokens?.median, 20_000);
  assert.equal(viaAi.tokens?.median, 400_000);
  assert.ok(
    viaAi.tokens!.median > viaTemplate.tokens!.median * 10,
    'разница путей на порядок — усреднив их, смета врала бы обеим сторонам',
  );
});

test('глубина тоже разделяет выборку: deep не оценивается по quick', () => {
  const rows = [
    ...history(4, { depth: 'quick', path: 'ai', tokens: 50_000 }),
    ...history(4, { depth: 'deep', path: 'ai', tokens: 500_000 }),
  ];
  assert.equal(estimateGenerationCost({ depth: 'deep', path: 'ai', samples: rows }).tokens?.median, 500_000);
});

test('точных совпадений мало — базис расширяется, и это видно в ответе', () => {
  /* Один шаблонный замер (мало) + достаточно AI-замеров той же глубины. */
  const rows = [sample({ path: 'template', tokens: 1_000 }), ...history(4, { path: 'ai', tokens: 300_000 })];
  const estimate = estimateGenerationCost({ depth: 'quick', path: 'template', samples: rows });

  assert.equal(estimate.basis, 'depth', 'подмена базиса без огласки была бы тихим враньём');
  assert.equal(estimate.samples, 5);
});

test('нет данных по глубине — считаем по платформе, но не выдаём это за профиль', () => {
  const rows = history(6, { depth: 'quick', path: 'ai' });
  const estimate = estimateGenerationCost({ depth: 'deep', path: 'ai', samples: rows });
  assert.equal(estimate.basis, 'platform');
});

/* ---------------- честное «не знаю» ---------------- */

test(`меньше ${MIN_ESTIMATE_SAMPLES} наблюдений — числа не выдаются вовсе`, () => {
  const estimate = estimateGenerationCost({
    depth: 'standard',
    path: 'ai',
    samples: history(MIN_ESTIMATE_SAMPLES - 1),
  });

  assert.equal(estimate.basis, 'none');
  assert.equal(estimate.tokens, null);
  assert.equal(estimate.aiCalls, null);
  assert.equal(estimate.durationMs, null);
  assert.equal(estimate.firstTryRate, null);
});

test('без истории всё равно известно точно: кредиты и расход квоты', () => {
  const quick = estimateGenerationCost({ depth: 'quick', path: 'ai', samples: [] });
  const deep = estimateGenerationCost({ depth: 'deep', path: 'ai', samples: [] });

  assert.equal(quick.credits, 0);
  assert.equal(quick.countsAgainstQuota, true, 'цена быстрой генерации измеряется квотой, а не кредитами');
  assert.equal(deep.credits, 50);
  assert.equal(deep.countsAgainstQuota, false);
  assert.equal(deep.basis, 'none', 'твёрдая часть цены не превращает предсказание расхода в известное');
});

/* ---------------- качество, а не только цена ---------------- */

test('доля «с первого раза» считается только по измеренным генерациям', () => {
  const rows = [
    ...history(2, { firstTry: true }),
    ...history(2, { firstTry: false }),
    ...history(4, { firstTry: null }), // до миграции 095 признак не фиксировался
  ];
  const estimate = estimateGenerationCost({ depth: 'quick', path: 'template', samples: rows });

  assert.equal(estimate.firstTryRate, 0.5, 'неизмеренное нельзя записать ни в успех, ни в провал');
});

test('когда признак не измерялся ни у одной генерации — null, а не ноль', () => {
  const estimate = estimateGenerationCost({
    depth: 'quick',
    path: 'template',
    samples: history(5, { firstTry: null }),
  });
  assert.equal(estimate.firstTryRate, null);
});

/* ---------------- оговорка к точности ---------------- */

test('доля вызовов без usage выходит наружу — цифра честна в своих границах', () => {
  const rows = history(4, { calls: 10, unmeasured: 5 });
  const estimate = estimateGenerationCost({ depth: 'quick', path: 'template', samples: rows });
  assert.equal(estimate.unmeasuredShare, 0.5);
});

test('нет вызовов вовсе — доля неизмеренного ноль, а не деление на ноль', () => {
  const estimate = estimateGenerationCost({
    depth: 'quick',
    path: 'template',
    samples: history(4, { calls: 0, unmeasured: 0 }),
  });
  assert.equal(estimate.unmeasuredShare, 0);
  assert.equal(estimate.aiCalls?.median, 0, 'ноль обращений к ИИ — валидный шаблонный путь, а не отсутствие данных');
});

/* ---------------- смета по всем глубинам сразу ---------------- */

test('смета отдаётся по всем глубинам: выбор осознан ДО списания, а не после', () => {
  const rows = [
    ...history(4, { depth: 'quick', path: 'template', tokens: 20_000 }),
    ...history(4, { depth: 'standard', path: 'ai', tokens: 300_000 }),
    ...history(4, { depth: 'deep', path: 'ai', tokens: 600_000 }),
  ];

  const all = estimateAllDepths({
    samples: rows,
    pathByDepth: { quick: 'template', standard: 'ai', deep: 'ai' },
  });

  assert.deepEqual(Object.keys(all).sort(), ['deep', 'quick', 'standard']);
  assert.equal(all.quick.tokens?.median, 20_000);
  assert.equal(all.standard.tokens?.median, 300_000);
  assert.equal(all.deep.tokens?.median, 600_000);
  assert.ok(
    all.quick.tokens!.median < all.deep.tokens!.median,
    'если бы дешёвая глубина выглядела дороже глубокой, человек выбирал бы наугад',
  );
});

test('путь по глубине берётся из плана генерации, а не угадывается модулем', () => {
  /* Тот же набор истории, разные предсказания пути → разные сметы: модуль не имеет
     собственного мнения о том, подберётся ли шаблон, и это правильно — мнение есть у
     planGeneration, и оно совпадает с фактическим выбором. */
  const rows = [
    ...history(4, { depth: 'quick', path: 'template', tokens: 20_000 }),
    ...history(4, { depth: 'quick', path: 'ai', tokens: 400_000 }),
  ];

  const withTemplate = estimateAllDepths({
    samples: rows,
    pathByDepth: { quick: 'template', standard: 'ai', deep: 'ai' },
  });
  const withoutTemplate = estimateAllDepths({
    samples: rows,
    pathByDepth: { quick: 'ai', standard: 'ai', deep: 'ai' },
  });

  assert.equal(withTemplate.quick.tokens?.median, 20_000);
  assert.equal(withoutTemplate.quick.tokens?.median, 400_000);
});
