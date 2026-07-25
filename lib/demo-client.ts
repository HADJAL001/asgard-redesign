/* ================================================================
   demo-client — чистые функции demo-generate флоу без React-состояния
   ----------------------------------------------------------------
   Извлечено из components/DemoProjectModal.tsx, чтобы hero-форма
   (eternity-landing.tsx) и модалка могли использовать один и тот же
   источник истины для сессии/сетевого вызова.
   ================================================================ */

export interface DemoArtifact {
  id: string
  name: string
  type: string
  rarity: "common" | "uncommon" | "rare" | "epic" | "legendary"
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  price: number
}

export interface DemoProject {
  name: string
  description: string
  badge: string
  artifactCount: number
  artifacts: DemoArtifact[]
  generatedAt: number
}

export interface DemoSessionV2 {
  projects: DemoProject[]
  generationsUsed: number
  expiresAt: number
}

export const STORAGE_KEY = "osgard_demo_v2"
export const MAX_GENERATIONS = 3

export function loadSession(): DemoSessionV2 {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const d = JSON.parse(raw) as DemoSessionV2
      if (d.expiresAt > Date.now()) return d
    }
  } catch { /* ignore */ }
  return { projects: [], generationsUsed: 0, expiresAt: Date.now() + 86400_000 }
}

export function saveSession(s: DemoSessionV2) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
}

export function clearSession() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export interface ConvertDemoResult {
  converted: number   // сколько артефактов перенесено в аккаунт
  projects: number    // сколько вселенных перенесено
  bonus: number       // начисленный бонус TC (одноразовый)
}

/**
 * Переносит демо-вселенные из localStorage в реальный аккаунт через
 * POST /api/demo/convert. Вызывать СРАЗУ после успешной регистрации/входа —
 * авторизация идёт по httpOnly-cookie сессии (proxy подставляет Bearer).
 *
 * Best-effort: если демо-данных нет — тихо возвращает нули; при сетевой ошибке
 * localStorage НЕ очищаем (можно повторить при следующем входе), возвращаем нули.
 * На успехе очищаем сессию, чтобы не сконвертировать повторно.
 */
export async function convertDemoSession(): Promise<ConvertDemoResult> {
  const empty: ConvertDemoResult = { converted: 0, projects: 0, bonus: 0 }

  let session: DemoSessionV2
  try { session = loadSession() } catch { return empty }
  if (!session.projects || session.projects.length === 0) return empty

  try {
    const res = await fetch("/api/demo/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ projects: session.projects }),
    })
    if (!res.ok) return empty
    const data = await res.json().catch(() => ({} as any))
    clearSession()
    return {
      converted: Number(data.artifactsConverted) || 0,
      projects: Number(data.projectsConverted) || 0,
      bonus: Number(data.bonusTokens) || 0,
    }
  } catch {
    return empty
  }
}

export type GenerateDemoProjectResult =
  | { ok: true; project: DemoProject }
  | { ok: false; limitReached: true }
  | { ok: false; limitReached: false; error: string }

/** Вызывает /api/demo/generate и нормализует ответ в DemoProject. */
export async function generateDemoProject(name: string, hint: string): Promise<GenerateDemoProjectResult> {
  try {
    const res = await fetch("/api/demo/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, hint }),
    })

    if (!res.ok) {
      if (res.status === 429) return { ok: false, limitReached: true }
      const j = await res.json().catch(() => ({}))
      return { ok: false, limitReached: false, error: j.error || "Ошибка генерации. Попробуй ещё раз." }
    }

    const data = await res.json()
    const project: DemoProject = {
      name: data.project.name,
      description: data.project.description,
      badge: data.project.badge,
      artifactCount: data.artifacts.length,
      artifacts: data.artifacts,
      generatedAt: Date.now(),
    }
    return { ok: true, project }
  } catch {
    return { ok: false, limitReached: false, error: "Сервер недоступен. Попробуй позже." }
  }
}
