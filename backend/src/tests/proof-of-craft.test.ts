import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { computeCraftScore, deriveCraftedStats } from '../lib/proof-of-craft';

/* ================================================================
   OSGARD · Proof-of-Craft (миграция 081 + lib/proof-of-craft).
   Часть 1 — чистая логика: craftScore из сигналов + вывод статов.
   Проверяем то, ради чего всё затевалось: детерминизм (нет рулетки),
   пол для ковки без проекта, монотонность по усилию, пороги редкости.
   Часть 2 — in-memory: миграция аддитивно добавляет craft_score и
   идемпотентна, старые артефакты остаются NULL (grandfather).
   ================================================================ */

/* ---------------- Часть 1: computeCraftScore ---------------- */

test('craftScore: ковка без проекта упирается в пол (нельзя доказать труд)', () => {
  const cs = computeCraftScore({ hasProject: false });
  assert.equal(cs, 0.15);
});

test('craftScore: максимум — deep + много файлов + настоящая AI', () => {
  const cs = computeCraftScore({ hasProject: true, depth: 'deep', fileCount: 40, aiSource: 'openai', templateId: null });
  assert.equal(cs, 1);
});

test('craftScore: детерминизм — одни сигналы дают один результат', () => {
  const s = { hasProject: true, depth: 'standard' as const, fileCount: 12, aiSource: 'openai', templateId: null };
  assert.equal(computeCraftScore(s), computeCraftScore(s));
});

test('craftScore: глубже генерация → выше честность (монотонность по depth)', () => {
  const base = { hasProject: true, fileCount: 10, aiSource: 'openai', templateId: null };
  const q = computeCraftScore({ ...base, depth: 'quick' });
  const s = computeCraftScore({ ...base, depth: 'standard' });
  const d = computeCraftScore({ ...base, depth: 'deep' });
  assert.ok(q < s && s < d, `ожидалось quick<standard<deep, получили ${q}/${s}/${d}`);
});

test('craftScore: больше файлов → выше (до насыщения), плато после порога', () => {
  const base = { hasProject: true, depth: 'standard' as const, aiSource: 'openai', templateId: null };
  const few = computeCraftScore({ ...base, fileCount: 4 });
  const many = computeCraftScore({ ...base, fileCount: 20 });
  const saturated1 = computeCraftScore({ ...base, fileCount: 24 });
  const saturated2 = computeCraftScore({ ...base, fileCount: 100 });
  assert.ok(few < many, 'больше файлов → выше');
  assert.equal(saturated1, saturated2, 'после насыщения файлы не добавляют честности');
});

test('craftScore: шаблонный проект (template_id задан) теряет AI-бонус', () => {
  const base = { hasProject: true, depth: 'standard' as const, fileCount: 10, aiSource: 'openai' };
  const real = computeCraftScore({ ...base, templateId: null });
  const templated = computeCraftScore({ ...base, templateId: 5 });
  assert.ok(real > templated, 'настоящая AI-генерация честнее шаблона');
});

/* ---------------- Часть 1b: deriveCraftedStats ---------------- */

test('статы: детерминизм — тот же seed даёт те же статы', () => {
  const a = deriveCraftedStats(0.7, 1, 'proj-42:Клинок');
  const b = deriveCraftedStats(0.7, 1, 'proj-42:Клинок');
  assert.deepEqual(a, b);
});

test('статы: разный seed → разный профиль (характер проекта)', () => {
  const a = deriveCraftedStats(0.7, 1, 'proj-1:Меч');
  const b = deriveCraftedStats(0.7, 1, 'proj-2:Меч');
  const same = a.power === b.power && a.defense === b.defense && a.magic === b.magic && a.speed === b.speed;
  assert.ok(!same, 'разные проекты должны иметь разный профиль статов');
});

test('статы: выше craftScore → выше сумма статов', () => {
  const sum = (s: { power: number; defense: number; magic: number; speed: number }) =>
    s.power + s.defense + s.magic + s.speed;
  const low = deriveCraftedStats(0.1, 1, 'seed');
  const high = deriveCraftedStats(0.95, 1, 'seed');
  assert.ok(sum(low) < sum(high), 'честнее ковка → сильнее артефакт');
});

test('статы: множитель валюты масштабирует силу', () => {
  const sum = (s: { power: number; defense: number; magic: number; speed: number }) =>
    s.power + s.defense + s.magic + s.speed;
  const weak = deriveCraftedStats(0.7, 0.5, 'seed');
  const strong = deriveCraftedStats(0.7, 1.5, 'seed');
  assert.ok(sum(weak) < sum(strong), 'слабее монета → слабее артефакт');
});

test('статы: пороги редкости по craftScore (ковка максимум до epic)', () => {
  assert.equal(deriveCraftedStats(0.2, 1, 's').rarity, 'common');
  assert.equal(deriveCraftedStats(0.7, 1, 's').rarity, 'rare');
  assert.equal(deriveCraftedStats(0.9, 1, 's').rarity, 'epic');
});

test('статы: каждый стат ≥ 1 даже при нулевой честности', () => {
  const s = deriveCraftedStats(0, 0.1, 'seed');
  assert.ok(s.power >= 1 && s.defense >= 1 && s.magic >= 1 && s.speed >= 1);
});

/* ---------------- Часть 2: миграция 081 (in-memory) ---------------- */

let db: any;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  // Артефакт со «старыми» статами — до Proof-of-Craft.
  db.exec(`
    CREATE TABLE artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      power INTEGER NOT NULL DEFAULT 10
    );
  `);
  db.exec(`INSERT INTO artifacts (id, owner_id, name) VALUES (1,1,'Старый клинок');`);

  await import('../migrations/081_proof_of_craft');
});

test('миграция: добавлена колонка craft_score', () => {
  const cols = db.prepare(`PRAGMA table_info(artifacts)`).all().map((c: any) => c.name);
  assert.ok(cols.includes('craft_score'), 'craft_score должна существовать');
});

test('grandfather: старый артефакт остаётся craft_score = NULL (legacy)', () => {
  const a = db.prepare(`SELECT craft_score FROM artifacts WHERE id = 1`).get();
  assert.equal(a.craft_score, null);
});

test('миграция идемпотентна: повторный прогон не падает', async () => {
  const mod = await import('../migrations/081_proof_of_craft');
  assert.doesNotThrow(() => mod.runProofOfCraftMigration());
});
