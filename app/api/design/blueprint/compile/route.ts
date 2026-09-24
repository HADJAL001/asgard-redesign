import { NextRequest, NextResponse } from "next/server"

const BACKEND_URL = (process.env.BACKEND_URL || "").replace(/\/$/, "")

export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  if (!BACKEND_URL) return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  const body = await request.text()
  const access = request.cookies.get("osgard_access")?.value
  try {
    const upstream = await fetch(`${BACKEND_URL}/design/blueprint/compile`, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") || "application/json", ...(access ? { authorization: `Bearer ${access}` } : {}) },
      body,
      signal: AbortSignal.timeout(20_000),
    })
    return new NextResponse(await upstream.text(), { status: upstream.status, headers: { "content-type": upstream.headers.get("content-type") || "application/json", "cache-control": "no-store" } })
  } catch {
    return NextResponse.json({ error: "backend_unavailable" }, { status: 503 })
  }
}
