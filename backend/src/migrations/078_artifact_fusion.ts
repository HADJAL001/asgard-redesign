import db from '../lib/db';

/**
 * Миграция 078: родословная фьюжна артефактов.
 *  - parent_a_id / parent_b_id — id родителей, из которых скован потомок (NULL для
 *    обычных/сгенерированных артефактов);
 *  - is_mutation — 1, если при слиянии выпала мутация (буст статов + редкость вверх).
 * Идемпотентна (PRAGMA table_info), как остальные ALTER-миграции.
 */
export function runArtifactFusionMigration() {
  const cols = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name);

  if (!cols.includes('parent_a_id')) {
    db.prepare(`ALTER TABLE artifacts ADD COLUMN parent_a_id INTEGER`).run();
    console.log('✅ Migration 078: added parent_a_id');
  }
  if (!cols.includes('parent_b_id')) {
    db.prepare(`ALTER TABLE artifacts ADD COLUMN parent_b_id INTEGER`).run();
    console.log('✅ Migration 078: added parent_b_id');
  }
  if (!cols.includes('is_mutation')) {
    db.prepare(`ALTER TABLE artifacts ADD COLUMN is_mutation INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✅ Migration 078: added is_mutation');
  }
}
