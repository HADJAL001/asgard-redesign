"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { apiClient, getStoredUser, getToken, setStoredUser, setToken } from "./api-client"

/* ================================================================
   OSGARD · Auth store (React Context)
   ----------------------------------------------------------------
   Работает поверх бэкенда /auth/*:
   - login(username, password)
   - register(username, email, password)
   - logout()
   - getToken() — для api-client / других сторов
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
}

type AuthResult = { ok: boolean; message?: string }

type AuthValue = {
  user: User | null
  token: string | null
  /** true пока идёт первичная проверка localStorage/сессии */
  loading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<AuthResult>
  register: (username: string, email: string, password: string) => Promise<AuthResult>
  /** Логин по токенам, выданным бэкендом после OAuth-редиректа (см. /auth/callback). */
  loginWithToken: (token: string, refreshToken?: string) => Promise<AuthResult>
  logout: () => void
  getToken: () => string | null
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setTokenState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  /* Восстанавливаем сессию из localStorage при монтировании */
  useEffect(() => {
    const storedToken = getToken()
    const storedUser = getStoredUser<User>()
    if (storedToken) setTokenState(storedToken)
    if (storedUser) setUser(storedUser)
    setLoading(false)
  }, [])

  const login = useCallback<AuthValue["login"]>(async (username, password) => {
    try {
      // Если введён email (содержит @) — отправляем как email, иначе как username
      const loginPayload = username.includes("@")
        ? { email: username, password }
        : { username, password }
      const data = await apiClient.post<{ token?: string; accessToken?: string; user: User }>(
        "/auth/login",
        loginPayload,
        { skipAuthRedirect: true },
      )
      // поддерживаем оба варианта: token и accessToken
      const authToken = data.token || data.accessToken || ""
      setToken(authToken)
      setStoredUser(data.user)
      setTokenState(authToken)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось выполнить вход" }
    }
  }, [])

  const register = useCallback<AuthValue["register"]>(async (username, email, password) => {
    try {
      const data = await apiClient.post<{ token?: string; accessToken?: string; user: User }>(
        "/auth/register",
        { username, email, password },
        { skipAuthRedirect: true },
      )
      // поддерживаем оба варианта: token и accessToken
      const authToken = data.token || data.accessToken || ""
      setToken(authToken)
      setStoredUser(data.user)
      setTokenState(authToken)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось зарегистрироваться" }
    }
  }, [])

  const loginWithToken = useCallback<AuthValue["loginWithToken"]>(async (authToken) => {
    try {
      setToken(authToken)
      setTokenState(authToken)
      const data = await apiClient.get<{ user: User }>("/auth/me", { skipAuthRedirect: true })
      setStoredUser(data.user)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      setToken(null)
      setTokenState(null)
      return { ok: false, message: err?.message || "Не удалось выполнить вход" }
    }
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setStoredUser(null)
    setTokenState(null)
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
      token,
      loading,
      isAuthenticated: !!token,
      login,
      register,
      loginWithToken,
      logout,
      getToken,
      refreshMe,
    }),
    [user, token, loading, login, register, loginWithToken, logout, refreshMe],
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
