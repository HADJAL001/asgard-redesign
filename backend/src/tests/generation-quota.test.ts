import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_GENERATION_DAILY_LIMITS,
  planLimit,
  resolveDailyLimit,
  quotaRemaining,
} from '../lib/generation-quota';
import { GENERATION_LIMITS, getGenerationLimit } from '../lib/generationsQuota';
import { SERVICE_BRIDGE_LIMITS, getServiceBridgeLimit } from '../lib/integrationsQuota';

/* ================================================================
   OSGARD · Лимиты по тарифу (lib/generation-quota и потребители).

   ЗАЧЕМ ЭТИ ТЕСТЫ. Дефект нашёлся живой проверкой сметы: аккаунт
   верхнего тарифа получил отказ «дневной лимит быстрых генераций (5)
   исчерпан». Причина — идиома `LIMITS[plan] ?? LIMITS.free`, повторённая
   по всем квотам платформы: в этих таблицах `null` значит «без
   ограничений», а `??` считает null отсутствием значения и подставляет
   лимит БЕСПЛАТНОГО тарифа. Каждый тариф, которому безлимит и был
   обещан, обслуживался по квоте free.

   Вторая половина той же ошибки — устаревший словарь: миграция 050
   переименовала тарифы (architect→pro, master→supreme, legend→elite), а
   таблица лимитов генераций проектов осталась на старых именах, так что
   ни один реальный тариф в неё не попадал.

   Для сметы это не мелочь: платящему человеку она показывала «осталось
   0» вместо «без ограничений» — ровно ту ложь, ради устранения которой
   смета и написана.

   `null` и `0` здесь противоположны («ограничений нет» против «попыток
   нет»), и тесты держат границу между ними.
   ================================================================ */

/* ---------------- разбор значения из тарифной таблицы ---------------- */

test('известный тариф со значением null — безлимит, а не квота free', () => {
  const limits = { free: 5, top: null };
  assert.equal(
    planLimit(limits, 'top'),
    null,
    'подмена null лимитом free и есть тот дефект, из-за которого платный тариф работал как бесплатный',
  );
});

test('незнакомый тариф трактуется осторожно — как бесплатный', () => {
  const limits = { free: 5, top: null };
  assert.equal(planLimit(limits, 'mystery-tier'), 5);
  assert.equal(planLimit(limits, ''), 5);
});

test('имена из прототипа Object тарифами не считаются', () => {
  /* При проверке через `plan in map` plan="constructor" вернул бы функцию вместо числа. */
  const limits = { free: 5, top: null };
  assert.equal(planLimit(limits, 'constructor'), 5);
  assert.equal(planLimit(limits, 'toString'), 5);
});

test('ноль сохраняется как ноль — это лимит, а не отсутствие лимита', () => {
  /* Важно для месячных квот провайдеров, где free/pro честно равны нулю. */
  assert.equal(planLimit({ free: 0, top: 10 }, 'free'), 0);
});

/* ---------------- дневная квота генераций проектов ---------------- */

test('верхний тариф elite генерирует без дневного лимита', () => {
  assert.equal(resolveDailyLimit('elite'), null);
});

test('действующий словарь тарифов (после миграции 050) знает все платные уровни', () => {
  assert.equal(resolveDailyLimit('free'), 5);
  assert.equal(resolveDailyLimit('pro'), 15);
  assert.equal(resolveDailyLimit('supreme'), 40);
  assert.notEqual(
    resolveDailyLimit('duo'),
    PROJECT_GENERATION_DAILY_LIMITS.free,
    'duo стоит выше supreme и по цене, и по комиссии рынка — квота free для него неверна',
  );
});

test('легаси-имена тарифов до миграции 050 сохраняют свои уровни', () => {
  /* Базы, не прошедшие 050, ещё держат старые имена в users.plan. */
  assert.equal(resolveDailyLimit('architect'), 15);
  assert.equal(resolveDailyLimit('master'), 40);
  assert.equal(resolveDailyLimit('legend'), null);
});

test('остаток без лимита — null, а не ноль: это разные утверждения', () => {
  assert.equal(quotaRemaining(null, 0), null);
  assert.equal(
    quotaRemaining(null, 999),
    null,
    'у безлимитного тарифа израсходованное не превращается в исчерпанное',
  );
});

test('остаток не уходит в минус — исчерпанная квота это ровно ноль', () => {
  assert.equal(quotaRemaining(5, 0), 5);
  assert.equal(quotaRemaining(5, 3), 2);
  assert.equal(quotaRemaining(5, 5), 0);
  assert.equal(quotaRemaining(5, 9), 0, 'отрицательный остаток нечитаем и в смете, и в отказе');
});

/* ---------------- тот же дефект в соседних квотах ---------------- */

test('дневная квота генераций оркестратора: безлимитные тарифы безлимитны', () => {
  /* GENERATION_LIMITS: supreme/duo/elite = null. Через `??` все три получали 5. */
  for (const plan of ['supreme', 'duo', 'elite'] as const) {
    assert.equal(GENERATION_LIMITS[plan], null, 'предпосылка теста: тарифу обещан безлимит');
    assert.equal(
      getGenerationLimit(plan),
      null,
      `тариф ${plan} обслуживался по квоте free (${GENERATION_LIMITS.free})`,
    );
  }
  assert.equal(getGenerationLimit('free'), 5);
  assert.equal(getGenerationLimit('pro'), 20);
});

test('дневная квота интеграций: elite без ограничений', () => {
  assert.equal(SERVICE_BRIDGE_LIMITS.elite, null, 'предпосылка теста: elite обещан безлимит');
  assert.equal(getServiceBridgeLimit('elite'), null);
  assert.equal(getServiceBridgeLimit('free'), 20);
  assert.equal(getServiceBridgeLimit('supreme'), 400);
});
