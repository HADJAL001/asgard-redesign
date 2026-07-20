/**
 * Next.js API proxy — пересылает все запросы /api/* на Railway бэкенд.
 * Vercel env: BACKEND_URL = https://<your-service>.up.railway.app
 *
 * Это решает CORS-проблему: фронтенд стучится на свой же домен /api/*,
 * а Next.js сервер-сайд пересылает запрос на Railway без CORS-ограничений.
 */

import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "").replace(/\/$/, "")

export const dynamic = "force-dynamic"

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const pathStr = path.join("/")

  if (!BACKEND_URL) {
    console.error("BACKEND_URL env variable is not set")
    return NextResponse.json({ error: "Backend URL not configured" }, { status: 503 })
  }

  // Собираем URL: BACKEND_URL + /path + ?query
  const targetUrl = new URL(`${BACKEND_URL}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v))

  // Пересылаем заголовки, убираем host
  // Отключаем compression — Node.js fetch не всегда автодекомпрессирует
  const headers = new Headers()
  req.headers.forEach((v, k) => {
    if (k !== "host" && k !== "connection" && k !== "accept-encoding") headers.set(k, v)
  })
  headers.set("accept-encoding", "identity")

  let body: ArrayBuffer | undefined
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.arrayBuffer()
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: body ? body : undefined,
    })

    const responseHeaders = new Headers()
    upstream.headers.forEach((v, k) => {
      if (k !== "transfer-encoding") responseHeaders.set(k, v)
    })

    const responseBody = await upstream.arrayBuffer()
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    })
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
