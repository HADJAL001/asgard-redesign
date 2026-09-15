import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_GENERATION_MONTHLY_LIMITS,
  planLimit,
  resolveMonthlyLimit,
  quotaRemaining,
} from '../lib/generation-quota';
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

   ПЕРЕХОД НА МЕСЯЧНУЮ КВОТУ (2026-09). Дневной лимит на дорогой
   multi-agent пайплайн создавал разрыв unit-экономики (см. комментарий
   в lib/generation-quota.ts) — квота переведена на календарный месяц.
   Duo (чистый дубль Supreme) убран, см. migrations/110_remove_duo_plan.ts.
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

/* ---------------- месячная квота генераций проектов ---------------- */

test('действующий словарь тарифов (после миграции 050+110) знает все платные уровни', () => {
  assert.equal(resolveMonthlyLimit('free'), 3);
  assert.equal(resolveMonthlyLimit('pro'), 10);
  assert.equal(resolveMonthlyLimit('supreme'), 35);
  assert.equal(resolveMonthlyLimit('elite'), 70);
});

test('лестница тарифов: каждый следующий тариф даёт лимит не ниже предыдущего', () => {
  const ladder = ['free', 'pro', 'supreme', 'elite'].map(resolveMonthlyLimit);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok((ladder[i] as number) > (ladder[i - 1] as number), `${ladder[i - 1]} -> ${ladder[i]}`);
  }
});

test('duo больше не является известным тарифом (убран как дубль supreme)', () => {
  assert.equal(
    resolveMonthlyLimit('duo'),
    PROJECT_GENERATION_MONTHLY_LIMITS.free,
    'незнакомый тариф трактуется как free — duo не должен иметь отдельной записи',
  );
});

test('легаси-имена тарифов до миграции 050 сохраняют свои уровни', () => {
  /* Базы, не прошедшие 050, ещё держат старые имена в users.plan. */
  assert.equal(resolveMonthlyLimit('architect'), 10);
  assert.equal(resolveMonthlyLimit('master'), 35);
  assert.equal(resolveMonthlyLimit('legend'), 70);
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

test('дневная квота интеграций: elite без ограничений', () => {
  assert.equal(SERVICE_BRIDGE_LIMITS.elite, null, 'предпосылка теста: elite обещан безлимит');
  assert.equal(getServiceBridgeLimit('elite'), null);
  assert.equal(getServiceBridgeLimit('free'), 20);
  assert.equal(getServiceBridgeLimit('supreme'), 400);
});
