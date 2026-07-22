/* ================================================================
   OSGARD · API client
   ----------------------------------------------------------------
   Тонкая обёртка над fetch. Сессия хранится в httpOnly cookie,
   которую выставляет и обновляет app/api/[...path]/route.ts —
   JWT никогда не попадает в JS на клиенте (localStorage/XSS-кража
   токена исключены). Здесь мы только:
   - шлём запросы с credentials: "include", чтобы cookie уходила
     вместе с запросом (тот же origin — /api/*)
   - кешируем сам объект user (не токен) в localStorage для
     мгновенной отрисовки навбара до ответа /auth/me
   - при 401 редиректим на /login
   ================================================================ */

export const API_BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_API_URL || "/api")
    : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003")

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
  setStoredUser(null)
  if (window.location.pathname !== "/login") {
    window.location.href = "/login"
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: any
  /** Пропустить редирект на /login при 401 (например, для /auth/login и /auth/me на старте). */
  skipAuthRedirect?: boolean
}

async function request<T = any>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, skipAuthRedirect, ...rest } = options

  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  }

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: "include",
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
    // Протухшая (ghost) сессия: JWT валиден, но userId уже не существует в БД
    // (например, после пересоздания эфемерной SQLite на Railway). Бэкенд помечает
    // такие ответы `code: "USER_NOT_FOUND"` независимо от статуса (401/404) —
    // без явного skipAuthRedirect ведём себя так же, как при 401.
    if (data?.code === "USER_NOT_FOUND" && !skipAuthRedirect) {
      redirectToLogin()
    }
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
