"use client"

/* ================================================================
   DropBanner — баннер активного сезонного дропа на маркетплейсе
   ----------------------------------------------------------------
   Тянет GET /drops, показывает ближайший к завершению активный дроп
   с честным обратным отсчётом (по endsAt с сервера, не фейковый
   таймер), реальным остатком тиража и кнопкой «Забрать».
   Клейм → POST /drops/:id/claim; после успеха обновляем кошелёк и
   каталог лотов через стор.
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import { Sparkles, Loader2, Check, Clock, Package, Flame } from "lucide-react"
import { COLORS, RARITY, STAT_META, type Rarity } from "@/lib/economy"
import { apiClient } from "@/lib/api-client"
import { useOsgardStore } from "@/lib/store/osgard-store"

const GOLD = "#E6C868"

type Drop = {
  id: number
  season: string
  title: string
  description: string
  artifactName: string
  type: string
  rarity: string
  level: number
  power: number
  defense: number
  magic: number
  speed: number
  price: number
  currency: string
  totalSupply: number
  claimed: number
  remaining: number
  startsAt: number
  endsAt: number
  claimedByMe: boolean
  soldOut: boolean
}

function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common") as Rarity
}

/** Человекочитаемый остаток времени до endsAt. */
function formatLeft(ms: number, t: (k: string, v?: Record<string, string | number>) => string): string {
  if (ms <= 0) return t("drops.ended")
  const totalMin = Math.floor(ms / 60000)
  const days = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin % (60 * 24)) / 60)
  const mins = totalMin % 60
  if (days > 0) return t("drops.leftDH", { d: days, h: hours })
  if (hours > 0) return t("drops.leftHM", { h: hours, m: mins })
  return t("drops.leftM", { m: mins })
}

function formatPrice(price: number, currency: string): string {
  if (currency === "cash_usd") return `$${price.toLocaleString("ru-RU")}`
  return `${price.toLocaleString("ru-RU")} ${currency}`
}

export function DropBanner({ t }: { t: (key: string, vars?: Record<string, string | number>) => string }) {
  const [drop, setDrop] = useState<Drop | null>(null)
  const [now, setNow] = useState<number>(0)
  const [claiming, setClaiming] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [claimedNow, setClaimedNow] = useState(false)
  const skew = useRef(0) /* разница между серверным и клиентским временем */

  const fetchWallet = useOsgardStore((s) => s.fetchWallet)
  const fetchListings = useOsgardStore((s) => s.fetchListings)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const r = await apiClient.get<{ drops: Drop[]; serverTime: number }>("/drops", { skipAuthRedirect: true })
        if (cancelled) return
        const active = r.drops?.[0] ?? null
        skew.current = (r.serverTime || Date.now()) - Date.now()
        setNow(Date.now() + skew.current)
        setDrop(active)
      } catch {
        /* дропов нет / гость без сети — баннер просто не покажется */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* Тикающий обратный отсчёт (раз в секунду), с поправкой на серверное время. */
  useEffect(() => {
    if (!drop) return
    const id = setInterval(() => setNow(Date.now() + skew.current), 1000)
    return () => clearInterval(id)
  }, [drop])

  if (!drop) return null

  const rarity = RARITY[safeRarity(drop.rarity)]
  const msLeft = drop.endsAt - now
  const claimed = drop.claimedByMe || claimedNow
  const soldOut = drop.remaining <= 0 && !claimed
  const ended = msLeft <= 0
  const pct = drop.totalSupply > 0 ? Math.min(100, Math.round((drop.claimed / drop.totalSupply) * 100)) : 0

  async function claim() {
    if (!drop) return
    setClaiming(true)
    setMsg(null)
    try {
      const r = await apiClient.post<{ drop: Drop }>(`/drops/${drop.id}/claim`)
      setDrop(r.drop)
      setClaimedNow(true)
      setMsg(t("drops.claimedMsg"))
      void fetchWallet()
      void fetchListings()
    } catch (e: any) {
      const code = e?.data?.code
      if (code === "SOLD_OUT") setMsg(t("drops.soldOut"))
      else if (code === "ALREADY_CLAIMED") setMsg(t("drops.already"))
      else if (code === "DROP_ENDED") setMsg(t("drops.ended"))
      else setMsg(e?.message || t("drops.claimFailed"))
    } finally {
      setClaiming(false)
    }
  }

  return (
    <div
      className="relative mt-8 overflow-hidden rounded-2xl p-6 md:p-7"
      style={{
        background: `radial-gradient(120% 140% at 85% 0%, ${rarity.color}22, transparent 55%), linear-gradient(135deg, rgba(20,16,8,0.85), rgba(10,10,16,0.9))`,
        border: `1px solid ${GOLD}55`,
        boxShadow: `0 18px 50px rgba(0,0,0,0.45), inset 0 0 40px ${rarity.color}10`,
      }}
    >
      <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide"
            style={{ border: `1px solid ${GOLD}66`, color: GOLD, backgroundColor: `${GOLD}14` }}
          >
            <Flame size={12} /> {t("drops.seasonLabel", { season: drop.season })}
          </span>
          <h3 className="mt-3 text-[22px] font-bold leading-tight">{drop.title}</h3>
          <p className="mt-1.5 max-w-[560px] text-[13px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {drop.description}
          </p>

          {/* Статы дропа */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
            <span className="rounded-full px-2.5 py-1" style={{ border: `1px solid ${rarity.color}`, color: rarity.color }}>
              {rarity.label}
            </span>
            {STAT_META.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1 rounded-lg px-2 py-1" style={{ border: `1px solid ${COLORS.border}`, color: "rgba(255,255,255,0.7)" }}>
                <s.Icon size={12} strokeWidth={1.75} style={{ color: rarity.color }} /> {s.label} {drop[s.key]}
              </span>
            ))}
          </div>

          {/* Прогресс тиража + таймер */}
          <div className="mt-4 max-w-[420px]">
            <div className="flex items-center justify-between text-[11px]" style={{ color: "rgba(255,255,255,0.5)" }}>
              <span className="inline-flex items-center gap-1">
                <Package size={12} /> {t("drops.remaining", { n: drop.remaining, total: drop.totalSupply })}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {formatLeft(msLeft, t)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${GOLD}, ${rarity.color})` }} />
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col items-stretch gap-2 md:w-[200px]">
          <div className="text-center md:text-right">
            <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.45)" }}>{t("drops.price")}</p>
            <p className="text-[22px] font-bold" style={{ color: GOLD }}>{formatPrice(drop.price, drop.currency)}</p>
          </div>
          {claimed ? (
            <span className="inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold" style={{ border: `1px solid ${COLORS.green}66`, color: COLORS.green }}>
              <Check size={16} /> {t("drops.claimedBtn")}
            </span>
          ) : (
            <button
              type="button"
              onClick={claim}
              disabled={claiming || soldOut || ended}
              className="inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-semibold transition-transform hover:scale-[1.03] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #C69B2E)`, color: "#1a1405" }}
            >
              {claiming ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {soldOut ? t("drops.soldOut") : ended ? t("drops.ended") : t("drops.claimBtn")}
            </button>
          )}
          {msg && <p className="text-center text-[12px] md:text-right" style={{ color: "rgba(255,255,255,0.6)" }}>{msg}</p>}
        </div>
      </div>
    </div>
  )
}
