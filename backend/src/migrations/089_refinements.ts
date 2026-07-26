import db from "../lib/db"

/* ================================================================
   OSGARD · Миграция 089: «Доработки» (refinements) — механика домена B
   ----------------------------------------------------------------
   Связывает разделы «Проекты» и «Доработки»: доработка — это AI-итерация
   УЖЕ существующего проекта (новый экран/логика/стиль), а не новый проект.
   Экономика воронки: первые N доработок бесплатны (грант при аккаунте,
   паритет с FREE_REFINEMENTS_ON_SIGNUP на фронте), дальше — за кредиты.

   Одна изолированная таблица-леджер. Ничего существующего НЕ трогает —
   остаток доработок вычисляется как грант − COUNT(строк пользователя),
   поэтому мутировать общие таблицы (users/wallets) не нужно.

     • project_refinements — по строке на каждую запрошенную доработку:
       кто, какой проект, промпт, статус регенерации, списанные кредиты.

   Остаток «бесплатных доработок» отдаётся в GET /guest/status
   (refinementsRemaining) и в стор фронта. Само списание кредитов за
   платные доработки идёт транзакцией в POST /projects/:id/refine.

   Идемпотентно (CREATE ... IF NOT EXISTS). Самовызов при импорте
   (стиль 080–088). prod-safe: legacy-аккаунты просто имеют 0 строк →
   полный грант бесплатных доработок.
   ================================================================ */

export function runRefinementsMigration() {
  console.log("[migration:089] Starting refinements migration...")

  // Леджер доработок: одна строка на запрошенную AI-итерацию проекта.
  // status повторяет жизненный цикл регенерации (generating→ready|failed),
  // чтобы UI показывал прогресс так же, как при первой генерации.
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_refinements (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      project_id    INTEGER NOT NULL,
      prompt        TEXT NOT NULL,              -- что доработать (вход AI-итерации)
      status        TEXT NOT NULL DEFAULT 'generating', -- generating | ready | failed
      cost_credits  INTEGER NOT NULL DEFAULT 0, -- 0 у бесплатных из гранта
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
  `)

  // Быстрый подсчёт остатка бесплатных доработок пользователя и лента проекта.
  db.exec(`CREATE INDEX IF NOT EXISTS idx_refinements_user ON project_refinements(user_id, id DESC);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_refinements_project ON project_refinements(project_id, id DESC);`)

  console.log("[migration:089] refinements migration complete.")
}

// Самовызов на импорте: side-effect `import "./migrations/089_refinements"`
// в server.ts выполняет миграцию при старте. Идемпотентно, безопасно при повторе.
runRefinementsMigration()
