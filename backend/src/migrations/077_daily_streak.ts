import db from '../lib/db';

/**
 * Миграция 077: daily-login-стрик (удержание).
 *  - daily_streak    — текущая длина серии ежедневных заходов (0, пока не забирали).
 *  - last_claim_day  — номер дня последнего забора награды (floor(ms / 86400000)),
 *    day-гранулярность, чтобы «сегодня» определялось без времени суток.
 * Идемпотентна (PRAGMA table_info), как остальные ALTER-миграции проекта.
 */
export function runDailyStreakMigration() {
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name);

  if (!cols.includes('daily_streak')) {
    db.prepare(`ALTER TABLE users ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0`).run();
    console.log('✅ Migration 077: added daily_streak column');
  }
  if (!cols.includes('last_claim_day')) {
    db.prepare(`ALTER TABLE users ADD COLUMN last_claim_day INTEGER`).run();
    console.log('✅ Migration 077: added last_claim_day column');
  }
}
