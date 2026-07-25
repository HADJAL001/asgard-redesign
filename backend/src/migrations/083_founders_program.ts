import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 083: FOUNDERS PROGRAM (Академия / Сертификация)
   ================================================================
   Новый монетизируемый продукт — платный курс «от создателей платформы
   по созданию стартапов» + экосистемная сертификация «OSGARD Certified
   Vibecoder». Отдельный вертикальный саб, НЕ иерархический тариф плана
   (см. lib/stripe.ts PlanKey) и НЕ jarvis/walli-аддон (см. lib/addons.ts).

   Почему отдельные таблицы, а не расширение courses (058):
     courses.product ограничен CHECK IN('jarvis','walli'); расширять
     CHECK в SQLite = rebuild таблицы (риск для прода). Академия — свой
     продукт → свои изолированные таблицы. Существующие courses/
     course_progress/addon_subscriptions/subscriptions НЕ трогаем.

   Лестница тиров (цены — параметры в lib/academy.ts / .env, не хардкод):
     founder_track   (~$99/мес)  — курс + когорта + право на сертификацию
     founder_circle  ($990/мес)  — всё выше + слот встречи с создателями

   academy_enrollments — биллинг-состояние (зеркалит addon_subscriptions
   для единообразия обработки Stripe checkout/webhook/cancel).
   academy_courses / academy_progress — LMS-слой (паттерн 058/059).

   Безопасна для повторного запуска (CREATE TABLE IF NOT EXISTS,
   INSERT OR IGNORE для сидов). Самовызов при прямом запуске.
   ================================================================ */

export function runFoundersProgramMigration() {
  console.log("[migration:083] Starting founders_program migration...")

  /* --- Биллинг-подписка на программу (один enrollment на пользователя) --- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS academy_enrollments (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id                 INTEGER NOT NULL,
      tier                    TEXT NOT NULL DEFAULT 'founder_track'
                              CHECK(tier IN ('founder_track','founder_circle')),
      status                  TEXT NOT NULL DEFAULT 'inactive'
                              CHECK(status IN ('active','trialing','past_due','canceled','unpaid','inactive')),
      stripe_customer_id      TEXT,
      stripe_subscription_id  TEXT,
      stripe_price_id         TEXT,
      current_period_start    INTEGER,
      current_period_end      INTEGER,
      cancel_at_period_end    INTEGER NOT NULL DEFAULT 0,
      canceled_at             INTEGER,
      created_at              INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at              INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_academy_enrollments_user ON academy_enrollments(user_id);`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_academy_enrollments_status ON academy_enrollments(status);`)

  /* --- Каталог курсов программы (LMS-слой) --- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS academy_courses (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      course_key    TEXT NOT NULL UNIQUE,
      title         TEXT NOT NULL,
      description   TEXT NOT NULL DEFAULT '',
      required_tier TEXT NOT NULL DEFAULT 'founder_track'
                    CHECK(required_tier IN ('founder_track','founder_circle')),
      order_index   INTEGER NOT NULL DEFAULT 0,
      xp_reward     INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_academy_courses_order ON academy_courses(order_index);`)

  /* --- Прогресс пользователя по курсам --- */
  db.exec(`
    CREATE TABLE IF NOT EXISTS academy_progress (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      course_id    INTEGER NOT NULL,
      status       TEXT NOT NULL DEFAULT 'not_started'
                   CHECK(status IN ('not_started','in_progress','completed')),
      progress_pct INTEGER NOT NULL DEFAULT 0,
      completed_at INTEGER,
      created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      updated_at   INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES academy_courses(id) ON DELETE CASCADE,
      UNIQUE(user_id, course_id)
    );
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_academy_progress_user ON academy_progress(user_id);`)

  /* --- Сид программы курсов (идемпотентно; правится/дополняется позже) --- */
  const seed = db.prepare(
    `INSERT OR IGNORE INTO academy_courses (course_key, title, description, required_tier, order_index, xp_reward)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const courses: Array<[string, string, string, string, number, number]> = [
    ["idea_to_wedge", "От идеи к клину рынка", "Как выбрать нишу, где стартап-новичок реально может победить, и отсечь идеи, обречённые на провал.", "founder_track", 1, 100],
    ["build_with_ai", "Стройка продукта с ИИ", "Вайбкодинг MVP на платформе: от первого промпта до задеплоенного приложения без команды разработчиков.", "founder_track", 2, 150],
    ["first_users", "Первые 100 пользователей", "Каналы, которые работают на нуле бюджета: холодный запуск, комьюнити, ручные продажи.", "founder_track", 3, 150],
    ["unit_economics", "Юнит-экономика без иллюзий", "Считаем LTV/CAC честно, находим точку, после которой рост не убивает бизнес.", "founder_track", 4, 150],
    ["fundraising", "Привлечение денег", "Когда (и стоит ли) поднимать раунд, как собрать дек и говорить с инвесторами на их языке.", "founder_circle", 5, 200],
    ["scale_playbook", "Плейбук масштабирования", "Разбор с создателями платформы: как из работающего продукта построить компанию, а не проект.", "founder_circle", 6, 250],
  ]
  for (const c of courses) seed.run(...c)

  console.log("[migration:083] founders_program migration complete.")
}

// Самовызов на импорте (как 080/081): side-effect `import "./migrations/083_..."`
// в server.ts выполняет миграцию при старте. Идемпотентно (CREATE IF NOT EXISTS /
// INSERT OR IGNORE), безопасно при повторном запуске на персистентной прод-БД.
runFoundersProgramMigration()
