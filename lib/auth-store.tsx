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
      const data = await apiClient.post<{ token: string; user: User }>(
        "/auth/login",
        { username, password },
        { skipAuthRedirect: true },
      )
      setToken(data.token)
      setStoredUser(data.user)
      setTokenState(data.token)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось выполнить вход" }
    }
  }, [])

  const register = useCallback<AuthValue["register"]>(async (username, email, password) => {
    try {
      const data = await apiClient.post<{ token: string; user: User }>(
        "/auth/register",
        { username, email, password },
        { skipAuthRedirect: true },
      )
      setToken(data.token)
      setStoredUser(data.user)
      setTokenState(data.token)
      setUser(data.user)
      return { ok: true }
    } catch (err: any) {
      return { ok: false, message: err?.message || "Не удалось зарегистрироваться" }
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
      logout,
      getToken,
      refreshMe,
    }),
    [user, token, loading, login, register, logout, refreshMe],
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
