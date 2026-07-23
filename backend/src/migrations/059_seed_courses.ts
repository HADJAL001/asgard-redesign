import db from "../lib/db"

/* ================================================================
   OSGARD MIGRATION 059: SEED COURSES (стартовый каталог обучения)
   ================================================================
   Наполняет courses (см. migration 058) стартовым набором модулей
   для ДЖАРВИС Premium и ВАЛЛИ Premium. INSERT OR IGNORE по
   course_key (UNIQUE) — безопасна для повторного запуска и не
   перезаписывает контент, если он уже был отредактирован вручную.
   ================================================================ */

type SeedCourse = {
  product: "jarvis" | "walli"
  courseKey: string
  title: string
  description: string
  requiredTier: "premium" | "elite"
  orderIndex: number
  xpReward: number
}

const SEED_COURSES: SeedCourse[] = [
  // ── ДЖАРВИС Premium ──
  {
    product: "jarvis",
    courseKey: "jarvis_basics",
    title: "Основы работы с ДЖАРВИС",
    description: "Первые шаги: интерфейс, команды, базовые сценарии автоматизации.",
    requiredTier: "premium",
    orderIndex: 1,
    xpReward: 50,
  },
  {
    product: "jarvis",
    courseKey: "jarvis_automation",
    title: "Автоматизация повторяющихся задач",
    description: "Как настроить цепочки действий и переиспользуемые шаблоны.",
    requiredTier: "premium",
    orderIndex: 2,
    xpReward: 75,
  },
  {
    product: "jarvis",
    courseKey: "jarvis_advanced_prompts",
    title: "Продвинутые промпты и сценарии",
    description: "Техники формулирования задач для более точных и предсказуемых результатов.",
    requiredTier: "premium",
    orderIndex: 3,
    xpReward: 100,
  },
  {
    product: "jarvis",
    courseKey: "jarvis_elite_masterclass",
    title: "Мастер-класс: кастомные агенты",
    description: "Создание собственных специализированных агентов на базе ДЖАРВИС. Доступно только на уровне Elite.",
    requiredTier: "elite",
    orderIndex: 4,
    xpReward: 150,
  },

  // ── ВАЛЛИ Premium ──
  {
    product: "walli",
    courseKey: "walli_basics",
    title: "Знакомство с ВАЛЛИ",
    description: "Первые шаги: как начать общение и настроить базовые параметры.",
    requiredTier: "premium",
    orderIndex: 1,
    xpReward: 50,
  },
  {
    product: "walli",
    courseKey: "walli_customization",
    title: "Кастомизация внешности и голоса",
    description: "Как разблокировать и применить темы оформления и варианты голоса.",
    requiredTier: "premium",
    orderIndex: 2,
    xpReward: 75,
  },
  {
    product: "walli",
    courseKey: "walli_bonding",
    title: "Углублённое взаимодействие",
    description: "Продвинутые сценарии общения и способы нарастить прогресс быстрее.",
    requiredTier: "premium",
    orderIndex: 3,
    xpReward: 100,
  },
  {
    product: "walli",
    courseKey: "walli_elite_secrets",
    title: "Секреты элитного статуса",
    description: "Эксклюзивные возможности и преображения, доступные только на уровне Elite.",
    requiredTier: "elite",
    orderIndex: 4,
    xpReward: 150,
  },
]

export function runSeedCoursesMigration() {
  console.log("[migration:059] Starting seed_courses migration...")

  const insert = db.prepare(`
    INSERT OR IGNORE INTO courses (product, course_key, title, description, required_tier, order_index, xp_reward)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  for (const c of SEED_COURSES) {
    insert.run(c.product, c.courseKey, c.title, c.description, c.requiredTier, c.orderIndex, c.xpReward)
  }

  console.log(`[migration:059] seed_courses migration complete (${SEED_COURSES.length} courses ensured).`)
}

if (require.main === module) {
  runSeedCoursesMigration()
}
