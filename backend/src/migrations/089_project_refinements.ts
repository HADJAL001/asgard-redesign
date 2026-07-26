import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 089: «Доработки проекта» (метеринговая эволюция)
   ----------------------------------------------------------------
   Спека A(2) воронки: первый проект гость получает бесплатно, а
   ДОРАБОТКИ (итеративная AI-эволюция уже созданного приложения) —
   за стеной регистрации. Реальный аккаунт получает N бесплатных
   доработок при регистрации, дальше — за кредиты.

   Аддитивно и prod-safe — одна nullable-колонка в users + одна новая
   изолированная таблица-леджер. Ничего существующего не трогаем.

   1. users.refinements_remaining INTEGER (nullable, БЕЗ дефолта).
      Семантика трёх состояний:
        • NULL  — грант ещё не выдан. При первом чтении реальному аккаунту
                  лениво выдаётся FREE_REFINEMENTS_ON_SIGNUP (см. lib/refinements.ts).
                  Все legacy-строки стартуют как NULL → получат грант при первом
                  обращении (grandfather, без разовой раздачи по всей таблице).
        • число — сколько бесплатных доработок осталось (декремент при трате).
        • гостю (is_guest=1) НЕ выдаётся — остаётся NULL (стена на регистрации).
      Nullable намеренно: отличить «не выдано» от «выдано и потрачено в 0».

   2. project_refinements — леджер каждой потраченной доработки:
      кто, какой проект, каким источником оплачено ('grant'|'credits'),
      с каким уточнением (hint), когда. Аудит + защита от двойной траты
      (запись идёт в той же экономической транзакции, что и списание).

   Идемпотентно: ALTER под PRAGMA-guard, CREATE ... IF NOT EXISTS.
   Самовызов на импорте (стиль 080–088).
   ================================================================ */

export function runProjectRefinementsMigration() {
  const usersExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='users'`)
    .get()
  if (!usersExists) return

  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name)

  if (!cols.includes("refinements_remaining")) {
    // Без NOT NULL / DEFAULT: NULL = «грант ещё не выдан» (ленивая выдача при первом чтении).
    db.exec(`ALTER TABLE users ADD COLUMN refinements_remaining INTEGER`)
    console.log("✅ Migration 089: added users.refinements_remaining (nullable)")
  }

  // Леджер потраченных доработок. Изолированная таблица — существующего не трогает.
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_refinements (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      project_id  INTEGER NOT NULL,
      hint        TEXT,                                          -- уточнение пользователя к доработке
      paid_with   TEXT NOT NULL CHECK (paid_with IN ('grant','credits')),
      credits_cost INTEGER NOT NULL DEFAULT 0,                   -- сколько кредитов списано (0 для 'grant')
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `)

  db.exec(`CREATE INDEX IF NOT EXISTS idx_project_refinements_user ON project_refinements(user_id, id DESC);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_project_refinements_project ON project_refinements(project_id, id DESC);`)

  console.log("✅ Migration 089: project refinements ready (legacy users grandfathered as NULL → lazy grant)")
}

// Самовызов на импорте: side-effect `import "./migrations/089_project_refinements"`
// в server.ts выполняет миграцию при старте. Идемпотентно, безопасно при повторе.
runProjectRefinementsMigration()
