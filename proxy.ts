import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

/* ================================================================
   OSGARD · Auth proxy (ранее middleware)
   ----------------------------------------------------------------
   Защищает приватные разделы приложения. Проверяет наличие JWT
   в cookie `osgard_token` (дублируется из localStorage при login/
   register/logout в lib/api-client.ts). Если токена нет —
   редиректит на /login с параметром `next`, чтобы вернуть
   пользователя обратно после входа.
   ================================================================ */

const TOKEN_COOKIE = "osgard_token"

const PROTECTED_PATHS = [
  "/dashboard",
  "/workspace",
  "/command",
  "/projects",
  "/forge",
  "/artifacts",
  "/marketplace",
  "/exchange",
  "/stake",
  "/profile",
]

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const isProtected = PROTECTED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  )

  if (!isProtected) {
    return NextResponse.next()
  }

  const token = request.cookies.get(TOKEN_COOKIE)?.value

  if (!token) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("next", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/workspace/:path*",
    "/command/:path*",
    "/projects/:path*",
    "/forge/:path*",
    "/artifacts/:path*",
    "/marketplace/:path*",
    "/exchange/:path*",
    "/stake/:path*",
    "/profile/:path*",
  ],
}
