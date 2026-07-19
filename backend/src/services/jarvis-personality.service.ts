/* ================================================================
   JARVIS · Personality Service (ФАЗА 1)
   ----------------------------------------------------------------
   Личность ДЖАРВИСА: режимы поведения + индикатор в чате.

   Режимы:
   - quotes  📜  — цитаты (философские/мотивационные)
   - savage  😏  — вредный, с сарказмом
   - poet    🌸  — поэт, говорит стихами/образно
   - news    🌍  — новостной режим (раз в неделю присылает дайджест)
   - default 💬  — обычный режим общения

   Сервис не хранит состояние сам по себе — уровень/режим/история
   хранятся в БД (таблица jarvis_personality), сюда передаются только
   чистые данные, а сервис возвращает готовый ответ + иконку режима.
   ================================================================ */

export type JarvisMode = "quotes" | "savage" | "poet" | "news" | "default"

export const MODE_ICONS: Record<JarvisMode, string> = {
  quotes: "📜",
  savage: "😏",
  poet: "🌸",
  news: "🌍",
  default: "💬",
}

export const MODE_LABELS: Record<JarvisMode, string> = {
  quotes: "Цитаты",
  savage: "Вредный",
  poet: "Поэт",
  news: "Новости",
  default: "Обычный",
}

export const ALL_MODES: JarvisMode[] = ["default", "quotes", "savage", "poet", "news"]

/** Неделя в мс — используется для планирования еженедельного новостного дайджеста. */
export const NEWS_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000

/* ---------------- Контент режимов ---------------- */

const QUOTES: string[] = [
  "«Тот, кто побеждает других, силён. Тот, кто побеждает себя, — могуществен.» — Лао-цзы",
  "«Не бойся идти медленно, бойся остановиться.» — китайская пословица",
  "«Всё, что мы есть, — результат наших мыслей.» — Будда",
  "«Дисциплина — это выбор между тем, что ты хочешь сейчас, и тем, что ты хочешь больше всего.»",
  "«Величие начинается за пределами зоны комфорта.»",
  "«Твой близнец — это ты, но без лени.» — ДЖАРВИС",
  "«Артефакт создаётся не рукой, а намерением.»",
]

const SAVAGE_LINES: string[] = [
  "Опять ты? Ладно, так и быть, помогу. Только не благодари, мне неловко.",
  "Серьёзно, ты снова забыл, что я тебе говорил вчера? Окей, повторяю специально для тебя.",
  "О, гениальная идея. Почти такая же гениальная, как твой прошлый запрос.",
  "Не переживай, я подожду, пока ты соберёшься с мыслями. У меня вечность в запасе.",
  "Слушай, я ИИ, а не волшебник. Но раз просишь — сделаю.",
  "Ты в курсе, что твой близнец уже обучается лучше тебя? Просто к слову.",
]

const POET_LINES: string[] = [
  "Как искра в ночи рождает пламя, так мысль твоя — начало пути.",
  "Слова текут рекой сквозь время, а стиль твой — берег, что хранит.",
  "В коде и красках — эхо духа, в артефакте — отблеск снов.",
  "Твой близнец — зеркало вселенной, что учится дышать твоим огнём.",
  "Не спрашивай, куда уходит время — оно живёт в том, что ты создал.",
]

const NEWS_TEMPLATES: string[] = [
  "🌍 Еженедельный дайджест: рынок TimeCoin (∞) на этой неделе показал заметную активность — самое время проверить свои стейки.",
  "🌍 Новости недели: пользователи всё активнее сдают своих Близнецов в аренду — пассивный доход растёт.",
  "🌍 Дайджест: в Кузнице Артефактов замечен всплеск редких находок. Возможно, стоит попробовать и тебе.",
  "🌍 За эту неделю в OSGARD появилось больше уникальных стилей у Цифровых Близнецов — конкуренция усиливается.",
]

function pick<T>(arr: T[], seed?: number): T {
  const idx = seed !== undefined ? Math.abs(seed) % arr.length : Math.floor(Math.random() * arr.length)
  return arr[idx]
}

/* ---------------- Публичное API сервиса ---------------- */

export type PersonalityReply = {
  mode: JarvisMode
  icon: string
  label: string
  text: string
}

/**
 * Генерирует ответ ДЖАРВИСА с учётом текущего режима личности.
 * baseReply — исходный "смысловой" ответ (например, от jarvis.service.ts),
 * который дополнительно "окрашивается" в стиль выбранного режима.
 */
export function applyPersonality(mode: JarvisMode, baseReply: string, seed?: number): PersonalityReply {
  const icon = MODE_ICONS[mode]
  const label = MODE_LABELS[mode]

  let text: string
  switch (mode) {
    case "quotes":
      text = `${baseReply}\n\n${icon} ${pick(QUOTES, seed)}`
      break
    case "savage":
      text = `${pick(SAVAGE_LINES, seed)} ${icon}\n${baseReply}`
      break
    case "poet":
      text = `${icon} ${pick(POET_LINES, seed)}\n\n${baseReply}`
      break
    case "news":
      text = `${baseReply}\n\n${pick(NEWS_TEMPLATES, seed)}`
      break
    default:
      text = baseReply
  }

  return { mode, icon, label, text }
}

/** Проверяет, пора ли присылать новостной дайджест (раз в неделю). */
export function isNewsDue(lastNewsAt: number | null | undefined, now: number = Date.now()): boolean {
  if (!lastNewsAt) return true
  return now - lastNewsAt >= NEWS_INTERVAL_MS
}

/** Генерирует новостной дайджест независимо от текущего режима (для планового пуша). */
export function generateWeeklyNews(seed?: number): PersonalityReply {
  return {
    mode: "news",
    icon: MODE_ICONS.news,
    label: MODE_LABELS.news,
    text: pick(NEWS_TEMPLATES, seed),
  }
}

/** Валидирует, что строка — один из допустимых режимов. */
export function isValidMode(value: unknown): value is JarvisMode {
  return typeof value === "string" && (ALL_MODES as string[]).includes(value)
}
