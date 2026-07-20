/**
 * Next.js API proxy — пересылает все запросы /api/* на Railway бэкенд.
 * Vercel env: BACKEND_URL = https://<your-service>.up.railway.app
 */

import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

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

  // Собираем целевой URL
  const targetUrl = new URL(`${BACKEND_URL}/${pathStr}`)
  req.nextUrl.searchParams.forEach((v, k) => targetUrl.searchParams.set(k, v))

  // Минимальный набор заголовков — только то что нужно бэкенду
  const forwardHeaders: Record<string, string> = {
    "content-type": req.headers.get("content-type") || "application/json",
    "accept": req.headers.get("accept") || "application/json",
  }

  // Пробрасываем Authorization если есть
  const auth = req.headers.get("authorization")
  if (auth) forwardHeaders["authorization"] = auth

  // Читаем тело для не-GET методов
  let body: string | undefined
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text()
  }

  try {
    const upstream = await fetch(targetUrl.toString(), {
      method: req.method,
      headers: forwardHeaders,
      body: body,
    })

    const responseText = await upstream.text()
    const contentType = upstream.headers.get("content-type") || "application/json"

    return new NextResponse(responseText, {
      status: upstream.status,
      headers: {
        "content-type": contentType,
      },
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
