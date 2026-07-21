/* ================================================================
   OSGARD · ВАЛЛИ Personality (фронтенд-зеркало backend/src/services/jarvis-personality.service.ts)
   ----------------------------------------------------------------
   Бэкенд-модули не импортируются в Next.js фронт, поэтому enum режимов
   и их иконки/подписи продублированы здесь. Источник истины по логике
   применения режима — бэкенд; здесь только для UI-селектора и кэша.
   ================================================================ */

import apiClient from "@/lib/api-client"

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

const PERSONALITY_MODE_KEY = "jarvis_personality_mode"

export function isValidJarvisMode(value: unknown): value is JarvisMode {
  return typeof value === "string" && (ALL_MODES as string[]).includes(value)
}

export function loadPersonalityModeFromCache(): JarvisMode {
  if (typeof window === "undefined") return "default"
  try {
    const saved = localStorage.getItem(PERSONALITY_MODE_KEY)
    if (isValidJarvisMode(saved)) return saved
  } catch {
    /* ignore */
  }
  return "default"
}

export function savePersonalityModeToCache(mode: JarvisMode) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(PERSONALITY_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

export type PersonalityResponse = {
  mode: JarvisMode
  icon: string
  label: string
  modes: { mode: JarvisMode; icon: string; label: string }[]
}

/** Подтягивает сохранённый на сервере режим личности (для гидратации при заходе). */
export async function fetchPersonalityFromServer(): Promise<JarvisMode | null> {
  try {
    const res = await apiClient.get<PersonalityResponse>("/jarvis/personality")
    if (isValidJarvisMode(res.mode)) {
      savePersonalityModeToCache(res.mode)
      return res.mode
    }
  } catch {
    /* ignore — останемся на локальном/дефолтном режиме */
  }
  return null
}
