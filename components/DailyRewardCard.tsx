"use client"

/* ================================================================
   DailyRewardCard — виджет ежедневной награды (стрик-удержание).
   GET /rewards/daily/status → показывает серию и награду.
   POST /rewards/daily/claim → забирает кредиты, обновляет баланс.
   При ошибке/недоступности бэкенда виджет просто не рендерится.
   ================================================================ */

import { useEffect, useState } from "react"
import { apiClient } from "@/lib/api-client"
import { useOsgardStore } from "@/lib/store/osgard-store"

interface DailyStatus {
  streak: number
  claimedToday: boolean
  canClaim: boolean
  todayReward: number
  nextReward: number
}

export function DailyRewardCard() {
  const { fetchWallet } = useOsgardStore()
  const [status, setStatus] = useState<DailyStatus | null>(null)
  const [claiming, setClaiming] = useState(false)
  const [justReward, setJustReward] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    apiClient
      .get<DailyStatus>("/rewards/daily/status", { skipAuthRedirect: true })
      .then((d) => {
        if (!cancelled) setStatus(d)
      })
      .catch(() => {
        /* бэкенд недоступен — не показываем виджет */
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function claim() {
    if (!status?.canClaim || claiming) return
    setClaiming(true)
    try {
      const r = await apiClient.post<{ ok: boolean; streak: number; reward: number; nextReward: number }>(
        "/rewards/daily/claim",
        {},
        { skipAuthRedirect: true },
      )
      setJustReward(r.reward)
      setStatus((s) => (s ? { ...s, claimedToday: true, canClaim: false, streak: r.streak, nextReward: r.nextReward } : s))
      // Обновляем кошелёк, чтобы метрика «Токенов/кредитов» на дашборде подросла.
      fetchWallet({ skipAuthRedirect: true })
    } catch {
      /* уже забрано сегодня / сеть — не критично */
    } finally {
      setClaiming(false)
    }
  }

  if (!status) return null

  return (
    <div
      className="mb-8 rounded-2xl border p-5"
      style={{
        borderColor: "rgba(212,175,55,0.25)",
        background: "linear-gradient(135deg, rgba(212,175,55,0.06), rgba(212,175,55,0.02))",
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[20px]" aria-hidden="true">🔥</span>
            <span className="text-[15px] font-semibold text-white">Ежедневная награда</span>
            {status.streak > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "rgba(212,175,55,0.15)", color: "#E5D4A0" }}
              >
                серия {status.streak} дн.
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {status.claimedToday
              ? `Возвращайся завтра — получишь +${status.nextReward} кредитов`
              : `Забери +${status.todayReward} кредитов и не теряй серию`}
          </p>
        </div>
        <button
          onClick={claim}
          disabled={!status.canClaim || claiming}
          className="shrink-0 rounded-xl px-4 py-2 text-[13px] font-semibold transition-all disabled:cursor-default disabled:opacity-60"
          style={{
            background: status.canClaim ? "linear-gradient(135deg,#D4AF37,#F5C542)" : "rgba(255,255,255,0.08)",
            color: status.canClaim ? "#1A1400" : "rgba(255,255,255,0.5)",
          }}
        >
          {justReward != null ? `+${justReward} ✓` : status.claimedToday ? "Забрано" : claiming ? "…" : "Забрать"}
        </button>
      </div>
    </div>
  )
}
