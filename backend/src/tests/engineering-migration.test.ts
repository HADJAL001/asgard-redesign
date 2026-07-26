import { test, before } from 'node:test';
import assert from 'node:assert/strict';

/* ================================================================
   OSGARD · Миграции 091 (инженерный вердикт) и 092 (корпус ремесла).

   Проверяем ровно то, что делает их prod-safe: аддитивность (только
   ALTER ... ADD COLUMN и CREATE TABLE IF NOT EXISTS), идемпотентность
   (повторный прогон не падает) и честный grandfather — проект,
   сгенерированный до появления контура, НЕ получает задним числом
   вердикт, которого никто не выносил, а старый шаблон остаётся без
   балла качества (то есть считается худшим и будет вытеснен первой
   же проверенной генерацией).
   ================================================================ */

let db: any;

before(async () => {
  process.env.DB_PATH = ':memory:';
  ({ default: db } = await import('../lib/db'));

  // Схема «до 091/092»: проект без вердикта и шаблон без качества.
  db.exec(`
    CREATE TABLE projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready'
    );
    CREATE TABLE project_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT UNIQUE NOT NULL,
      theme TEXT NOT NULL,
      keywords TEXT,
      name_sample TEXT,
      description_sample TEXT,
      badge TEXT,
      manifest TEXT NOT NULL,
      files TEXT NOT NULL,
      artifact_types TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0,
      tokens_saved_estimate INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.exec(`INSERT INTO projects (id, user_id, name) VALUES (1, 1, 'Проект до контура');`);
  db.exec(`
    INSERT INTO project_templates (hash, theme, keywords, manifest, files, artifact_types, usage_count, created_at, updated_at)
    VALUES ('h-old', 'shop', 'магазин', '[]', '[]', '[]', 17, 1, 1);
  `);

  await import('../migrations/091_engineering_contour');
  await import('../migrations/092_craft_corpus');
});

test('091: добавлены три колонки инженерного вердикта', () => {
  const cols = db.prepare(`PRAGMA table_info(projects)`).all().map((c: any) => c.name);
  for (const col of ['build_status', 'build_report', 'build_verified_at']) {
    assert.ok(cols.includes(col), `колонка ${col} должна существовать`);
  }
});

test('091 grandfather: старый проект остаётся без вердикта', () => {
  const row = db.prepare(`SELECT build_status, build_report, build_verified_at FROM projects WHERE id = 1`).get();
  assert.equal(row.build_status, null);
  assert.equal(row.build_report, null);
  assert.equal(row.build_verified_at, null);
});

test('092: у шаблонов появилось качество, у платформы — память ошибок', () => {
  const cols = db.prepare(`PRAGMA table_info(project_templates)`).all().map((c: any) => c.name);
  for (const col of ['quality_score', 'verdict', 'design_score', 'repairs']) {
    assert.ok(cols.includes(col), `колонка ${col} должна существовать`);
  }
  const table = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='generation_lessons'`).get();
  assert.ok(table, 'таблица уроков должна существовать');
});

test('092 grandfather: старый шаблон без качества и с сохранённой статистикой', () => {
  const row = db.prepare(`SELECT usage_count, quality_score FROM project_templates WHERE hash = 'h-old'`).get();
  assert.equal(row.quality_score, null, 'качество задним числом не выдумываем');
  assert.equal(row.usage_count, 17, 'статистика переиспользования не теряется');
});

test('обе миграции идемпотентны: повторный прогон не падает', async () => {
  const m091 = await import('../migrations/091_engineering_contour');
  const m092 = await import('../migrations/092_craft_corpus');
  assert.doesNotThrow(() => m091.runEngineeringContourMigration());
  assert.doesNotThrow(() => m092.runCraftCorpusMigration());

  const cols = db.prepare(`PRAGMA table_info(projects)`).all().map((c: any) => c.name);
  assert.equal(cols.filter((c: string) => c === 'build_status').length, 1, 'колонка не задваивается');
});

test('091 не падает на схеме без таблицы projects', async () => {
  const mod = await import('../migrations/091_engineering_contour');
  db.exec(`ALTER TABLE projects RENAME TO projects_backup`);
  try {
    assert.doesNotThrow(() => mod.runEngineeringContourMigration());
  } finally {
    db.exec(`ALTER TABLE projects_backup RENAME TO projects`);
  }
});
