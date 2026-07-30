import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  withGenerationTelemetry,
  recordAiCall,
  currentTelemetry,
  isTelemetryActive,
  estimateTokens,
  type AiCallRecord,
} from '../lib/generation-telemetry';

/* ================================================================
   OSGARD · Телеметрия генерации (lib/generation-telemetry).

   Смысл модуля: показать человеку, во что обошлась генерация его
   приложения — в реальном времени, а не постфактум. Это главная
   претензия рынка к AI-сборщикам (Lovable/Bolt/v0/Replit): расход
   кредитов выясняется, когда квота уже сожжена.

   Поэтому тесты здесь проверяют не «складывает ли числа», а три
   обещания, которые счётчик даёт пользователю:

   1. ЧЕСТНОСТЬ. Оценка не выдаётся за факт (`estimated`), упавшие
      вызовы считаются (они стоили времени), провайдер без usage не
      превращается в «0 токенов».
   2. ИЗОЛЯЦИЯ. Параллельные генерации не смешивают токены — иначе
      человек увидел бы в своём чеке чужой расход.
   3. БЕЗВРЕДНОСТЬ. Телеметрия не может уронить генерацию: ни вне
      контекста, ни падением слушателя живого счётчика.
   ================================================================ */

/** Хелпер: запись вызова с разумными значениями по умолчанию. */
function call(over: Partial<AiCallRecord> = {}): AiCallRecord {
  return {
    provider: 'openai',
    model: 'gpt-test',
    inputTokens: 100,
    outputTokens: 50,
    ms: 10,
    estimated: false,
    ok: true,
    ...over,
  };
}

/* ---------------- 1. Базовый сбор ---------------- */

test('телеметрия суммирует вызовы, токены и раскладывает по провайдерам', async () => {
  const { telemetry } = await withGenerationTelemetry(async () => {
    recordAiCall(call({ provider: 'openai', inputTokens: 100, outputTokens: 50, ms: 10 }));
    recordAiCall(call({ provider: 'openai', inputTokens: 200, outputTokens: 80, ms: 20 }));
    recordAiCall(call({ provider: 'claude', inputTokens: 300, outputTokens: 120, ms: 30 }));
    return 'ok';
  });

  assert.equal(telemetry.calls, 3);
  assert.equal(telemetry.inputTokens, 600);
  assert.equal(telemetry.outputTokens, 250);
  assert.equal(telemetry.totalTokens, 850, 'totalTokens производен от in+out, разойтись не может');
  assert.equal(telemetry.aiMs, 60);

  assert.equal(telemetry.byProvider.openai.calls, 2);
  assert.equal(telemetry.byProvider.openai.tokens, 430);
  assert.equal(telemetry.byProvider.claude.calls, 1);
  assert.equal(telemetry.byProvider.claude.tokens, 420);
});

test('результат функции проходит через обёртку без изменений', async () => {
  const { result } = await withGenerationTelemetry(async () => ({ files: 7, source: 'ai' }));
  assert.deepEqual(result, { files: 7, source: 'ai' });
});

/* ---------------- 2. Честность цифры ---------------- */

test('вызовы без usage помечаются estimated и попадают в unmeasured, а не в «0 токенов»', async () => {
  const { telemetry } = await withGenerationTelemetry(async () => {
    recordAiCall(call({ estimated: false }));
    recordAiCall(call({ estimated: true, inputTokens: 90, outputTokens: 40 }));
    recordAiCall(call({ estimated: true, inputTokens: 10, outputTokens: 5 }));
  });

  assert.equal(telemetry.calls, 3);
  assert.equal(telemetry.unmeasured, 2, 'два вызова не отдали точный usage — это оговорка к цифре');
  // Оценка всё равно входит в сумму: скрыть её значило бы показать расход меньше реального.
  assert.equal(telemetry.inputTokens, 200);
  assert.equal(telemetry.outputTokens, 95);
});

test('упавшие вызовы считаются: они стоили времени, даже если ничего не вернули', async () => {
  const { telemetry } = await withGenerationTelemetry(async () => {
    recordAiCall(call({ ok: true }));
    recordAiCall(call({ ok: false, inputTokens: 150, outputTokens: 0, ms: 40, estimated: true }));
  });

  assert.equal(telemetry.calls, 2, 'неуспешный вызов — тоже вызов, прятать его нечестно');
  assert.equal(telemetry.failed, 1);
  assert.equal(telemetry.aiMs, 50, 'время упавшего вызова человек прождал так же');
});

test('пустой контекст даёт нули, а не отсутствие данных', async () => {
  const { telemetry } = await withGenerationTelemetry(async () => 'без единого вызова');
  assert.equal(telemetry.calls, 0);
  assert.equal(telemetry.totalTokens, 0);
  assert.equal(telemetry.unmeasured, 0);
  assert.equal(telemetry.failed, 0);
  assert.deepEqual(telemetry.byProvider, {});
  assert.ok(telemetry.elapsedMs >= 0, 'время генерации измеряется даже без вызовов к моделям');
});

/* ---------------- 3. Изоляция параллельных генераций ----------------
   Главный риск счётчика: два пользователя генерируют одновременно, и
   в чеке одного оказывается расход другого. Глобальная переменная дала
   бы ровно это, поэтому контекст на AsyncLocalStorage. */

test('параллельные генерации не смешивают токены', async () => {
  const barrier = { resolve: (): void => {} };
  const gate = new Promise<void>((r) => {
    barrier.resolve = r;
  });

  const first = withGenerationTelemetry(async () => {
    recordAiCall(call({ provider: 'openai', inputTokens: 1000, outputTokens: 100 }));
    // Ждём, пока вторая генерация тоже запишет свой вызов — контексты
    // заведомо переплетены во времени, а не идут друг за другом.
    await gate;
    recordAiCall(call({ provider: 'openai', inputTokens: 1000, outputTokens: 100 }));
    return 'A';
  });

  const second = withGenerationTelemetry(async () => {
    recordAiCall(call({ provider: 'claude', inputTokens: 7, outputTokens: 3 }));
    barrier.resolve();
    return 'B';
  });

  const [a, b] = await Promise.all([first, second]);

  assert.equal(a.result, 'A');
  assert.equal(a.telemetry.calls, 2);
  assert.equal(a.telemetry.totalTokens, 2200);
  assert.deepEqual(Object.keys(a.telemetry.byProvider), ['openai'], 'чужой провайдер в чек не попал');

  assert.equal(b.result, 'B');
  assert.equal(b.telemetry.calls, 1);
  assert.equal(b.telemetry.totalTokens, 10);
  assert.deepEqual(Object.keys(b.telemetry.byProvider), ['claude']);
});

test('контекст наследуется вложенными await-ветками (генерация файлов через Promise.all)', async () => {
  const { telemetry } = await withGenerationTelemetry(async () => {
    // Ровно тот случай, ради которого нужен ALS: файлы приложения
    // генерируются параллельно внутри ОДНОЙ генерации.
    await Promise.all(
      [1, 2, 3, 4].map(async (n) => {
        await new Promise((r) => setTimeout(r, n));
        recordAiCall(call({ inputTokens: 10, outputTokens: 5 }));
      }),
    );
  });

  assert.equal(telemetry.calls, 4, 'ни один вложенный вызов не потерял контекст');
  assert.equal(telemetry.totalTokens, 60);
});

/* ---------------- 4. Безвредность ----------------
   Контракт: счётчик — наблюдатель. Он не имеет права ни уронить
   генерацию, ни изменить её результат. */

test('запись вне контекста — no-op, а не исключение', () => {
  assert.equal(isTelemetryActive(), false);
  assert.equal(currentTelemetry(), null);
  assert.doesNotThrow(() => recordAiCall(call()), 'вызов модели вне генерации не должен падать');
});

test('падение слушателя живого счётчика не ломает генерацию', async () => {
  let recorded = 0;
  const { result, telemetry } = await withGenerationTelemetry(
    async () => {
      recordAiCall(call());
      recordAiCall(call());
      return 'генерация дошла до конца';
    },
    () => {
      recorded += 1;
      throw new Error('слушатель SSE отвалился');
    },
  );

  assert.equal(result, 'генерация дошла до конца');
  assert.equal(recorded, 2, 'слушатель был вызван на каждый вызов модели');
  assert.equal(telemetry.calls, 2, 'падение слушателя не потеряло записи');
});

test('исключение внутри генерации пробрасывается наружу без подмены', async () => {
  await assert.rejects(
    () =>
      withGenerationTelemetry(async () => {
        recordAiCall(call());
        throw new Error('провайдер недоступен');
      }),
    /провайдер недоступен/,
    'телеметрия не имеет права проглотить настоящую ошибку генерации',
  );
});

test('после выхода из контекста активного сбора не остаётся', async () => {
  await withGenerationTelemetry(async () => {
    assert.equal(isTelemetryActive(), true);
    recordAiCall(call());
  });
  assert.equal(isTelemetryActive(), false, 'контекст не должен протекать за пределы генерации');
  assert.equal(currentTelemetry(), null);
});

/* ---------------- 5. Живой счётчик (то, что тикает в интерфейсе) ---------------- */

test('onUpdate отдаёт растущий снимок после каждого вызова — счётчик тикает, а не появляется в конце', async () => {
  const ticks: Array<{ calls: number; total: number }> = [];

  await withGenerationTelemetry(
    async () => {
      recordAiCall(call({ inputTokens: 100, outputTokens: 10 }));
      recordAiCall(call({ inputTokens: 200, outputTokens: 20 }));
      recordAiCall(call({ inputTokens: 300, outputTokens: 30 }));
    },
    (snap) => ticks.push({ calls: snap.calls, total: snap.totalTokens }),
  );

  assert.deepEqual(ticks, [
    { calls: 1, total: 110 },
    { calls: 2, total: 330 },
    { calls: 3, total: 660 },
  ]);
});

test('currentTelemetry внутри генерации виден промежуточный расход (его подмешивает SSE-стадия)', async () => {
  await withGenerationTelemetry(async () => {
    recordAiCall(call({ inputTokens: 40, outputTokens: 60 }));
    const mid = currentTelemetry();
    assert.ok(mid, 'внутри генерации снимок обязан быть доступен');
    assert.equal(mid.calls, 1);
    assert.equal(mid.totalTokens, 100);
  });
});

/* ---------------- 6. Оценка токенов для провайдеров без usage ---------------- */

test('estimateTokens: кириллица дороже латиницы, пустая строка — ноль', () => {
  assert.equal(estimateTokens(''), 0);

  const latin = estimateTokens('a'.repeat(400));
  assert.equal(latin, 100, '≈4 символа на токен для латиницы');

  const cyrillic = estimateTokens('я'.repeat(400));
  assert.equal(cyrillic, 200, '≈2 символа на токен для кириллицы');

  assert.ok(cyrillic > latin, 'русский текст стоит дороже — оценка обязана это учитывать');
});

test('estimateTokens никогда не занижает до нуля непустой текст', () => {
  for (const s of ['a', 'я', '.', '{}']) {
    assert.ok(estimateTokens(s) >= 1, `непустой текст «${s}» не может стоить 0 токенов`);
  }
});
