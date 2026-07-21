"use client"

/* ================================================================
   HallOfFameView — Зал славы OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchLeaderboard() (GET /leaderboard).
   - Отображает топ-пользователей по общему доходу, количеству продаж
     и рейтингу (позиции в отсортированном списке).
   - Для каждого пользователя показывает: имя, аватар (avatarUrl или
     заглушка), доход (в USD, через fmtUSD из lib/tc-market.ts),
     количество продаж и рейтинг (#позиция).
   - Три кнопки сортировки: Доход / Продажи / Рейтинг — сохраняют
     визуальный стиль оригинального Hall of Fame (золотая тема, sparks,
     фильтры по тирам HOF_TIERS на основе totalIncome).
   - Карточки не кликабельны (просто div, без перехода на профиль).
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import { Navbar } from "./navbar"
import { useOsgardStore, type LeaderboardEntry } from "@/lib/store/osgard-store"
import { HOF_TIERS, HOF_TIER_ORDER, hofTier, type HofTier } from "@/lib/economy"
import { fmtUSD } from "@/lib/tc-market"
import { Infinity as InfinityIcon, ArrowLeft, Loader2, Users } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "@/lib/i18n/use-translation"

const GOLD = "#FFD700"
const TEXT = "#F0F0F0"
const LABEL = "#A0A0B0"

const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
       <rect width="48" height="48" rx="24" fill="#1A1F33"/>
       <circle cx="24" cy="18" r="8" fill="#3A3F5C"/>
       <path d="M8 42c0-9 7-14 16-14s16 5 16 14" fill="#3A3F5C"/>
     </svg>`,
  )

/* ---- Deterministic floating spark field (only on this page) ---- */
type Spark = {
  left: number
  top: number
  size: number
  dur: number
  delay: number
  dx: number
  dy: number
  opacity: number
  gold: boolean
}

function buildSparks(count: number): Spark[] {
  let s = 20260712
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
  return Array.from({ length: count }).map(() => {
    const left = rnd() * 100
    const top = rnd() * 100
    const dx = (50 - left) * (0.5 + rnd() * 0.7)
    const dy = (42 - top) * (0.5 + rnd() * 0.7)
    return {
      left,
      top,
      size: 1 + rnd() * 2,
      dur: 11 + rnd() * 12,
      delay: -rnd() * 16,
      dx,
      dy,
      opacity: 0.35 + rnd() * 0.45,
      gold: rnd() > 0.45,
    }
  })
}

function SparkField() {
  const sparks = useMemo(() => buildSparks(26), [])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {sparks.map((sp, i) => (
        <span
          key={i}
          className="hof-spark"
          style={
            {
              left: `${sp.left}%`,
              top: `${sp.top}%`,
              width: sp.size,
              height: sp.size,
              backgroundColor: sp.gold ? "#FFD97A" : "#7FB4FF",
              boxShadow: `0 0 ${sp.size * 3}px ${sp.gold ? "rgba(255,215,0,0.8)" : "rgba(90,150,255,0.8)"}`,
              ["--hof-dur" as string]: `${sp.dur}s`,
              ["--hof-delay" as string]: `${sp.delay}s`,
              ["--hof-dx" as string]: `${sp.dx}px`,
              ["--hof-dy" as string]: `${sp.dy}px`,
              ["--hof-opacity" as string]: `${sp.opacity}`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  )
}

type SortKey = "income" | "sales" | "rank"

export function HallOfFameView() {
  const { t } = useTranslation()
  const { leaderboard, fetchLeaderboard, loading, error } = useOsgardStore()

  const SORTS: { id: SortKey; label: string }[] = [
    { id: "income", label: t("hallOfFame.sortIncome") },
    { id: "sales", label: t("hallOfFame.sortSales") },
    { id: "rank", label: t("hallOfFame.sortRank") },
  ]

  useEffect(() => {
    fetchLeaderboard({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [filter, setFilter] = useState<"all" | HofTier>("all")
  const [sort, setSort] = useState<SortKey>("income")

  /* Позиции (рейтинг) вычисляются один раз — по общему доходу (базовый рейтинг) */
  const ranked = useMemo(() => {
    const byIncome = [...leaderboard].sort((a, b) => b.totalIncome - a.totalIncome)
    return byIncome.map((u, i) => ({ ...u, rank: i + 1 }))
  }, [leaderboard])

  const counts = useMemo(() => {
    const c: Record<HofTier, number> = { amber: 0, sapphire: 0, diamond: 0 }
    for (const u of ranked) {
      const t = hofTier(u.totalIncome)
      if (t) c[t] += 1
    }
    return c
  }, [ranked])

  const shown = useMemo(() => {
    const list = ranked.filter((u) => (filter === "all" ? true : hofTier(u.totalIncome) === filter))
    return [...list].sort((a, b) => {
      if (sort === "sales") return b.totalSales - a.totalSales || b.totalIncome - a.totalIncome
      if (sort === "rank") return a.rank - b.rank
      return b.totalIncome - a.totalIncome
    })
  }, [ranked, filter, sort])

  const filters: { id: "all" | HofTier; label: string; symbol?: string; color?: string; count?: number }[] = [
    { id: "all", label: t("common.all"), count: ranked.length },
    { id: "amber", label: t("hallOfFame.tierAmber"), symbol: HOF_TIERS.amber.symbol, color: HOF_TIERS.amber.color, count: counts.amber },
    { id: "sapphire", label: t("hallOfFame.tierSapphire"), symbol: HOF_TIERS.sapphire.symbol, color: HOF_TIERS.sapphire.color, count: counts.sapphire },
    { id: "diamond", label: t("hallOfFame.tierDiamond"), symbol: HOF_TIERS.diamond.symbol, color: HOF_TIERS.diamond.color, count: counts.diamond },
  ]

  return (
    <div className="relative min-h-screen font-sans" style={{ color: TEXT }}>
      {/* Bespoke cosmic background — distinct from the rest of OSGARD */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(255,215,0,0.04) 0%, transparent 45%), linear-gradient(180deg, #05080F 0%, #0A0E1A 45%, #111833 100%)",
        }}
      />
      <Navbar />
      <SparkField />

      <main className="relative mx-auto max-w-5xl px-6 pb-20 pt-10">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[13px] transition-colors hover:text-white"
          style={{ color: LABEL }}
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          {t("common.back")}
        </Link>

        {/* Hero */}
        <header className="mt-8 text-center">
          <span
            className="hof-infinity mx-auto flex size-16 items-center justify-center rounded-full"
            style={{ border: `1px solid ${GOLD}55`, color: GOLD }}
          >
            <InfinityIcon size={34} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h1
            className="mt-6 text-[40px] leading-none tracking-tight text-balance sm:text-[52px]"
            style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: GOLD }}
          >
            {t("hallOfFame.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-pretty" style={{ color: LABEL }}>
            {t("hallOfFame.subtitle")}
          </p>

          {/* Summary counts */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[13px]">
            <span
              className="rounded-full px-4 py-2"
              style={{ border: `1px solid ${GOLD}44`, color: GOLD, backgroundColor: "rgba(255,215,0,0.04)" }}
            >
              {t("hallOfFame.totalArchitects", { count: ranked.length })}
            </span>
            {HOF_TIER_ORDER.slice()
              .reverse()
              .map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2"
                  style={{ border: `1px solid ${HOF_TIERS[t].color}44`, color: HOF_TIERS[t].color }}
                >
                  <span aria-hidden="true">{HOF_TIERS[t].symbol}</span>
                  {HOF_TIERS[t].label}: {counts[t]}
                </span>
              ))}
          </div>
        </header>

        {/* Controls */}
        <div
          className="mt-12 flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
          style={{ border: `1px solid ${GOLD}22`, backgroundColor: "rgba(13,15,26,0.6)" }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {filters.map((f) => {
              const active = filter === f.id
              const color = f.color ?? GOLD
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors"
                  style={{
                    backgroundColor: active ? color : "transparent",
                    color: active ? "#0A0E1A" : color,
                    border: `1px solid ${active ? color : `${color}44`}`,
                  }}
                >
                  {f.symbol && <span aria-hidden="true">{f.symbol}</span>}
                  {f.label}
                  {typeof f.count === "number" && <span style={{ opacity: 0.7 }}>({f.count})</span>}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {SORTS.map((s) => {
              const active = sort === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  aria-pressed={active}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] transition-colors"
                  style={{
                    border: `1px solid ${active ? GOLD : `${GOLD}33`}`,
                    color: active ? GOLD : LABEL,
                    backgroundColor: active ? "rgba(255,215,0,0.06)" : "transparent",
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Loading */}
        {loading && ranked.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: GOLD }} />
            <p className="text-[14px]" style={{ color: LABEL }}>
              {t("hallOfFame.loadingRating")}
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="mt-6 text-center text-[13px]" role="status" style={{ color: "#F87171" }}>
            {error}
          </p>
        )}

        {/* Empty */}
        {!loading && shown.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Users size={32} strokeWidth={1.25} style={{ color: LABEL }} />
            <p className="text-[15px]" style={{ color: LABEL }}>
              {t("hallOfFame.nobodyFound")}
            </p>
          </div>
        )}

        {/* Cards */}
        <div className="mt-8 flex flex-col gap-5">
          {shown.map((u, i) => {
            const tier = hofTier(u.totalIncome)
            const meta = tier ? HOF_TIERS[tier] : null
            const accent = meta?.color ?? GOLD
            const name = u.displayName || u.username

            return (
              <div key={u.userId} className="hof-card hof-rise block p-6" style={{ animationDelay: `${i * 70}ms` }}>
                <div className="flex items-center gap-5">
                  {/* Rank + tier symbol */}
                  <div className="flex flex-col items-center gap-1" style={{ minWidth: 52 }}>
                    {meta ? (
                      <span
                        className="text-[30px] leading-none"
                        style={{ filter: `drop-shadow(0 0 10px ${meta.glow})` }}
                        aria-hidden="true"
                      >
                        {meta.symbol}
                      </span>
                    ) : (
                      <span className="text-[22px] leading-none" style={{ color: LABEL }} aria-hidden="true">
                        —
                      </span>
                    )}
                    <span className="text-[13px] font-medium" style={{ color: accent }}>
                      #{u.rank}
                    </span>
                  </div>

                  {/* Avatar */}
                  <img
                    src={u.avatarUrl || DEFAULT_AVATAR}
                    alt={name}
                    className="size-12 shrink-0 rounded-full object-cover"
                    style={{ border: `1px solid ${accent}55` }}
                    onError={(e) => {
                      ;(e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR
                    }}
                  />

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="truncate text-[17px]"
                        style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, color: TEXT }}
                      >
                        {name}
                      </span>
                      {meta && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                          style={{ border: `1px solid ${meta.color}55`, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[12px]" style={{ color: LABEL }}>
                      {t("hallOfFame.level", { level: u.level, count: u.artifactCount })}
                    </p>
                  </div>

                  {/* Income + sales */}
                  <div className="text-right">
                    <p
                      className="text-[22px] leading-none"
                      style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: GOLD }}
                    >
                      {fmtUSD(u.totalIncome, 0)}
                    </p>
                    <p className="mt-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: LABEL }}>
                      {t("hallOfFame.salesCount", { count: u.totalSales })}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-12 text-center text-[12px]" style={{ color: LABEL }}>
          {t("hallOfFame.footerNote")}
        </p>
      </main>
    </div>
  )
}
