import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuseStats, fusedRarity, fusionHint } from '../lib/artifact-fusion';

/* Чистая логика фьюжна — детерминирована, БД не нужна. */

const A = { power: 40, defense: 20, magic: 30, speed: 10 };
const B = { power: 60, defense: 40, magic: 50, speed: 30 };

test('fuseStats без мутации: среднее родителей', () => {
  assert.deepEqual(fuseStats(A, B, false), { power: 50, defense: 30, magic: 40, speed: 20 });
});

test('fuseStats с мутацией: усиление ×1.3, потолок 99', () => {
  const m = fuseStats(A, B, true);
  assert.equal(m.power, Math.round(50 * 1.3));   // 65
  assert.equal(m.speed, Math.round(20 * 1.3));   // 26
  // потолок: высокие статы не превышают 99
  const capped = fuseStats({ power: 90, defense: 90, magic: 90, speed: 90 }, { power: 90, defense: 90, magic: 90, speed: 90 }, true);
  assert.equal(capped.power, 99);
});

test('fuseStats: пол 10 (не ниже минимума)', () => {
  const low = fuseStats({ power: 10, defense: 10, magic: 10, speed: 10 }, { power: 10, defense: 10, magic: 10, speed: 10 }, false);
  assert.equal(low.power, 10);
});

test('fusedRarity: выше из двух родителей', () => {
  assert.equal(fusedRarity('rare', 'epic', false), 'epic');
  assert.equal(fusedRarity('common', 'common', false), 'common');
});

test('fusedRarity: мутация поднимает на ступень, mythic — потолок', () => {
  assert.equal(fusedRarity('rare', 'epic', true), 'legendary');
  assert.equal(fusedRarity('legendary', 'mythic', true), 'mythic'); // уже потолок
});

test('fusedRarity: неизвестная редкость трактуется как common', () => {
  assert.equal(fusedRarity('???', 'rare', false), 'rare');
  assert.equal(fusedRarity('???', '???', false), 'common');
});

test('fusionHint содержит оба имени', () => {
  const h = fusionHint({ name: 'Меч Зари', type: 'weapon' }, { name: 'Щит Ночи', type: 'armor' });
  assert.match(h, /Меч Зари/);
  assert.match(h, /Щит Ночи/);
});
