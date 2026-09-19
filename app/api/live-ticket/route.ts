import crypto from "node:crypto"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const ACCESS_COOKIE = "osgard_access"
const TICKET_HEADER = "x-osgard-live-ticket"
const TICKET_TTL_MS = 5 * 60 * 1000

type TicketPayload = { sub: number; exp: number; nonce: string }

function ticketSecret() {
  return process.env.LIVE_RELAY_TICKET_SECRET || ""
}

function sign(encodedPayload: string) {
  return crypto.createHmac("sha256", ticketSecret()).update(encodedPayload).digest("base64url")
}

function hasBroadcastAccess(user: { id?: number; role?: string }) {
  const configuredIds = (process.env.LIVE_RELAY_ALLOWED_USER_IDS || "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isSafeInteger)

  if (configuredIds.length > 0) return configuredIds.includes(user.id ?? -1)
  return user.role === "admin" || user.role === "owner"
}

export async function POST(request: NextRequest) {
  const backendUrl = (process.env.BACKEND_URL || "").replace(/\/$/, "")
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value
  if (!backendUrl || !ticketSecret()) {
    return NextResponse.json({ error: "Live relay is unavailable" }, { status: 503 })
  }
  if (!accessToken) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

  try {
    const upstream = await fetch(`${backendUrl}/auth/me`, {
      headers: { authorization: `Bearer ${accessToken}`, accept: "application/json" },
      cache: "no-store",
    })
    if (!upstream.ok) return NextResponse.json({ error: "Authentication required" }, { status: 401 })

    const body = await upstream.json() as { user?: { id?: number; role?: string } }
    if (!body.user || !hasBroadcastAccess(body.user)) {
      return NextResponse.json({ error: "Broadcast access is not granted" }, { status: 403 })
    }

    const payload: TicketPayload = {
      sub: body.user.id!,
      exp: Date.now() + TICKET_TTL_MS,
      nonce: crypto.randomUUID(),
    }
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
    return NextResponse.json({ ticket: `${encoded}.${sign(encoded)}`, expiresAt: payload.exp }, {
      headers: { "Cache-Control": "no-store" },
    })
  } catch {
    return NextResponse.json({ error: "Live relay is unavailable" }, { status: 503 })
  }
}

export async function GET(request: NextRequest) {
  const rawTicket = request.headers.get(TICKET_HEADER)
  if (!rawTicket || !ticketSecret()) return new NextResponse(null, { status: 401 })

  const [encodedPayload, receivedSignature, ...rest] = rawTicket.split(".")
  if (!encodedPayload || !receivedSignature || rest.length > 0) return new NextResponse(null, { status: 401 })

  const expectedSignature = sign(encodedPayload)
  const received = Buffer.from(receivedSignature)
  const expected = Buffer.from(expectedSignature)
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TicketPayload
    if (!Number.isSafeInteger(payload.sub) || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) {
      return new NextResponse(null, { status: 401 })
    }
  } catch {
    return new NextResponse(null, { status: 401 })
  }

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } })
}
