import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 087: «Гость-аккаунт» (free-first-project по IP)
   ----------------------------------------------------------------
   Воронка первого впечатления: гость с лендинга получает 1 НАСТОЯЩИЙ
   проект (реальный код + артефакты) без регистрации. Для этого сервер
   провижинит лёгкий гость-аккаунт (см. routes/guest.routes.ts), от лица
   которого крутится существующий POST /projects/generate. Дальнейшие
   доработки — за стеной регистрации («раздел Доработок»).

   Эта миграция аддитивна и prod-safe — три nullable/дефолтные колонки в users:

   1. users.is_guest   INTEGER NOT NULL DEFAULT 0 — 1 у провижененного гостя.
      Реальные аккаунты и все legacy-строки остаются 0 (grandfather).
   2. users.guest_ip   TEXT (nullable) — IP, с которого создан гость. Нужен
      для анти-абуза (1 гость на IP в окне) как БД-fallback к Redis-лимитеру.
   3. users.claimed_at INTEGER (nullable) — момент, когда гость был «забран»
      реальным аккаунтом при регистрации (перенос проекта). Одноразовость
      claim гарантируется условным UPDATE (WHERE claimed_at IS NULL).

   Идемпотентно: ALTER под PRAGMA-guard. Самовызов на импорте (стиль 080–084).
   ================================================================ */

export function runGuestAccountsMigration() {
  const usersExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .get()
  if (!usersExists) return

  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("is_guest")) {
    db.exec(`ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0`)
    console.log("✅ Migration 087: added users.is_guest")
  }
  if (!cols.includes("guest_ip")) {
    db.exec(`ALTER TABLE users ADD COLUMN guest_ip TEXT`)
    console.log("✅ Migration 087: added users.guest_ip")
  }
  if (!cols.includes("claimed_at")) {
    db.exec(`ALTER TABLE users ADD COLUMN claimed_at INTEGER`)
    console.log("✅ Migration 087: added users.claimed_at")
  }

  // Индекс для БД-fallback анти-абуза: быстрый поиск «активный гость по IP».
  // Частичный (WHERE is_guest = 1) — не раздувает индекс реальными аккаунтами.
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_users_guest_ip ON users(guest_ip) WHERE is_guest = 1`)
  } catch {
    /* старые SQLite без partial-index — не критично, лимитер и так работает через Redis */
  }

  console.log("✅ Migration 087: Guest accounts ready (legacy users grandfathered as is_guest=0)")
}

runGuestAccountsMigration()
