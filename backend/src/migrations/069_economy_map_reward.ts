import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 069: economy_map_reward_claimed
   ----------------------------------------------------------------
   Флаг одноразовой награды за прохождение обучающей презентации
   «Карта экономики» (POST /onboarding/economy-map-reward).
   Идемпотентно (ALTER только если колонки нет).
   ================================================================ */
export function runEconomyMapRewardMigration() {
  try {
    const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>
    if (!cols.some((c) => c.name === "economy_map_reward_claimed")) {
      db.exec(`ALTER TABLE users ADD COLUMN economy_map_reward_claimed INTEGER NOT NULL DEFAULT 0`)
      console.log("[migration:069] added users.economy_map_reward_claimed")
    }
  } catch (e: any) {
    console.warn(`[migration:069] economy_map_reward: ${e.message}`)
  }
}

runEconomyMapRewardMigration()
