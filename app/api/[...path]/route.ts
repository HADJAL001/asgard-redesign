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
/* Отдельная стойкая кука гостевого токена: переживает перезапись access/refresh
   при регистрации, чтобы POST /guest/claim знал, какого гостя забирать. httpOnly —
   гостевой JWT, как и основной, в JS не попадает. */
const GUEST_COOKIE = "osgard_guest"
const ACCESS_MAX_AGE = 20 * 60 // 20 минут (access-токен живёт 15 мин на бэкенде)
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 // 7 дней
const GUEST_MAX_AGE = 24 * 60 * 60 // 24 часа (совпадает с TTL гостевого токена на бэкенде)

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
  res.cookies.set(GUEST_COOKIE, "", { ...cookieOptions(0) })
}

async function forwardToBackend(
  pathStr: string,
  req: NextRequest,
  opts: { authToken?: string | null; bodyOverride?: string; methodOverride?: string } = {},
) {
  const targetUrl = new URL(`${BACKEND_URL}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v))

  const method = opts.methodOverride || req.method

  const forwardHeaders: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    accept: req.headers.get("accept") || "application/json",
  }
  if (opts.authToken) forwardHeaders["authorization"] = `Bearer ${opts.authToken}`
  const ifNoneMatch = req.headers.get("if-none-match")
  if (ifNoneMatch) forwardHeaders["if-none-match"] = ifNoneMatch

  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip")
  if (clientIp) {
    forwardHeaders["x-forwarded-for"] = clientIp
    forwardHeaders["x-real-ip"] = clientIp.split(",")[0].trim()
  }

  let body = opts.bodyOverride
  if (body === undefined && method !== "GET" && method !== "HEAD") {
    body = await req.text()
  }

  const upstream = await fetch(targetUrl.toString(), {
    method,
    headers: forwardHeaders,
    body: method === "GET" || method === "HEAD" ? undefined : body,
    signal: req.signal,
  })

  const contentType = upstream.headers.get("content-type") || "application/json"
  const contentDisposition = upstream.headers.get("content-disposition") || undefined
  /* ETag/Cache-Control/Vary пробрасываем как есть — иначе условное кеширование
     (If-None-Match → 304), настроенное конкретным бэкенд-роутом (например
     /certified/:serial/badge.svg), молча ломается на прокси-слое: браузер и
     встраивающие README/страницы никогда не видят эти заголовки. */
  const etag = upstream.headers.get("etag") || undefined
  const cacheControl = upstream.headers.get("cache-control") || undefined
  const vary = upstream.headers.get("vary") || undefined

  /* Бинарные ответы (например ZIP-экспорт проекта) нельзя читать через .text() —
     это портит содержимое. JSON/текстовые ответы, наоборот, должны остаться как .text(),
     т.к. handleAuthIssue/handleAuthSession читают upstream.json напрямую. */
  const isBinary = !/^(application\/json|text\/)/i.test(contentType)

  if (isBinary) {
    const buffer = upstream.status === 304 ? new ArrayBuffer(0) : await upstream.arrayBuffer()
    return { status: upstream.status, text: "", json: null, contentType, contentDisposition, etag, cacheControl, vary, isBinary: true as const, buffer }
  }

  const text = upstream.status === 304 ? "" : await upstream.text()
  let json: any = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* не JSON — оставляем как есть */
  }

  return { status: upstream.status, text, json, contentType, contentDisposition, etag, cacheControl, vary, isBinary: false as const, buffer: undefined }
}

/** Строит NextResponse из результата forwardToBackend, сохраняя бинарное тело как есть
 *  (ArrayBuffer) вместо .text() — иначе бинарные ответы (например ZIP-экспорт) портятся. */
function buildUpstreamResponse(upstream: Awaited<ReturnType<typeof forwardToBackend>>) {
  const headers: Record<string, string> = { "content-type": upstream.contentType }
  if (upstream.contentDisposition) headers["content-disposition"] = upstream.contentDisposition
  if (upstream.etag) headers["etag"] = upstream.etag
  if (upstream.cacheControl) headers["cache-control"] = upstream.cacheControl
  if (upstream.vary) headers["vary"] = upstream.vary

  // 304 не может нести тело — Next/undici кидает исключение при попытке его отдать.
  if (upstream.status === 304) {
    return new NextResponse(null, { status: 304, headers })
  }
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

/** POST guest/start — гость получает НАСТОЯЩУЮ сессию без регистрации.
 *  Бэкенд возвращает гостевой JWT в теле; мы кладём его в access-cookie (чтобы
 *  тут же работал существующий POST /projects/generate) И в стойкую guest-cookie
 *  (переживёт регистрацию → нужна для claim). Токен из тела вырезаем — в JS он
 *  не попадает, как и основной. */
async function handleGuestStart(pathStr: string, req: NextRequest) {
  const upstream = await forwardToBackend(pathStr, req)
  if (!upstream.json || !upstream.json.token) {
    return NextResponse.json(upstream.json ?? { error: "Bad response from backend" }, { status: upstream.status })
  }
  const { token, ...rest } = upstream.json
  const res = NextResponse.json(rest, { status: upstream.status })
  // Гостю не нужен refresh — только короткоживущий access + стойкая guest-кука.
  res.cookies.set(ACCESS_COOKIE, token, cookieOptions(GUEST_MAX_AGE))
  res.cookies.set(GUEST_COOKIE, token, cookieOptions(GUEST_MAX_AGE))
  return res
}

/** POST guest/claim — реальный аккаунт (уже авторизован через access-cookie)
 *  забирает гостя. Гостевой токен подставляем в тело из стойкой guest-cookie
 *  (клиентский JS до него не дотянется). При успехе guest-cookie гасим —
 *  забирать больше нечего. Бэкенд имеет и IP-fallback, если куки нет. */
async function handleGuestClaim(pathStr: string, req: NextRequest) {
  const accessToken = req.cookies.get(ACCESS_COOKIE)?.value
  const guestToken = req.cookies.get(GUEST_COOKIE)?.value
  const upstream = await forwardToBackend(pathStr, req, {
    authToken: accessToken,
    bodyOverride: JSON.stringify({ guestToken: guestToken ?? null }),
  })
  const res = buildUpstreamResponse(upstream)
  if (upstream.status === 200) {
    res.cookies.set(GUEST_COOKIE, "", { ...cookieOptions(0) })
  }
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

  const me = await forwardToBackend("auth/me", req, { authToken: token, methodOverride: "GET" })
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
const TC_MARKET_STREAM_RE = /^tc-market\/stream$/
const AUCTIONS_STREAM_RE = /^auctions\/stream$/
const NOTIFICATIONS_STREAM_RE = /^notifications\/stream$/
const PROJECTS_STREAM_RE = /^projects\/\d+\/stream$/

/**
 * SSE-эндпоинт выполнения цепочки нельзя пропускать через forwardToBackend —
 * та функция буферизует тело через .text(), из-за чего клиент получил бы
 * событие только после закрытия соединения бэкендом. Здесь пробрасываем
 * upstream.body как есть, без ожидания.
 *
 * requireAuth=false — для публичных SSE-роутов бэкенда (без requireAuth),
 * например tc-market/stream: токен пробрасывается, если есть, но его
 * отсутствие не блокирует подключение.
 */
async function handleOrchestratorStream(
  pathStr: string,
  req: NextRequest,
  accessToken?: string,
  opts: { requireAuth?: boolean } = {},
) {
  const requireAuth = opts.requireAuth ?? true
  if (requireAuth && !accessToken) {
    return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 })
  }

  const targetUrl = new URL(`${BACKEND_URL}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v))

  const headers: Record<string, string> = { accept: "text/event-stream" }
  if (accessToken) headers.authorization = `Bearer ${accessToken}`

  const upstream = await fetch(targetUrl.toString(), { headers })

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
  const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value
  if (accessToken) {
    // best-effort, не блокируем ответ клиенту. Передаём refresh-токен в теле —
    // бэкенд отзовёт именно эту сессию (refresh лежит в httpOnly-cookie, клиентский
    // JS до него не дотянется, поэтому подставляем здесь, в прокси).
    forwardToBackend("auth/logout", req, {
      authToken: accessToken,
      bodyOverride: JSON.stringify({ refreshToken: refreshToken ?? null }),
    }).catch(() => {})
  }
  return res
}

type RefreshResult = { token: string; refreshToken?: string } | { error: "invalid" } | { error: "transient" }

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
    // Бэкенд ротирует refresh — пробрасываем новый токен наверх, чтобы обновить cookie.
    return { token: data.accessToken, refreshToken: data.refreshToken }
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
  if (req.method === "POST" && pathStr === "guest/start") {
    return handleGuestStart(pathStr, req)
  }
  if (req.method === "POST" && pathStr === "guest/claim") {
    return handleGuestClaim(pathStr, req)
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
  if (req.method === "GET" && TC_MARKET_STREAM_RE.test(pathStr)) {
    return handleOrchestratorStream(pathStr, req, accessToken, { requireAuth: false })
  }
  if (req.method === "GET" && AUCTIONS_STREAM_RE.test(pathStr)) {
    // Список лотов виден анонимно (optionalAuth на бэкенде) — токен пробрасываем,
    // если есть, но отсутствие не блокирует подключение.
    return handleOrchestratorStream(pathStr, req, accessToken, { requireAuth: false })
  }
  if (req.method === "GET" && NOTIFICATIONS_STREAM_RE.test(pathStr)) {
    // Персональный поток — требует авторизации (токен из httpOnly cookie).
    return handleOrchestratorStream(pathStr, req, accessToken)
  }
  if (req.method === "GET" && PROJECTS_STREAM_RE.test(pathStr)) {
    // Живой лог генерации проекта (GET /projects/:id/stream) — владелец-only,
    // бэкенд проверяет user_id по Bearer из httpOnly cookie.
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
        // Ротированный refresh-токен — перезаписываем cookie, иначе следующий refresh
        // придёт со старым (уже отозванным) токеном и словит детекцию reuse.
        if (refreshResult.refreshToken) {
          res.cookies.set(REFRESH_COOKIE, refreshResult.refreshToken, cookieOptions(REFRESH_MAX_AGE))
        }
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
    if (err instanceof Error && err.name === "AbortError") {
      return new NextResponse(null, { status: 499 })
    }
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
