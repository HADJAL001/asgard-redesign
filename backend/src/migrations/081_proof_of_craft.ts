import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 081: «Proof-of-Craft»
   ----------------------------------------------------------------
   Кузница перестаёт быть казино. До сих пор POST /artifacts/forge
   раздавал статы чистым ГСЧ (roll = 10 + rnd·30), никак не связанным
   с реальным проектом, из которого куётся артефакт. Это тихо ломало
   главный тезис продукта — «артефакт = атом смысла»: смысла в статах
   было ровно ноль, кроме удачи.

   Proof-of-Craft выводит статы ДЕТЕРМИНИРОВАННО из реальной субстанции
   проекта (глубина генерации, число файлов, настоящая AI-генерация vs
   шаблон) — см. lib/proof-of-craft.ts. Куёшь лучшее приложение →
   получаешь лучший артефакт. Казино → мастерская.

   Эта миграция аддитивна и prod-safe:

   1. Колонка artifacts.craft_score REAL (nullable, 0..1). Хранит
      «честность» артефакта — насколько его статы заработаны реальным
      трудом. Пишется новыми ковками (Proof-of-Craft).

   2. Grandfather исторических артефактов: у всех существующих статы
      выкованы старым ГСЧ. Мы их НЕ трогаем и НЕ пересчитываем —
      craft_score остаётся NULL, что и есть метка «legacy» (статы
      честны в рамках старых правил, менять чужую ценность задним
      числом нечестно). Витрина провенанса показывает NULL как
      «выковано до Proof-of-Craft».

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (тот же
   стиль, что миграции 079/080).
   ================================================================ */

export function runProofOfCraftMigration() {
  const artifactsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='artifacts'`)
    .get()
  if (!artifactsExists) return

  // Колонка craft_score (0..1). NULL = legacy-артефакт, выкованный до Proof-of-Craft.
  const cols = (db.prepare(`PRAGMA table_info(artifacts)`).all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes("craft_score")) {
    db.exec(`ALTER TABLE artifacts ADD COLUMN craft_score REAL`)
    console.log("✅ Migration 081: added artifacts.craft_score")
  }

  // Grandfather: существующие артефакты сознательно остаются craft_score = NULL.
  // Никакого backfill — старые статы честны в старых правилах, не переписываем ценность.
  console.log("✅ Migration 081: Proof-of-Craft ready (legacy artifacts grandfathered)")
}

runProofOfCraftMigration()
