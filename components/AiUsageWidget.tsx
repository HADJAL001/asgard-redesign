"use client"

/* ================================================================
   AiUsageWidget — виджет дневного использования AI
   ----------------------------------------------------------------
   Показывает текущее использование OS 5.0 / OS 3.3 / OS 3.0
   относительно дневного лимита тарифа. Обновляется при монтировании.

   Используется в dashboard-view.tsx и может быть вставлен
   в любой layout рядом с балансами.

   Нажатие "Улучшить тариф" ведёт на /pricing.
   ================================================================ */

import { useState, useEffect } from "react"
import Link from "next/link"
import { Bot, Loader2, ChevronRight, RefreshCw } from "lucide-react"
import { apiClient } from "@/lib/api-client"

/* ── Типы ── */
interface AiUsageLimits {
  claude:   number | null
  grok:     number | null
  deepseek: number | null
  total:    number | null
}

interface AiUsageCounters {
  claude:   number
  grok:     number
  deepseek: number
  total:    number
}

interface AiUsageResponse {
  plan:      string
  limits:    AiUsageLimits
  used:      AiUsageCounters
  remaining: { claude: number | null; grok: number | null; deepseek: number | null; total: number | null }
  resetsAt:  number
}

/* ── Конфиги провайдеров ── */
const PROVIDERS: { key: keyof AiUsageCounters; label: string; color: string }[] = [
  { key: "claude",   label: "OS 5.0",   color: "#F59E0B" },
  { key: "grok",     label: "OS 3.3",   color: "#A855F7" },
  { key: "deepseek", label: "OS 3.0",   color: "#06B6D4" },
]

const PLAN_LABELS: Record<string, string> = {
  free:      "Бесплатный",
  architect: "Pro",
  master:    "Master",
  legend:    "Supreme",
}

/* ── Компонент ── */
export function AiUsageWidget({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<AiUsageResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load(silent = false) {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const res = await apiClient.get<AiUsageResponse>("/subscription/ai-usage")
      setData(res)
    } catch {
      /* тихо игнорируем — виджет необязательный */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  if (loading) {
    return (
      <div
        className="rounded-2xl p-4 flex items-center justify-center"
        style={{ background: "#14141E", border: "1px solid #2A2A3E", minHeight: 80 }}
      >
        <Loader2 size={18} className="animate-spin" style={{ color: "#6A6A8A" }} />
      </div>
    )
  }

  if (!data) return null

  const planLabel = PLAN_LABELS[data.plan] ?? data.plan
  const isUnlimited = data.limits.total === null

  /* Время сброса */
  const minutesLeft = Math.max(0, Math.round((data.resetsAt - Date.now()) / 60_000))
  const resetLabel =
    minutesLeft < 60
      ? `через ${minutesLeft} мин.`
      : `через ${Math.round(minutesLeft / 60)} ч.`

  if (compact) {
    /* Компактный режим — только полоска total */
    const totalPct = isUnlimited
      ? 0
      : data.limits.total
      ? Math.min(100, (data.used.total / data.limits.total) * 100)
      : 0

    return (
      <div
        className="rounded-xl px-4 py-3 flex items-center gap-3"
        style={{ background: "#14141E", border: "1px solid #2A2A3E" }}
      >
        <Bot size={16} className="shrink-0" style={{ color: "#06B6D4" }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px]" style={{ color: "#6A6A8A" }}>AI · {planLabel}</span>
            <span className="text-[12px]" style={{ color: isUnlimited ? "#34D399" : "#FFFFFF" }}>
              {isUnlimited ? "∞" : `${data.used.total} / ${data.limits.total}`}
            </span>
          </div>
          {!isUnlimited && (
            <div className="h-1 rounded-full overflow-hidden" style={{ background: "#2A2A3E" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${totalPct}%`,
                  background: totalPct > 80 ? "#EF4444" : totalPct > 50 ? "#F59E0B" : "#06B6D4",
                }}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#14141E", border: "1px solid #2A2A3E" }}
    >
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(6,182,212,0.1)", border: "1px solid rgba(6,182,212,0.2)" }}
          >
            <Bot size={15} style={{ color: "#06B6D4" }} />
          </div>
          <div>
            <p className="text-[14px] font-semibold">AI-лимиты</p>
            <p className="text-[11px]" style={{ color: "#6A6A8A" }}>Тариф: {planLabel} · сброс {resetLabel}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/5"
          style={{ color: "#6A6A8A" }}
          aria-label="Обновить"
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Провайдеры */}
      <div className="space-y-3">
        {PROVIDERS.map(({ key, label, color }) => {
          const used  = data.used[key]
          const limit = data.limits[key]
          const pct   = limit === null ? 0 : Math.min(100, (used / limit) * 100)
          const isUnlim = limit === null

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[12px] font-medium" style={{ color }}>{label}</span>
                <span className="text-[12px]" style={{ color: isUnlim ? "#34D399" : pct > 80 ? "#EF4444" : "#FFFFFF" }}>
                  {isUnlim ? "∞" : `${used} / ${limit}`}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "#2A2A3E" }}>
                {isUnlim ? (
                  <div className="h-full w-full rounded-full" style={{ background: `${color}40` }} />
                ) : (
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${pct}%`, background: pct > 80 ? "#EF4444" : color }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Итого */}
      {!isUnlimited && data.limits.total && (
        <div
          className="mt-4 pt-3 flex items-center justify-between text-[12px]"
          style={{ borderTop: "1px solid #2A2A3E" }}
        >
          <span style={{ color: "#6A6A8A" }}>Всего сегодня</span>
          <span style={{ color: data.used.total > data.limits.total * 0.8 ? "#F59E0B" : "#FFFFFF" }}>
            {data.used.total} / {data.limits.total}
          </span>
        </div>
      )}

      {/* Апгрейд CTA */}
      {data.plan === "free" && (
        <Link
          href="/pricing"
          className="mt-4 flex items-center justify-between w-full rounded-xl px-3 py-2.5 text-[12px] font-medium transition-all duration-200 hover:opacity-90"
          style={{
            background: "rgba(168,85,247,0.08)",
            border: "1px solid rgba(168,85,247,0.2)",
            color: "#A855F7",
          }}
        >
          Улучшить тариф → больше лимитов
          <ChevronRight size={13} />
        </Link>
      )}
    </div>
  )
}
