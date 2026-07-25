import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 084: ACADEMY CERTIFICATES (Credential Vibecoder)
   ================================================================
   Сам «сертификат вайбкодера» — экосистемный credential «OSGARD
   Certified Vibecoder»: verifiable, revocable, публично проверяемый.
   Модель — как выданный/отзываемый ключ (см. partner.routes.ts
   api_keys): выдаётся при активной записи в программу + прохождении
   «экзамена делом» (computeEligibility, Фаза 2), проверяется публично
   по serial, отзывается админом.

   НЕ «лицензия» в юридическом смысле (гос-разрешение на деятельность
   мы не выдаём) — это бренд-сертификация экосистемы (как AWS Certified
   / Google Certified): легально, престижно, масштабируемо.

   Одна изолированная таблица. Существующие academy_* (083) и всё
   остальное НЕ трогаем. snapshot_json фиксирует craft/тир/проекты на
   момент выдачи — чтобы печать сертификата была честной и стабильной,
   даже если позже пользователь что-то продаст/деградирует.

   Один АКТИВНЫЙ credential на пользователя (partial unique index по
   status='issued'); после revoke пользователь может заслужить и
   получить новый — старый остаётся в истории как revoked.

   Безопасна для повторного запуска (CREATE TABLE/INDEX IF NOT EXISTS).
   Самовызов при импорте (как 080/081/083).
   ================================================================ */

export function runAcademyCertificatesMigration() {
  console.log("[migration:084] Starting academy_certificates migration...")

  db.exec(`
    CREATE TABLE IF NOT EXISTS academy_certificates (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      serial        TEXT NOT NULL UNIQUE,
      tier          TEXT NOT NULL DEFAULT 'founder_track'
                    CHECK(tier IN ('founder_track','founder_circle')),
      status        TEXT NOT NULL DEFAULT 'issued'
                    CHECK(status IN ('issued','revoked')),
      snapshot_json TEXT NOT NULL DEFAULT '{}',
      issued_at     INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      revoked_at    INTEGER,
      revoked_by    INTEGER,
      revoke_reason TEXT,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_academy_certificates_user ON academy_certificates(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_academy_certificates_status ON academy_certificates(status);`)
  // serial уже UNIQUE (быстрый lookup при публичной верификации GET /certified/:serial).

  // Ровно один АКТИВНЫЙ сертификат на пользователя. Повторная выдача после
  // отзыва разрешена (revoked-строки не участвуют в этом ограничении).
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_academy_certificates_one_active
    ON academy_certificates(user_id) WHERE status = 'issued';
  `)

  console.log("[migration:084] academy_certificates migration complete.")
}

// Самовызов на импорте: side-effect `import "./migrations/084_academy_certificates"`
// в server.ts выполняет миграцию при старте. Идемпотентно, безопасно при повторе.
runAcademyCertificatesMigration()
