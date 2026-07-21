/**
 * Next.js API proxy — пересылает все запросы /api/* на Railway бэкенд.
 * Vercel env: BACKEND_URL = https://<your-service>.up.railway.app
 *
 * Сессия хранится в httpOnly cookie (не в localStorage): JWT никогда
 * не попадает в JS на клиенте, что закрывает кражу токена через XSS.
 * - auth/login, auth/register, auth/session — принимают ответ бэкенда,
 *   выставляют cookie access/refresh, возвращают клиенту тело БЕЗ токенов.
 * - auth/logout — чистит cookie.
 * - все остальные пути — сервер сам подставляет Authorization из cookie
 *   и при 401 один раз пытается тихо обновить access-токен через
 *   refresh-cookie перед тем как отдать 401 клиенту.
 */

import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

export const dynamic = "force-dynamic"

const ACCESS_COOKIE = "osgard_access"
const REFRESH_COOKIE = "osgard_refresh"
const ACCESS_MAX_AGE = 20 * 60 // 20 минут (access-токен живёт 15 мин на бэкенде)
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 // 7 дней

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  }
}

function setSessionCookies(res: NextResponse, token: string, refreshToken?: string | null) {
  res.cookies.set(ACCESS_COOKIE, token, cookieOptions(ACCESS_MAX_AGE))
  if (refreshToken) {
    res.cookies.set(REFRESH_COOKIE, refreshToken, cookieOptions(REFRESH_MAX_AGE))
  }
}

function clearSessionCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions(0) })
  res.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions(0) })
}

async function forwardToBackend(
  pathStr: string,
  req: NextRequest,
  opts: { authToken?: string | null; bodyOverride?: string } = {},
) {
  const targetUrl = new URL(`${BACKEND_URL}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v))

  const forwardHeaders: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    accept: req.headers.get("accept") || "application/json",
  }
  if (opts.authToken) forwardHeaders["authorization"] = `Bearer ${opts.authToken}`

  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip")
  if (clientIp) {
    forwardHeaders["x-forwarded-for"] = clientIp
    forwardHeaders["x-real-ip"] = clientIp.split(",")[0].trim()
  }

  let body = opts.bodyOverride
  if (body === undefined && req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text()
  }

  const upstream = await fetch(targetUrl.toString(), {
    method: req.method,
    headers: forwardHeaders,
    body,
  })

  const text = await upstream.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* не JSON — оставляем как есть */
  }

  return { status: upstream.status, text, json, contentType: upstream.headers.get("content-type") || "application/json" }
}

/** login / register: выставляет httpOnly cookie, скрывает токены из тела ответа. */
async function handleAuthIssue(pathStr: string, req: NextRequest) {
  const upstream = await forwardToBackend(pathStr, req)

  if (!upstream.json || !upstream.json.token) {
    return NextResponse.json(upstream.json ?? { error: "Bad response from backend" }, { status: upstream.status })
  }

  const { token, refreshToken, ...rest } = upstream.json
  const res = NextResponse.json(rest, { status: upstream.status })
  setSessionCookies(res, token, refreshToken)
  return res
}

/** OAuth callback передаёт token/refreshToken, полученные бэкендом в query-редиректе.
 *  Обмениваем их на httpOnly cookie и отдаём профиль — JS их не сохраняет. */
async function handleAuthSession(req: NextRequest) {
  let payload: any = null
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }

  const token = payload?.token as string | undefined
  const refreshToken = payload?.refreshToken as string | undefined
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 })
  }

  const me = await forwardToBackend("auth/me", req, { authToken: token, bodyOverride: "" })
  if (me.status !== 200 || !me.json) {
    return NextResponse.json(me.json ?? { error: "Invalid token" }, { status: me.status || 401 })
  }

  const res = NextResponse.json(me.json, { status: 200 })
  setSessionCookies(res, token, refreshToken)
  return res
}

function handleAuthLogout(req: NextRequest) {
  const res = NextResponse.json({ success: true })
  clearSessionCookies(res)
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value
  if (accessToken) {
    // best-effort, не блокируем ответ клиенту
    forwardToBackend("auth/logout", req, { authToken: accessToken, bodyOverride: "" }).catch(() => {})
  }
  return res
}

/** Пробует обновить access-токен через refresh-cookie. Возвращает новый токен либо null. */
async function tryRefresh(req: NextRequest): Promise<string | null> {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return null

  const targetUrl = `${BACKEND_URL}/auth/refresh`
  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    if (!upstream.ok) return null
    const data = await upstream.json().catch(() => null)
    return data?.accessToken || null
  } catch {
    return null
  }
}

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const pathStr = path.join("/")

  if (!BACKEND_URL) {
    console.error("BACKEND_URL env variable is not set")
    return NextResponse.json({ error: "Backend URL not configured" }, { status: 503 })
  }

  if (req.method === "POST" && (pathStr === "auth/login" || pathStr === "auth/register")) {
    return handleAuthIssue(pathStr, req)
  }
  if (req.method === "POST" && pathStr === "auth/session") {
    return handleAuthSession(req)
  }
  if (req.method === "POST" && pathStr === "auth/logout") {
    return handleAuthLogout(req)
  }

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value

  try {
    let upstream = await forwardToBackend(pathStr, req, { authToken: accessToken })

    if (upstream.status === 401 && accessToken) {
      const newToken = await tryRefresh(req)
      if (newToken) {
        upstream = await forwardToBackend(pathStr, req, { authToken: newToken })
        const res = new NextResponse(upstream.text, {
          status: upstream.status,
          headers: { "content-type": upstream.contentType },
        })
        res.cookies.set(ACCESS_COOKIE, newToken, cookieOptions(ACCESS_MAX_AGE))
        return res
      }
    }

    const res = new NextResponse(upstream.text, {
      status: upstream.status,
      headers: { "content-type": upstream.contentType },
    })
    if (upstream.status === 401) clearSessionCookies(res)
    return res
  } catch (err: unknown) {
    console.error("Proxy error:", err)
    return NextResponse.json({ error: "Не удалось соединиться с сервером" }, { status: 502 })
  }
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
