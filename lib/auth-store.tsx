"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { apiClient, ApiError, getStoredUser, setStoredUser } from "./api-client"
import { clearReferralCode, getReferralCode } from "./referral"

/* ================================================================
   OSGARD · Auth store (React Context)
   ----------------------------------------------------------------
   Работает поверх бэкенда /auth/* через httpOnly-cookie сессию
   (см. app/api/[...path]/route.ts). Сам JWT в JS никогда не
   попадает — тут храним только объект user (для UI) и признак
   isAuthenticated.
   ================================================================ */

export type User = {
  id: number
  username: string
  email?: string | null
  displayName?: string | null
  level?: number
  avatarUrl?: string | null
  bio?: string | null
  createdAt?: string | number
  role?: string
  banned?: boolean
  twofaEnabled?: boolean
  githubPublishConnected?: boolean
  githubPublishUsername?: string | null
}

type AuthResult = { ok: boolean; message?: string }

type AuthValue = {
  user: User | null
  /** true пока идёт первичная проверка сессии (/auth/me) */
  loading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<AuthResult>
  register: (username: string, email: string, password: string) => Promise<AuthResult>
  /** Логин по токенам, выданным бэкендом после OAuth-редиректа (см. /auth/callback). */
  loginWithToken: (token: string, refreshToken?: string) => Promise<AuthResult>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)

  /* Если в localStorage есть кешированный пользователь — стартуем без
     состояния загрузки (мгновенная гидрация). Иначе loading=true пока
     не придёт ответ /auth/me или не истечёт таймаут.
     Это навсегда убирает "застрявший" splash-экран. */
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return false
    return !getStoredUser<User>()
  })

  /* Восстанавливаем сессию: cookie есть на сервере — /auth/me её примет. */
  useEffect(() => {
    const cached = getStoredUser<User>()
    if (cached) setUser(cached)

    /* Страховочный таймаут 1.5 секунды — если бэкенд не ответил,
       показываем контент немедленно. Для гостей (нет кеша) особенно важно —
       они не должны ждать ответа бэкенда для просмотра лендинга. */
    const timeoutId = setTimeout(() => setLoading(false), 1_500)

    apiClient
      .get<{ user: User }>("/auth/me", { skipAuthRedirect: true })
      .then((data) => {
        setUser(data.user)
        setStoredUser(data.user)
      })
      .catch((err) => {
        // Разлогиниваем только при подтверждённой невалидной сессии (401/403, либо
        // 404 с кодом USER_NOT_FOUND — JWT указывает на userId, которого больше нет
        // в БД, например после пересоздания эфемерной SQLite на Railway).
        // Сетевые сбои, 5xx и 503 от прокси при холодном старте бэкенда не должны
        // сбрасывать уже известного пользователя — иначе кратковременный сбой
        // выглядит как "выкинуло из аккаунта" без действия пользователя.
        const isInvalidSession =
          err instanceof ApiError &&
          (err.status === 401 || err.status === 403 || (err.status === 404 && err.data?.code === "USER_NOT_FOUND"))
        if (isInvalidSession) {
          setUser(null)
          setStoredUser(null)
        }
      })
      .finally(() => {
        clearTimeout(timeoutId)
        setLoading(false)
      })
  }, [])

  const login = useCallback<AuthValue["login"]>(async (username, password) => {
    try {
      const loginPayload = username.includes("@")
        ? { email: username, password }
        : { username, password }
      const data = await apiClient.post<{ user: User }>("/auth/login", loginPayload, { skipAuthRedirect: true })
      setStoredUser(data.user)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось выполнить вход" }
    }
  }, [])

  const register = useCallback<AuthValue["register"]>(async (username, email, password) => {
    try {
      const referralCode = getReferralCode()
      const data = await apiClient.post<{ user: User }>(
        "/auth/register",
        { username, email, password, ...(referralCode ? { referralCode } : {}) },
        { skipAuthRedirect: true },
      )
      clearReferralCode()
      setStoredUser(data.user)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось зарегистрироваться" }
    }
  }, [])

  const loginWithToken = useCallback<AuthValue["loginWithToken"]>(async (token, refreshToken) => {
    try {
      const data = await apiClient.post<{ user: User }>(
        "/auth/session",
        { token, refreshToken },
        { skipAuthRedirect: true },
      )
      setStoredUser(data.user)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось выполнить вход" }
    }
  }, [])

  const logout = useCallback(() => {
    apiClient.post("/auth/logout", undefined, { skipAuthRedirect: true }).catch(() => {})
    setStoredUser(null)
    setUser(null)
    if (typeof window !== "undefined") {
      window.location.href = "/login"
    }
  }, [])

  const refreshMe = useCallback(async () => {
    try {
      const data = await apiClient.get<{ user: User }>("/auth/me")
      setUser(data.user)
      setStoredUser(data.user)
    } catch {
      /* ignore — 401 already handled by api-client redirect */
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      login,
      register,
      loginWithToken,
      logout,
      refreshMe,
    }),
    [user, loading, login, register, loginWithToken, logout, refreshMe],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

/** Хук-хелпер: редиректит на /login, если пользователь не авторизован (клиентская защита). */
export function useRequireAuth() {
  const { isAuthenticated, loading } = useAuth()
  const router = useRouter()
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login")
    }
  }, [loading, isAuthenticated, router])
}
