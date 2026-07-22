import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/* ================================================================
   OSGARD · Network boundary (proxy, ранее middleware)
   ----------------------------------------------------------------
   1) Auth-гейт: защищает приватные разделы приложения. Проверяет
      наличие httpOnly cookie `osgard_access`, которую выставляет
      app/api/[...path]/route.ts при login/register/OAuth-сессии.
      Если токена нет — редиректит на /login с параметром `next`.
   2) CSP: nonce-based Content-Security-Policy на каждый запрос —
      script-src без 'unsafe-inline'; вместо него одноразовый nonce
      на запрос, который Next.js сам подставляет в свои внутренние
      инлайн-скрипты гидратации (через заголовок x-nonce).
   ================================================================ */

const TOKEN_COOKIE = "osgard_access"

const PROTECTED_PATHS = [
  "/dashboard",
  "/workspace",
  "/command",
  "/projects",
  "/orchestrator",
  "/forge",
  "/artifacts",
  "/marketplace",
  "/exchange",
  "/stake",
  "/profile",
  "/admin",
  "/twin",
  "/economy",
  "/referral",
  "/wallet",
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (isProtected) {
    const token = request.cookies.get(TOKEN_COOKIE)?.value
    if (!token) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64")
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic';
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data: https:;
    font-src 'self' data:;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    connect-src 'self' https://api.mainnet-beta.solana.com;
    upgrade-insecure-requests;
  `
  const contentSecurityPolicyHeaderValue = cspHeader.replace(/\s{2,}/g, " ").trim()

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-nonce", nonce)
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicyHeaderValue)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set("Content-Security-Policy", contentSecurityPolicyHeaderValue)
  return response
}

/* matcher теперь покрывает весь сайт (кроме статики) — CSP нужен на каждой
   странице, а не только на защищённых путях; auth-редирект внутри proxy()
   по-прежнему применяется только к PROTECTED_PATHS. */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
