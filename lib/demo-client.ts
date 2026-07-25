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
