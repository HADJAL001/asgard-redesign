"use client"

import { useMemo, useState } from "react"
import { Crown, Coins, TrendingUp, Trophy } from "lucide-react"
import { Navbar } from "./navbar"
import { COLORS, ARCHITECTS, formatTokens } from "@/lib/economy"

type SortKey = "income" | "level" | "sales"

const SORTS: { id: SortKey; label: string }[] = [
  { id: "income", label: "По доходу" },
  { id: "level", label: "По уровню" },
  { id: "sales", label: "По количеству продаж" },
]

const PODIUM = ["#FBBF24", "#CBD5E1", "#B87333"]

export function LeaderboardView() {
  const [sort, setSort] = useState<SortKey>("income")

  const ranked = useMemo(() => {
    const arr = [...ARCHITECTS].sort((a, b) => {
      if (sort === "level") return b.level - a.level || b.income - a.income
      if (sort === "sales") return b.sales - a.sales || b.income - a.income
      return b.income - a.income
    })
    return arr.map((a, i) => ({ ...a, position: i + 1 }))
  }, [sort])

  const me = ranked.find((a) => a.self)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1080px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Рейтинг архитекторов</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Топ-100 создателей экосистемы OSGARD
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {SORTS.map((s) => {
              const active = sort === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSort(s.id)}
                  className="rounded-lg px-3.5 py-2 text-[13px] transition-colors"
                  style={{
                    border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                    color: active ? COLORS.accent : "rgba(255,255,255,0.6)",
                    backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                  }}
                >
                  {s.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Podium */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {ranked.slice(0, 3).map((a, i) => (
            <div
              key={a.name}
              className="flex flex-col items-center rounded-xl px-4 py-6 text-center"
              style={{ backgroundColor: COLORS.card, border: `1px solid ${a.self ? COLORS.accent : COLORS.border}` }}
            >
              <span className="flex size-11 items-center justify-center rounded-full" style={{ border: `1px solid ${PODIUM[i]}` }}>
                <Crown size={20} strokeWidth={1.5} style={{ color: PODIUM[i] }} />
              </span>
              <p className="mt-3 text-[15px] font-medium">{a.name}</p>
              <p className="text-[12px]" style={{ color: COLORS.label }}>Уровень {a.level}</p>
              <p className="mt-2 text-[17px] font-medium" style={{ color: COLORS.accent }}>{formatTokens(a.income)}</p>
              <p className="text-[11px]" style={{ color: COLORS.label }}>{a.sales} продаж</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="mt-6 overflow-hidden rounded-xl" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <div className="grid grid-cols-[0.5fr_2fr_1fr_1.2fr_1fr] gap-4 px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.14em]" style={{ color: COLORS.label, borderBottom: `1px solid ${COLORS.border}` }}>
            <span>#</span>
            <span>Архитектор</span>
            <span>Уровень</span>
            <span>Доход</span>
            <span className="text-right">Продажи</span>
          </div>
          {ranked.map((a) => (
            <div
              key={a.name}
              className="grid grid-cols-[0.5fr_2fr_1fr_1.2fr_1fr] items-center gap-4 px-6 py-3.5 text-[14px]"
              style={{
                borderBottom: `1px solid ${COLORS.border}`,
                backgroundColor: a.self ? "rgba(0,212,255,0.05)" : "transparent",
              }}
            >
              <span style={{ color: a.position <= 3 ? PODIUM[a.position - 1] : COLORS.label }}>{a.position}</span>
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full text-[12px]" style={{ backgroundColor: COLORS.bg, border: `1px solid ${a.self ? COLORS.accent : COLORS.border}`, color: a.self ? COLORS.accent : "rgba(255,255,255,0.8)" }}>
                  {a.name.charAt(0)}
                </span>
                <span style={{ color: a.self ? COLORS.accent : COLORS.text }}>{a.name}{a.self ? " (вы)" : ""}</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.75)" }}>Lvl.{a.level}</span>
              <span style={{ color: COLORS.accent }}>{formatTokens(a.income)}</span>
              <span className="text-right" style={{ color: "rgba(255,255,255,0.75)" }}>{a.sales}</span>
            </div>
          ))}
        </div>

        {/* Your position */}
        {me && (
          <div className="mt-6 flex flex-wrap items-center gap-6 rounded-xl px-6 py-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.accent}` }}>
            <div className="flex items-center gap-3">
              <Trophy size={18} strokeWidth={1.5} style={{ color: COLORS.accent }} />
              <div>
                <p className="text-[12px]" style={{ color: COLORS.label }}>Ваша позиция</p>
                <p className="text-[18px] font-medium">#{me.position}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Coins size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <span className="text-[14px]">{formatTokens(me.income)} <span style={{ color: COLORS.label }}>токенов</span></span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp size={16} strokeWidth={1.5} style={{ color: COLORS.label }} />
              <span className="text-[14px]">{me.sales} <span style={{ color: COLORS.label }}>продаж</span></span>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
