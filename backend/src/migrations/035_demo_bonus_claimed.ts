import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 035: флаг однократного демо-бонуса

   POST /demo/convert (demo.routes.ts) начислял 50 TC при каждом вызове
   без проверки, что бонус уже выдавался этому пользователю — позволяло
   фармить TC повторными вызовами. Колонка demo_bonus_claimed на wallets
   проверяется и выставляется атомарным условным UPDATE (WHERE
   demo_bonus_claimed = 0), аналогично nonce-claim в tc.routes.ts.
   ================================================================ */

export function runDemoBonusClaimedMigration() {
  const columns = (db.prepare(`PRAGMA table_info(wallets)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!columns.includes("demo_bonus_claimed")) {
    db.prepare(`ALTER TABLE wallets ADD COLUMN demo_bonus_claimed INTEGER NOT NULL DEFAULT 0`).run()
  }
}

runDemoBonusClaimedMigration()
