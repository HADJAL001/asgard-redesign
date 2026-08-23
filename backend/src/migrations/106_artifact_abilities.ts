import db from "../lib/db"

const columns = db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>
const names = new Set(columns.map((column) => column.name))
if (!names.has("ability_key")) db.exec(`ALTER TABLE artifacts ADD COLUMN ability_key TEXT`)
if (!names.has("ability_name")) db.exec(`ALTER TABLE artifacts ADD COLUMN ability_name TEXT`)
if (!names.has("ability_power")) db.exec(`ALTER TABLE artifacts ADD COLUMN ability_power REAL NOT NULL DEFAULT 0`)
if (!names.has("ability_description")) db.exec(`ALTER TABLE artifacts ADD COLUMN ability_description TEXT`)

const abilityUpdate = `
  ability_key = CASE
    WHEN power >= defense AND power >= magic AND power >= speed THEN 'forge_force'
    WHEN defense >= magic AND defense >= speed THEN 'forge_guard'
    WHEN magic >= speed THEN 'forge_insight'
    ELSE 'forge_velocity'
  END,
  ability_name = CASE
    WHEN power >= defense AND power >= magic AND power >= speed THEN 'Force Amplifier'
    WHEN defense >= magic AND defense >= speed THEN 'Guardian Matrix'
    WHEN magic >= speed THEN 'Insight Core'
    ELSE 'Velocity Engine'
  END,
  ability_power = MIN(20, ROUND((
    CASE rarity WHEN 'mythic' THEN 10 WHEN 'legendary' THEN 8 WHEN 'epic' THEN 6 WHEN 'rare' THEN 4 ELSE 2 END
  ) + MAX(0, level - 1) * 0.75, 2)),
  ability_description = CASE
    WHEN power >= defense AND power >= magic AND power >= speed THEN 'Equipped: amplifies the stats of newly forged artifacts.'
    WHEN defense >= magic AND defense >= speed THEN 'Equipped: increases the chance that a newly forged artifact starts at a higher rarity.'
    WHEN magic >= speed THEN 'Equipped: improves Forge insight, artifact quality, and craft discount.'
    ELSE 'Equipped: provides a balanced boost to stats, rarity chance, and craft discount.'
  END`

db.exec(`UPDATE artifacts SET ${abilityUpdate}`)
db.exec(`
  DROP TRIGGER IF EXISTS trg_artifact_ability_insert;
  DROP TRIGGER IF EXISTS trg_artifact_ability_update;
  CREATE TRIGGER trg_artifact_ability_insert AFTER INSERT ON artifacts BEGIN
    UPDATE artifacts SET ${abilityUpdate} WHERE id = NEW.id;
  END;
  CREATE TRIGGER trg_artifact_ability_update AFTER UPDATE OF rarity, level, power, defense, magic, speed ON artifacts BEGIN
    UPDATE artifacts SET ${abilityUpdate} WHERE id = NEW.id;
  END;
`)
