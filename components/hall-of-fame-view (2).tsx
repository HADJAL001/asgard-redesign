"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Navbar } from "./navbar"
import {
  HALL_OF_FAME,
  HOF_TIERS,
  HOF_TIER_ORDER,
  hofTier,
  formatTokens,
  type HofTier,
} from "@/lib/economy"
import { Infinity as InfinityIcon, ArrowLeft, ArrowUpDown } from "lucide-react"

const GOLD = "#FFD700"
const TEXT = "#F0F0F0"
const LABEL = "#A0A0B0"

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
    // drift toward the center of the viewport
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
              // custom props consumed by the .hof-spark keyframes
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

type SortKey = "price" | "date"

export function HallOfFameView() {
  const [filter, setFilter] = useState<"all" | HofTier>("all")
  const [sort, setSort] = useState<SortKey>("price")

  const counts = useMemo(() => {
    const c: Record<HofTier, number> = { amber: 0, sapphire: 0, diamond: 0 }
    for (const e of HALL_OF_FAME) {
      const t = hofTier(e.price)
      if (t) c[t] += 1
    }
    return c
  }, [])

  const shown = useMemo(() => {
    const list = HALL_OF_FAME.filter((e) => (filter === "all" ? true : hofTier(e.price) === filter))
    return [...list].sort((a, b) =>
      sort === "price"
        ? b.price - a.price
        : b.date.split(".").reverse().join("").localeCompare(a.date.split(".").reverse().join("")),
    )
  }, [filter, sort])

  const filters: { id: "all" | HofTier; label: string; symbol?: string; color?: string; count?: number }[] = [
    { id: "all", label: "Все", count: HALL_OF_FAME.length },
    { id: "amber", label: "Янтарь", symbol: HOF_TIERS.amber.symbol, color: HOF_TIERS.amber.color, count: counts.amber },
    { id: "sapphire", label: "Сапфир", symbol: HOF_TIERS.sapphire.symbol, color: HOF_TIERS.sapphire.color, count: counts.sapphire },
    { id: "diamond", label: "Алмаз", symbol: HOF_TIERS.diamond.symbol, color: HOF_TIERS.diamond.color, count: counts.diamond },
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
          Назад
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
            Зал славы OSGARD
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-pretty" style={{ color: LABEL }}>
            Бессмертные творения архитекторов OSGARD. Артефакты, проданные за эквивалент 20&nbsp;000&nbsp;∞ и более,
            остаются здесь навечно.
          </p>

          {/* Summary counts */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[13px]">
            <span
              className="rounded-full px-4 py-2"
              style={{ border: `1px solid ${GOLD}44`, color: GOLD, backgroundColor: "rgba(255,215,0,0.04)" }}
            >
              Всего артефактов: {HALL_OF_FAME.length}
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
                  {typeof f.count === "number" && (
                    <span style={{ opacity: 0.7 }}>({f.count})</span>
                  )}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={() => setSort((s) => (s === "price" ? "date" : "price"))}
            className="inline-flex items-center gap-2 self-start rounded-full px-3.5 py-1.5 text-[13px] transition-colors sm:self-auto"
            style={{ border: `1px solid ${GOLD}33`, color: LABEL }}
          >
            <ArrowUpDown size={14} strokeWidth={1.75} aria-hidden="true" />
            {sort === "price" ? "По цене" : "По дате"}
          </button>
        </div>

        {/* Cards */}
        <div className="mt-8 flex flex-col gap-5">
          {shown.map((e, i) => {
            const tier = hofTier(e.price) as HofTier
            const meta = HOF_TIERS[tier]
            return (
              <Link
                key={e.id}
                href={`/artifact/${e.id}`}
                className="hof-card hof-rise block p-6"
                style={{ animationDelay: `${i * 70}ms` }}
              >
                <div className="flex items-center gap-5">
                  {/* Rank + tier symbol */}
                  <div className="flex flex-col items-center gap-1" style={{ minWidth: 52 }}>
                    <span
                      className="text-[30px] leading-none"
                      style={{ filter: `drop-shadow(0 0 10px ${meta.glow})` }}
                      aria-hidden="true"
                    >
                      {meta.symbol}
                    </span>
                    <span className="text-[13px] font-medium" style={{ color: meta.color }}>
                      #{i + 1}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium" style={{ color: meta.color }}>
                        {e.architect}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                        style={{ border: `1px solid ${meta.color}55`, color: meta.color }}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <p
                      className="mt-1 truncate text-[20px] leading-tight"
                      style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, color: TEXT }}
                    >
                      «{e.artifact}»
                    </p>
                    <p className="mt-1 text-[12px]" style={{ color: LABEL }}>
                      {e.date} · Навсегда в вечности
                    </p>
                  </div>

                  {/* Price */}
                  <div className="text-right">
                    <p
                      className="inline-flex items-center gap-1 text-[22px] leading-none"
                      style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: GOLD }}
                    >
                      <InfinityIcon size={18} strokeWidth={1.75} aria-hidden="true" />
                      {formatTokens(e.price)}
                    </p>
                    <p className="mt-1.5 text-[11px] uppercase tracking-[0.16em]" style={{ color: LABEL }}>
                      TimeCoin
                    </p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        <p className="mt-12 text-center text-[12px]" style={{ color: LABEL }}>
          Артефакт, попавший в Зал славы, помечается как «Вечный» и больше не может быть продан или изменён.
        </p>
      </main>
    </div>
  )
}
