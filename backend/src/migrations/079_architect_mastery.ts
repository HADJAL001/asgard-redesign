import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 079: «Мастерство Архитектора»
   ----------------------------------------------------------------
   Отсутствующий retention-примитив — собственная статусная лестница
   пользователя (до сих пор уровни были только у артефактов). Полностью
   аддитивно и prod-safe.

   Колонки прогрессии на users (под guard):
     architect_xp   — накопленный опыт за РЕАЛЬНЫЕ действия (генерация
                      проекта, ковка, продажа),
     architect_tier — индекс достигнутого тира (0 = Подмастерье).
   Обе с DEFAULT 0 → все исторические юзеры = «Подмастерье, 0 XP»,
   прежнее поведение 1:1. XP начисляется аддитивно рядом с уже
   существующими обработчиками (см. lib/architect-progression.ts); на
   тир-апе выдаётся артефакт-дар через существующую экономику лута.

   Сознательно НЕ вводит ежедневный стрик — эта петля уже живёт в проде
   (daily-login-стрик, миграция 077). «Мастерство» — ортогональная
   долгосрочная лестница, а не второй ежедневный забор (без дублей).

   Идемпотентно: ALTER под PRAGMA-guard, самовызов на импорте (тот же
   стиль, что миграции 076/077).
   ================================================================ */

export function runArchitectMasteryMigration() {
  const usersExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .get()
  if (!usersExists) return

  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)
  if (!cols.includes("architect_xp")) {
    db.exec(`ALTER TABLE users ADD COLUMN architect_xp INTEGER NOT NULL DEFAULT 0`)
    console.log("✅ Migration 079: added architect_xp column")
  }
  if (!cols.includes("architect_tier")) {
    db.exec(`ALTER TABLE users ADD COLUMN architect_tier INTEGER NOT NULL DEFAULT 0`)
    console.log("✅ Migration 079: added architect_tier column")
  }
}

runArchitectMasteryMigration()
