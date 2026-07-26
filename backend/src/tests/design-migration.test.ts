import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Миграция 090 (дизайн-система проекта) — in-memory.

   Проверяем ровно то, что делает миграцию prod-safe: она аддитивна
   (только ALTER ... ADD COLUMN), идемпотентна (повторный прогон не
   падает) и не переписывает прошлое — проекты, сгенерированные до
   появления дизайн-системы, остаются с NULL, а не получают задним
   числом облик, которого у них не было.
   ================================================================ */

let db: any;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  // Схема «до 090»: проект без единой колонки дизайн-системы.
  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready'
    );
  `);
  db.exec(`INSERT INTO projects (id, user_id, name) VALUES (1, 1, 'Проект до дизайн-системы');`);

  await import('../migrations/090_design_system');
});

test('миграция: добавлены три колонки дизайн-системы', () => {
  const cols = db.prepare(`PRAGMA table_info(projects)`).all().map((c: any) => c.name);
  for (const col of ['design_brief', 'design_score', 'design_report']) {
    assert.ok(cols.includes(col), `колонка ${col} должна существовать`);
  }
});

test('grandfather: старый проект остаётся с NULL во всех трёх колонках', () => {
  const row = db.prepare(`SELECT design_brief, design_score, design_report FROM projects WHERE id = 1`).get();
  assert.equal(row.design_brief, null);
  assert.equal(row.design_score, null);
  assert.equal(row.design_report, null);
});

test('миграция идемпотентна: повторный прогон не падает', async () => {
  const mod = await import('../migrations/090_design_system');
  assert.doesNotThrow(() => mod.runDesignSystemMigration());
});

test('миграция не трогает существующие данные проекта', () => {
  const row = db.prepare(`SELECT name, status FROM projects WHERE id = 1`).get();
  assert.equal(row.name, 'Проект до дизайн-системы');
  assert.equal(row.status, 'ready');
});

test('после миграции бриф записывается и читается обратно', () => {
  const { deriveDesignBrief } = require('../lib/design-system');
  const brief = deriveDesignBrief({ name: 'Проект до дизайн-системы', theme: 'general' });

  db.prepare(`UPDATE projects SET design_brief = ?, design_score = ? WHERE id = 1`).run(JSON.stringify(brief), 87);
  const row = db.prepare(`SELECT design_brief as b, design_score as s FROM projects WHERE id = 1`).get();

  assert.equal(row.s, 87);
  assert.deepEqual(JSON.parse(row.b), brief, 'бриф переживает сериализацию без потерь');
});
