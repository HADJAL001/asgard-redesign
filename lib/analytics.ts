/* ================================================================
   OSGARD · Продуктовая аналитика (paywall-воронка)
   ----------------------------------------------------------------
   Анонимная session_id живёт в localStorage и переживает переходы
   между страницами в рамках одного браузера — на бэкенде по ней
   склеивается pricing_view → pricing_click → pricing_conversion/
   pricing_abandon в одну сессию (см. AdminController.paywallFunnel).
   track() шлётся с keepalive: true, чтобы событие успевало уйти даже
   из обработчика beforeunload (см. usePricingAnalytics в pricing-view).
   ================================================================ */

import { API_BASE_URL } from "./api-client"

const SESSION_KEY = "osgard_analytics_session"
/* 30 дней — совпадает с дефолтным окном ?days= в paywall-воронке админки
   (AdminController.paywallFunnel). Без TTL один и тот же session_id мог жить
   в localStorage годами, склеивая в один "визит" события, разделённые
   месяцами, и искажая funnel/decision-time метрики. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

export function getAnalyticsSessionId(): string {
  if (typeof window === "undefined") return "server"
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; createdAt?: number }
      if (parsed?.id && typeof parsed.createdAt === "number" && Date.now() - parsed.createdAt < SESSION_TTL_MS) {
        return parsed.id
      }
    }
    const id = generateId()
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, createdAt: Date.now() }))
    return id
  } catch {
    return generateId()
  }
}

export function track(eventName: string, meta?: Record<string, any>) {
  if (typeof window === "undefined") return
  try {
    fetch(`${API_BASE_URL}/analytics/event`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ session_id: getAnalyticsSessionId(), event_name: eventName, meta }),
    }).catch(() => {
      /* аналитика не должна ронять страницу при сетевой ошибке */
    })
  } catch {
    /* ignore */
  }
}
