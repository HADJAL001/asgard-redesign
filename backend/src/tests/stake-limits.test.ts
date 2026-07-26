import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stakeMaxForPlan } from '../routes/stakes.routes';

/* ================================================================
   OSGARD · Потолок одного стейка по тарифу.

   Зачем тест: до этой правки число жило ТОЛЬКО внутри POST /stakes и
   всплывало 400-й ошибкой уже после нажатия кнопки, а поле суммы на
   фронте принимало любое значение и рисовало прогноз дохода по сумме,
   которую невозможно застейкать. Теперь тот же потолок отдаётся в
   GET /stakes → limits и клампит поле. Раз число стало ПУБЛИЧНЫМ
   контрактом (его показывают пользователю), оно закрывается тестом:
   молчаливый сдвиг лестницы тарифов сразу уронит прогон.
   ================================================================ */

test('лестница тарифов: каждый следующий тариф даёт потолок не ниже предыдущего', () => {
  const ladder = ['free', 'pro', 'supreme', 'duo', 'elite'].map(stakeMaxForPlan);
  for (let i = 1; i < ladder.length; i++) {
    assert.ok(
      ladder[i] > ladder[i - 1],
      `тариф #${i} (${ladder[i]}) должен быть строго выше предыдущего (${ladder[i - 1]})`,
    );
  }
});

test('известные тарифы дают ожидаемые потолки', () => {
  assert.equal(stakeMaxForPlan('free'), 100);
  assert.equal(stakeMaxForPlan('pro'), 1_000);
  assert.equal(stakeMaxForPlan('supreme'), 5_000);
  assert.equal(stakeMaxForPlan('duo'), 20_000);
  assert.equal(stakeMaxForPlan('elite'), 100_000);
});

test('неизвестный/пустой тариф трактуется как free (консервативно, не безлимит)', () => {
  const free = stakeMaxForPlan('free');
  assert.equal(stakeMaxForPlan('legacy-plan-that-no-longer-exists'), free);
  assert.equal(stakeMaxForPlan(''), free);
  assert.equal(stakeMaxForPlan(null), free);
  assert.equal(stakeMaxForPlan(undefined), free);
});

test('потолок всегда конечное положительное число (поле суммы на него клампится)', () => {
  for (const plan of ['free', 'pro', 'supreme', 'duo', 'elite', 'нет-такого']) {
    const max = stakeMaxForPlan(plan);
    assert.ok(Number.isFinite(max), `${plan}: потолок обязан быть конечным`);
    assert.ok(max > 0, `${plan}: потолок обязан быть положительным`);
  }
});
