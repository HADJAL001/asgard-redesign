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

  const contentType = upstream.headers.get("content-type") || "application/json"
  const contentDisposition = upstream.headers.get("content-disposition") || undefined

  /* Бинарные ответы (например ZIP-экспорт проекта) нельзя читать через .text() —
     это портит содержимое. JSON/текстовые ответы, наоборот, должны остаться как .text(),
     т.к. handleAuthIssue/handleAuthSession читают upstream.json напрямую. */
  const isBinary = !/^(application\/json|text\/)/i.test(contentType)

  if (isBinary) {
    const buffer = await upstream.arrayBuffer()
    return { status: upstream.status, text: "", json: null, contentType, contentDisposition, isBinary: true as const, buffer }
  }

  const text = await upstream.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* не JSON — оставляем как есть */
  }

  return { status: upstream.status, text, json, contentType, contentDisposition, isBinary: false as const, buffer: undefined }
}

/** Строит NextResponse из результата forwardToBackend, сохраняя бинарное тело как есть
 *  (ArrayBuffer) вместо .text() — иначе бинарные ответы (например ZIP-экспорт) портятся. */
function buildUpstreamResponse(upstream: Awaited<ReturnType<typeof forwardToBackend>>) {
  const headers: Record<string, string> = { "content-type": upstream.contentType }
  if (upstream.contentDisposition) headers["content-disposition"] = upstream.contentDisposition

  if (upstream.isBinary) {
    return new NextResponse(upstream.buffer, { status: upstream.status, headers })
  }
  return new NextResponse(upstream.text, { status: upstream.status, headers })
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

/**
 * GET auth/github/publish/connect — редиректит на GitHub OAuth consent screen.
 * Бэкенд-эндпоинт защищён Bearer-авторизацией и отвечает 302, поэтому его нельзя
 * пропустить через общий forwardToBackend: fetch() по умолчанию сам бы прошёл по
 * редиректу и вернул тело GitHub-страницы вместо серверного редиректа браузера.
 * Здесь читаем access-токен из httpOnly cookie, дергаем бэкенд с redirect: "manual"
 * и ретранслируем полученный Location обратно клиенту.
 */
async function handleGithubPublishConnect(req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value
  if (!accessToken) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  const targetUrl = new URL(`${BACKEND_URL}/auth/github/publish/connect`)
  const returnTo = req.nextUrl.searchParams.get("returnTo")
  if (returnTo) targetUrl.searchParams.set("returnTo", returnTo)

  try {
    const upstream = await fetch(targetUrl.toString(), {
      headers: { authorization: `Bearer ${accessToken}` },
      redirect: "manual",
    })

    const location = upstream.headers.get("location")
    if (upstream.status >= 300 && upstream.status < 400 && location) {
      return NextResponse.redirect(location)
    }

    return NextResponse.redirect(new URL("/projects?githubPublishConnected=0", req.url))
  } catch (err) {
    console.error("GitHub publish connect proxy error:", err)
    return NextResponse.redirect(new URL("/projects?githubPublishConnected=0", req.url))
  }
}

const ORCHESTRATOR_STREAM_RE = /^orchestrator\/stream\/[^/]+$/
const GENERATION_STREAM_RE = /^task\/[^/]+\/stream$/

/**
 * SSE-эндпоинт выполнения цепочки нельзя пропускать через forwardToBackend —
 * та функция буферизует тело через .text(), из-за чего клиент получил бы
 * событие только после закрытия соединения бэкендом. Здесь пробрасываем
 * upstream.body как есть, без ожидания.
 */
async function handleOrchestratorStream(pathStr: string, req: NextRequest, accessToken?: string) {
  if (!accessToken) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 })
  }

  const targetUrl = new URL(`${BACKEND_URL}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v))

  const upstream = await fetch(targetUrl.toString(), {
    headers: { authorization: `Bearer ${accessToken}`, accept: "text/event-stream" },
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
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

type RefreshResult = { token: string } | { error: "invalid" } | { error: "transient" }

/**
 * Пробует обновить access-токен через refresh-cookie.
 *
 * Важно различать ПОЧЕМУ обновление не удалось: если refresh-токен реально
 * истёк/невалиден (бэкенд явно ответил 401/403) — сессия действительно
 * закончилась, и куки нужно чистить. Но если бэкенд временно недоступен
 * (сеть, холодный старт Railway, 5xx) — это НЕ повод разлогинивать
 * пользователя, иначе любой сетевой сбой выглядит как принудительный логаут.
 */
async function tryRefresh(req: NextRequest): Promise<RefreshResult> {
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
  if (!refreshToken) return { error: "invalid" }

  const targetUrl = `${BACKEND_URL}/auth/refresh`
  try {
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    if (upstream.status === 401 || upstream.status === 403) return { error: "invalid" }
    if (!upstream.ok) return { error: "transient" }
    const data = await upstream.json().catch(() => null)
    if (!data?.accessToken) return { error: "transient" }
    return { token: data.accessToken }
  } catch {
    return { error: "transient" }
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
  if (req.method === "GET" && pathStr === "auth/github/publish/connect") {
    return handleGithubPublishConnect(req)
  }

  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value

  if (req.method === "GET" && ORCHESTRATOR_STREAM_RE.test(pathStr)) {
    return handleOrchestratorStream(pathStr, req, accessToken)
  }
  if (req.method === "GET" && GENERATION_STREAM_RE.test(pathStr)) {
    return handleOrchestratorStream(pathStr, req, accessToken)
  }

  try {
    let upstream = await forwardToBackend(pathStr, req, { authToken: accessToken })

    if (upstream.status === 401) {
      const refreshResult = await tryRefresh(req)

      if ("token" in refreshResult) {
        upstream = await forwardToBackend(pathStr, req, { authToken: refreshResult.token })
        const res = buildUpstreamResponse(upstream)
        res.cookies.set(ACCESS_COOKIE, refreshResult.token, cookieOptions(ACCESS_MAX_AGE))
        return res
      }

      if (refreshResult.error === "transient") {
        // Бэкенд временно недоступен — НЕ трогаем сессионные куки и не отдаём 401,
        // чтобы клиент не воспринял это как разлогин. Клиент может повторить запрос.
        return NextResponse.json(
          { error: "Сервис временно недоступен, попробуйте ещё раз" },
          { status: 503 },
        )
      }
    }

    const res = buildUpstreamResponse(upstream)
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
