import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 086: MENTOR SESSIONS («Встреча с создателями»)
   ================================================================
   Финальная фаза Founders Program. «Одна встреча с создателями» —
   НЕ безлимитный канал, а КАПИРУЕМАЯ привилегия верхнего тира
   `founder_circle`: не более одного слота в календарный месяц
   (`period_ym` = 'YYYY-MM'). Иначе создатели утонут.

   Плюс психологический слой: слот может быть подарен за веху
   (`source='milestone'`) — переменное вознаграждение, а не только
   платная опция. Обе природы слота живут в одной таблице.

   Лимит «≤1 слот/мес» гарантируется НА УРОВНЕ БД — partial unique
   index по (user_id, period_ym) для всех НЕотменённых статусов.
   Отменённая сессия освобождает месяц под новую (index её исключает).
   Это делает проверку атомарной: гонка двух параллельных запросов
   упрётся в UNIQUE-конфликт, а не проскочит обе.

   Одна изолированная таблица. Существующие academy_* (083/084) и всё
   остальное НЕ трогаем. Безопасна для повторного запуска
   (CREATE TABLE/INDEX IF NOT EXISTS). Самовызов при импорте.
   ================================================================ */

export function runMentorSessionsMigration() {
  console.log("[migration:086] Starting mentor_sessions migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS mentor_sessions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      tier          TEXT NOT NULL DEFAULT 'founder_circle'
                    CHECK(tier IN ('founder_track','founder_circle')),
      status        TEXT NOT NULL DEFAULT 'requested'
                    CHECK(status IN ('requested','confirmed','completed','canceled')),
      source        TEXT NOT NULL DEFAULT 'subscription'
                    CHECK(source IN ('subscription','milestone')),
      requested_slot TEXT,
      period_ym     TEXT NOT NULL,
      notes         TEXT,
      confirmed_at  INTEGER,
      confirmed_by  INTEGER,
      completed_at  INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_mentor_sessions_user ON mentor_sessions(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mentor_sessions_status ON mentor_sessions(status);`)

  // Ключевой инвариант: ≤1 АКТИВНЫЙ (не отменённый) слот на пользователя в месяц.
  // Отменённые (status='canceled') исключены → пользователь может отменить и
  // запросить заново в том же месяце. Гонка параллельных request'ов упрётся сюда.
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_sessions_one_per_month
    ON mentor_sessions(user_id, period_ym) WHERE status != 'canceled';
  `)

  console.log("[migration:086] mentor_sessions migration complete.")
}

// Самовызов на импорте: side-effect `import "./migrations/086_mentor_sessions"`
// в server.ts выполняет миграцию при старте. Идемпотентно, безопасно при повторе.
runMentorSessionsMigration()
