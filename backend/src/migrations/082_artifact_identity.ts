import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 082: «Артефакт-как-зеркало-приложения»
   ----------------------------------------------------------------
   Proof-of-Craft (081) связал СИЛУ артефакта с реальным трудом. Но по
   смыслу артефакт всё ещё был дженериком: число + родословная, без лица.
   Два одинаково выкованных приложения давали неотличимые артефакты.

   Айдентика даёт артефакту ЛИЦО, детерминированно выведенное из самого
   приложения (тип → архетип, редкость → материал, стабильный хеш →
   палитра, реальные сигналы ковки → честный «миф происхождения»). Это
   делает витрину провенанса шарящейся: у каждого артефакта — узнаваемый,
   воспроизводимый облик и короткая честная история. См. lib/artifact-identity.ts.

   Эта миграция аддитивна и prod-safe:

   1. artifacts.origin_myth  TEXT (nullable) — «миф происхождения»,
      честный нарратив из реальных сигналов ковки. Пишется новыми ковками.
   2. artifacts.visual_theme TEXT (nullable) — JSON {archetype, material,
      essence, palette:{primary,accent}} для визуализации на витрине.

   Grandfather: старые артефакты остаются с NULL в обеих колонках. Backfill
   НЕ делаем — айдентика это ПРЕЗЕНТАЦИЯ (в отличие от статов), поэтому для
   legacy её честно выводят на лету из того, что о них известно (тип/
   редкость/имя), прямо на витрине провенанса. Ничью ценность не переписываем.

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 080/081).
   ================================================================ */

export function runArtifactIdentityMigration() {
  const artifactsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()
  if (!artifactsExists) return

  const cols = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("origin_myth")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN origin_myth TEXT`)
    console.log("✅ Migration 082: added artifacts.origin_myth")
  }
  if (!cols.includes("visual_theme")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN visual_theme TEXT`)
    console.log("✅ Migration 082: added artifacts.visual_theme")
  }

  // Grandfather: существующие артефакты остаются с NULL. Айдентика для них
  // выводится на лету на витрине провенанса (deriveArtifactIdentity), backfill не нужен.
  console.log("✅ Migration 082: Artifact identity ready (legacy artifacts grandfathered)")
}

runArtifactIdentityMigration()
