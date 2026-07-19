"use client"

import { useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Store, Archive, CheckCircle2, Boxes } from "lucide-react"
import { Navbar } from "./navbar"
import {
  COLORS,
  RARITY,
  ARTIFACT_TYPES,
  STAT_META,
  ARTIFACTS,
  formatTokens,
  type ArtifactStatus,
  type Artifact,
} from "@/lib/economy"

type Filter = "all" | ArtifactStatus

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "listed", label: "В продаже" },
  { id: "kept", label: "Оставлены себе" },
  { id: "sold", label: "Проданы" },
]

const STATUS_META: Record<ArtifactStatus, { label: string; color: string; Icon: typeof Store }> = {
  listed: { label: "В продаже", color: "#00D4FF", Icon: Store },
  kept: { label: "У меня", color: "#6A6A8A", Icon: Archive },
  sold: { label: "Продан", color: "#4ADE80", Icon: CheckCircle2 },
}

export function ArtifactsView() {
  const router = useRouter()
  const params = useSearchParams()
  const initial = (params.get("filter") as Filter) || "all"
  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.id === initial) ? initial : "all")
  const [query, setQuery] = useState("")

  const mine = useMemo(() => ARTIFACTS.filter((a) => a.architect === "Alex Odin"), [])

  const shown = useMemo(() => {
    return mine.filter((a) => {
      const okFilter = filter === "all" || a.status === filter
      const okQuery = a.name.toLowerCase().includes(query.toLowerCase())
      return okFilter && okQuery
    })
  }, [mine, filter, query])

  const counts = {
    all: mine.length,
    listed: mine.filter((a) => a.status === "listed").length,
    kept: mine.filter((a) => a.status === "kept").length,
    sold: mine.filter((a) => a.status === "sold").length,
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Мои артефакты</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Коллекция созданных цифровых артефактов
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.label }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Поиск артефактов"
              className="cal-input pl-9"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="mt-8 flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const active = filter === f.id
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] transition-colors"
                style={{
                  border: `1px solid ${active ? COLORS.accent : COLORS.border}`,
                  color: active ? COLORS.accent : "rgba(255,255,255,0.6)",
                  backgroundColor: active ? "rgba(0,212,255,0.06)" : "transparent",
                }}
              >
                {f.label}
                <span className="text-[11px]" style={{ color: active ? COLORS.accent : COLORS.label }}>
                  {counts[f.id]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Grid */}
        {shown.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Boxes size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
            <p className="text-[15px]" style={{ color: COLORS.label }}>Артефактов не найдено</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a) => (
              <ArtifactCard key={a.id} a={a} onSell={() => router.push("/my-sales")} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function ArtifactCard({ a, onSell }: { a: Artifact; onSell: () => void }) {
  const TypeIcon = ARTIFACT_TYPES[a.type].Icon
  const rarity = RARITY[a.rarity]
  const status = STATUS_META[a.status]

  return (
    <article
      className="flex flex-col rounded-xl p-5 transition-all duration-200"
      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = rarity.color
        e.currentTarget.style.transform = "translateY(-2px)"
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border
        e.currentTarget.style.transform = "translateY(0)"
      }}
    >
      <div className="flex items-start justify-between">
        <span className="flex size-12 items-center justify-center rounded-xl" style={{ border: `1px solid ${rarity.color}` }}>
          <TypeIcon size={24} strokeWidth={1.25} style={{ color: rarity.color }} />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]" style={{ border: `1px solid ${COLORS.border}`, color: status.color }}>
          <status.Icon size={12} strokeWidth={1.75} />
          {status.label}
        </span>
      </div>

      <h3 className="mt-4 text-[16px] font-medium">{a.name}</h3>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[a.type].label}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: COLORS.label }}>Ур. {a.level}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: rarity.color }}>{rarity.label}</span>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {STAT_META.map((s) => (
          <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.label }}>{s.label}</span>
            <span>{a.stats[s.key]}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-5">
        <span className="text-[15px] font-medium" style={{ color: COLORS.accent }}>
          {formatTokens(a.price)} <span className="text-[12px]" style={{ color: COLORS.label }}>ток.</span>
        </span>
        {a.status === "kept" && (
          <button
            type="button"
            onClick={onSell}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] transition-colors"
            style={{ border: `1px solid ${COLORS.border}`, color: COLORS.text }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = COLORS.accent
              e.currentTarget.style.borderColor = COLORS.accent
              e.currentTarget.style.color = COLORS.bg
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent"
              e.currentTarget.style.borderColor = COLORS.border
              e.currentTarget.style.color = COLORS.text
            }}
          >
            <Store size={14} strokeWidth={1.75} />
            Прода��ь
          </button>
        )}
      </div>
    </article>
  )
}
