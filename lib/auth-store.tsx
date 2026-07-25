"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { apiClient, ApiError, getStoredUser, setStoredUser } from "./api-client"
import { convertDemoSession } from "./demo-client"

/* После успешного входа/регистрации переносим демо-вселенную гостя (localStorage)
   в его аккаунт. DRY + best-effort: вызывается из ВСЕХ auth-путей (register/login/
   OAuth), поэтому ни одна точка входа не теряет демо-данные. Результат кладём во
   флаг osgard_demo_converted — дашборд покажет подтверждение «вселенная сохранена».
   Ошибки/отсутствие данных не мешают входу. */
async function runDemoConversion() {
  try {
    const r = await convertDemoSession()
    if (r.converted > 0) {
      try {
        localStorage.setItem(
          "osgard_demo_converted",
          JSON.stringify({ artifacts: r.converted, projects: r.projects, bonus: r.bonus }),
        )
      } catch {
        /* ignore storage errors */
      }
    }
  } catch {
    /* best-effort — не блокируем вход */
  }
}
import { clearReferralCode, getReferralCode } from "./referral"
import { takeShareAttribution } from "./analytics"
import { claimGuestSession } from "./guest-session"

/* После входа/регистрации забираем гостевой проект (воронка «1 бесплатный
   проект по IP»): проект и артефакты гостя переносятся на реальный аккаунт.
   Best-effort и идемпотентно (серверный claim одноразовый) — вызывается со
   ВСЕХ auth-путей, как и runDemoConversion, чтобы ни одна точка входа не
   теряла гостевую работу. Если гостя не было — просто no-op. */
async function runGuestClaim() {
  try {
    await claimGuestSession()
  } catch {
    /* best-effort — не блокируем вход */
  }
}

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

type AuthResult = { ok: boolean; message?: string; twofaRequired?: boolean }

type AuthValue = {
  user: User | null
  /** true пока идёт первичная проверка сессии (/auth/me) */
  loading: boolean
  isAuthenticated: boolean
  /** twofaCode — TOTP или резервный код; передаётся на втором шаге, если бэкенд
   *  вернул twofaRequired на первом (только пароль). */
  login: (username: string, password: string, twofaCode?: string) => Promise<AuthResult>
  register: (username: string, email: string, password: string) => Promise<AuthResult>
  /** Логин по токенам, выданным бэкендом после OAuth-редиректа (см. /auth/callback). */
  loginWithToken: (token: string, refreshToken?: string) => Promise<AuthResult>
  logout: () => void
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  /* Если в localStorage есть кешированный пользователь — стартуем без
     состояния загрузки (мгновенная гидрация). Иначе loading=true пока
     не придёт ответ /auth/me или не истечёт таймаут.
     Это навсегда убирает "застрявший" splash-экран. */
  const [user, setUser] = useState<User | null>(() => {
    if (typeof window === "undefined") return null
    return getStoredUser<User>()
  })
  const [loading, setLoading] = useState(() => {
    if (typeof window === "undefined") return false
    return !getStoredUser<User>()
  })

  /* Восстанавливаем сессию: cookie есть на сервере — /auth/me её примет. */
  useEffect(() => {
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

  const login = useCallback<AuthValue["login"]>(async (username, password, twofaCode) => {
    try {
      const base = username.includes("@")
        ? { email: username, password }
        : { username, password }
      // 6-значный ввод трактуем как TOTP, иначе — как резервный код (xxxxx-xxxxx).
      const twofaField = twofaCode
        ? /^\d{6}$/.test(twofaCode.trim())
          ? { twofaToken: twofaCode.trim() }
          : { backupCode: twofaCode.trim() }
        : {}
      const loginPayload = { ...base, ...twofaField }
      const data = await apiClient.post<{ user?: User; twofaRequired?: boolean }>(
        "/auth/login",
        loginPayload,
        { skipAuthRedirect: true },
      )
      // Бэкенд ответил 200 с флагом «нужен второй фактор» — токены НЕ выданы.
      if (data.twofaRequired) {
        return { ok: false, twofaRequired: true, message: "Введите код двухфакторной аутентификации" }
      }
      if (!data.user) {
        return { ok: false, message: "Не удалось выполнить вход" }
      }
      setStoredUser(data.user)
      setUser(data.user)
      await runDemoConversion()
      await runGuestClaim()
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось выполнить вход" }
    }
  }, [])

  const register = useCallback<AuthValue["register"]>(async (username, email, password) => {
    try {
      const referralCode = getReferralCode()
      // Виральная атрибуция: одноразово забираем first-touch маркер share-ссылки
      // (ставится в artifact-detail-view для гостя) и передаём в register — бэкенд
      // пишет его в meta.src, growth-ридер считает viralRegistrations и K-фактор.
      const src = takeShareAttribution()
      const data = await apiClient.post<{ user: User }>(
        "/auth/register",
        { username, email, password, ...(referralCode ? { referralCode } : {}), ...(src ? { src } : {}) },
        { skipAuthRedirect: true },
      )
      clearReferralCode()
      setStoredUser(data.user)
      setUser(data.user)
      await runDemoConversion()
      await runGuestClaim()
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
      await runDemoConversion()
      await runGuestClaim()
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
