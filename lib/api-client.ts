/* ================================================================
   OSGARD · API client
   ----------------------------------------------------------------
   Тонкая обёртка над fetch:
   - базовый URL бэкенда (http://localhost:3003)
   - автоматически подставляет JWT из localStorage в заголовок
     Authorization: Bearer <token>
   - при 401 (не авторизован / токен истёк) чистит токен и
     редиректит на /login
   ================================================================ */

// На продакшне всегда используем /api (Next.js прокси → Railway бэкенд)
// В dev используем переменную или localhost
export const API_BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "/api")
    : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003")

export const TOKEN_KEY = "osgard_token"
export const USER_KEY = "osgard_user"

export class ApiError extends Error {
  status: number
  data: any
  constructor(status: number, message: string, data?: any) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.data = data
  }
}

/** Устанавливает/удаляет cookie osgard_token, чтобы middleware.ts (Edge/сервер) мог его читать. */
function setCookieToken(token: string | null) {
  if (typeof document === "undefined") return
  if (token) {
    // 7 дней, доступна во всём приложении
    document.cookie = `${TOKEN_KEY}=${encodeURIComponent(token)}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
  } else {
    document.cookie = `${TOKEN_KEY}=; path=/; max-age=0; SameSite=Lax`
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore storage errors */
  }
  setCookieToken(token)
}


export function getStoredUser<T = any>(): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function setStoredUser(user: any | null) {
  if (typeof window === "undefined") return
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_KEY)
  } catch {
    /* ignore storage errors */
  }
}

function redirectToLogin() {
  if (typeof window === "undefined") return
  setToken(null)
  setStoredUser(null)
  if (window.location.pathname !== "/login") {
    window.location.href = "/login"
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: any
  /** Пропустить редирект на /login при 401 (например, для самого /auth/login). */
  skipAuthRedirect?: boolean
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, skipAuthRedirect, ...rest } = options

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  }

  const token = getToken()
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new ApiError(0, "Не удалось соединиться с сервером")
  }

  if (res.status === 401 && !skipAuthRedirect) {
    redirectToLogin()
    throw new ApiError(401, "Требуется авторизация")
  }

  const contentType = res.headers.get("content-type") || ""
  const data = contentType.includes("application/json") ? await res.json().catch(() => null) : null

  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `Ошибка запроса (${res.status})`
    throw new ApiError(res.status, message, data)
  }

  return data as T
}

export const apiClient = {
  get: <T = any>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "GET" }),
  post: <T = any>(path: string, body?: any, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "POST", body }),
  patch: <T = any>(path: string, body?: any, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  put: <T = any>(path: string, body?: any, options?: RequestOptions) =>
    request<T>(path, { ...options, method: "PUT", body }),
  delete: <T = any>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: "DELETE" }),
}

export default apiClient
