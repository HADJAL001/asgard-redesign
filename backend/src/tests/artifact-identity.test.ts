import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { deriveArtifactIdentity } from '../lib/artifact-identity';

/* ================================================================
   OSGARD · Artifact Identity (миграция 082 + lib/artifact-identity).
   Часть 1 — чистая логика: детерминизм (одинаковый проект → одинаковое
   лицо), архетип из типа, материал из редкости, честный миф из реальных
   сигналов, корректная legacy-формулировка при craftScore=null, валидные
   цвета палитры.
   Часть 2 — in-memory: миграция аддитивно добавляет origin_myth/visual_theme
   и идемпотентна, старые артефакты остаются NULL (grandfather).
   ================================================================ */

/* ---------------- Часть 1: deriveArtifactIdentity ---------------- */

const base = { name: 'Клинок', rarity: 'epic', craftScore: 0.8, seed: 'proj-1:Клинок' };

test('айдентика: детерминизм — тот же вход даёт то же лицо', () => {
  const a = deriveArtifactIdentity({ ...base, type: 'neural' });
  const b = deriveArtifactIdentity({ ...base, type: 'neural' });
  assert.deepEqual(a, b);
});

test('айдентика: разный seed → разная палитра (лицо проекта)', () => {
  const a = deriveArtifactIdentity({ ...base, type: 'neural', seed: 'proj-1:Меч' });
  const b = deriveArtifactIdentity({ ...base, type: 'neural', seed: 'proj-2:Меч' });
  assert.notEqual(a.palette.primary, b.palette.primary);
});

test('айдентика: архетип выводится из типа проекта', () => {
  assert.equal(deriveArtifactIdentity({ ...base, type: 'neural-net' }).archetype, 'Нейрокристалл');
  assert.equal(deriveArtifactIdentity({ ...base, type: 'game-arcade' }).archetype, 'Игровой Идол');
  assert.equal(deriveArtifactIdentity({ ...base, type: 'rest-api' }).archetype, 'Сервер-Сердце');
});

test('айдентика: нераспознанный тип → детерминированный резерв из пула', () => {
  const a = deriveArtifactIdentity({ ...base, type: 'zzz-unknown' });
  const b = deriveArtifactIdentity({ ...base, type: 'zzz-unknown' });
  assert.equal(a.archetype, b.archetype);
  assert.ok(['Артефакт-Химера', 'Безымянный Осколок', 'Кованый Странник', 'Эхо-Конструкт'].includes(a.archetype));
});

test('айдентика: материал выводится из редкости', () => {
  assert.equal(deriveArtifactIdentity({ ...base, type: 'web', rarity: 'common' }).material, 'обсидиан');
  assert.equal(deriveArtifactIdentity({ ...base, type: 'web', rarity: 'mythic' }).material, 'первичный эфир');
  assert.equal(deriveArtifactIdentity({ ...base, type: 'web', rarity: 'wat' }).material, 'кованая сталь');
});

test('айдентика: миф честен — пересказывает реальные сигналы ковки', () => {
  const id = deriveArtifactIdentity({
    ...base, type: 'neural', depth: 'deep', fileCount: 40, aiReal: true,
  });
  assert.match(id.originMyth, /«Клинок»/);
  assert.match(id.originMyth, /из квантового стекла/); // родительный падеж, а не «из квантовое стекло»
  assert.match(id.originMyth, /40 файлов/);
  assert.match(id.originMyth, /глубок/i);
  assert.match(id.originMyth, /настоящей AI/);
  assert.match(id.originMyth, /80%/); // честность = round(craftScore*100)
});

test('айдентика: legacy (craftScore=null) — миф в честной legacy-формулировке', () => {
  const id = deriveArtifactIdentity({ ...base, type: 'web', craftScore: null });
  assert.match(id.originMyth, /до эпохи Proof-of-Craft/);
  assert.doesNotMatch(id.originMyth, /честность ковки/);
});

test('айдентика: один файл — единственное число «файл»', () => {
  const id = deriveArtifactIdentity({ ...base, type: 'web', fileCount: 1 });
  assert.match(id.originMyth, /1 файл живого кода/);
});

test('айдентика: палитра — валидные hex-цвета', () => {
  const id = deriveArtifactIdentity({ ...base, type: 'neural' });
  assert.match(id.palette.primary, /^#[0-9a-f]{6}$/);
  assert.match(id.palette.accent, /^#[0-9a-f]{6}$/);
  assert.notEqual(id.palette.primary, id.palette.accent);
});

/* ---------------- Часть 2: миграция 082 (in-memory) ---------------- */

let db: any;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  db.exec(`
    CREATE TABLE artifacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL
    );
  `);
  db.exec(`INSERT INTO artifacts (id, owner_id, name) VALUES (1,1,'Старый клинок');`);

  await import('../migrations/082_artifact_identity');
});

test('миграция: добавлены колонки origin_myth и visual_theme', () => {
  const cols = db.prepare(`PRAGMA table_info(artifacts)`).all().map((c: any) => c.name);
  assert.ok(cols.includes('origin_myth'), 'origin_myth должна существовать');
  assert.ok(cols.includes('visual_theme'), 'visual_theme должна существовать');
});

test('grandfather: старый артефакт остаётся с NULL-айдентикой (legacy)', () => {
  const a = db.prepare(`SELECT origin_myth, visual_theme FROM artifacts WHERE id = 1`).get();
  assert.equal(a.origin_myth, null);
  assert.equal(a.visual_theme, null);
});

test('миграция идемпотентна: повторный прогон не падает', async () => {
  const mod = await import('../migrations/082_artifact_identity');
  assert.doesNotThrow(() => mod.runArtifactIdentityMigration());
});
