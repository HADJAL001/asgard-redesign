/* ================================================================
   guest-session — клиент воронки «1 бесплатный проект по IP»
   ----------------------------------------------------------------
   Тонкие fetch-хелперы над Next-прокси /api/guest/*. Сам гостевой JWT
   в JS НЕ хранится — прокси кладёт его в httpOnly cookie (access +
   стойкая osgard_guest), поэтому здесь только «команды», без токенов
   (тот же принцип, что и demo-client.ts / auth через cookie).

     startGuestSession() — провижинит гостя и открывает cookie-сессию;
                           после него существующий useOsgardStore.generateProject()
                           работает у гостя без изменений.
     claimGuestSession() — вызывается best-effort после регистрации/входа;
                           переносит гостевой проект на реальный аккаунт.
     getGuestStatus()    — состояние воронки для раздела «Доработки».
   ================================================================ */

export interface GuestStartResult {
  ok: boolean
  existing?: boolean
  hasProject?: boolean
  projectId?: number | null
  message?: string
  code?: string
}

/** Открывает гостевую cookie-сессию. Идемпотентно на стороне сервера:
 *  повторный вызов с того же IP вернёт того же гостя (existing:true). */
export async function startGuestSession(): Promise<GuestStartResult> {
  try {
    const r = await fetch("/api/guest/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const data = await r.json().catch(() => null)
    if (!r.ok) {
      return {
        ok: false,
        message: data?.error || "Не удалось создать гостевую сессию",
        code: typeof data?.code === "string" ? data.code : undefined,
      }
    }
    return {
      ok: true,
      existing: !!data?.existing,
      hasProject: !!data?.hasProject,
      projectId: data?.projectId ?? null,
    }
  } catch {
    return { ok: false, message: "Сеть недоступна" }
  }
}

export interface GuestClaimResult {
  ok: boolean
  projectsMoved: number
  artifactsMoved: number
}

/** Переносит гостевой проект на текущий (уже авторизованный) аккаунт.
 *  Best-effort: любые ошибки проглатываются — регистрация от этого не страдает. */
export async function claimGuestSession(): Promise<GuestClaimResult> {
  try {
    const r = await fetch("/api/guest/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    })
    const data = await r.json().catch(() => null)
    if (!r.ok || !data?.ok) return { ok: false, projectsMoved: 0, artifactsMoved: 0 }
    return {
      ok: true,
      projectsMoved: Number(data.projectsMoved) || 0,
      artifactsMoved: Number(data.artifactsMoved) || 0,
    }
  } catch {
    return { ok: false, projectsMoved: 0, artifactsMoved: 0 }
  }
}

export interface GuestStatus {
  authenticated: boolean
  isGuest?: boolean
  hasProject?: boolean
  projectId?: number | null
  /** Остаток бесплатных доработок — домен механики Claude B; пока null. */
  refinementsRemaining?: number | null
}

/** Состояние воронки (кто ты, есть ли проект). Токен-агностично. */
export async function getGuestStatus(): Promise<GuestStatus> {
  try {
    const r = await fetch("/api/guest/status", { method: "GET" })
    const data = await r.json().catch(() => null)
    if (!r.ok || !data) return { authenticated: false }
    return {
      authenticated: !!data.authenticated,
      isGuest: !!data.isGuest,
      hasProject: !!data.hasProject,
      projectId: data.projectId ?? null,
      refinementsRemaining: data.refinementsRemaining ?? null,
    }
  } catch {
    return { authenticated: false }
  }
}
