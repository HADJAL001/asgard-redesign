"use client"

/* ================================================================
   ArtifactsView — Мои артефакты OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchArtifacts() (GET /artifacts/mine).
   - Отображает список всех артефактов текущего пользователя.
   - Для каждого артефакта показывает: название, тип, редкость,
     характеристики (power/defense/magic/speed), цену (price +
     listCurrency — своя валюта листинга для каждой редкости) и
     статус (в продаже / у меня / продан).
   - Фильтрация по статусу (все/в продаже/у меня/проданы) и поиск
     по названию — как в исходной моковой версии.
   - Форматирование чисел — через fmtTC()/fmtUSD() из lib/tc-market.ts
     (fmtUSD используется для примерной оценки цены в USD, если
     артефакт листингован в timecoin — через tcPrice.price).
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, Store, Archive, CheckCircle2, Boxes, Loader2 } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import {
  COLORS,
  RARITY,
  ARTIFACT_TYPES,
  STAT_META,
  type ArtifactType,
  type Rarity,
} from "@/lib/economy"
import { fmtTC, fmtUSD } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

type ArtifactStatus = "kept" | "listed" | "sold"
type Filter = "all" | ArtifactStatus

export function ArtifactsView() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const initial = (params.get("filter") as Filter) || "all"

  const FILTERS: { id: Filter; label: string }[] = [
    { id: "all", label: t("artifacts.filterAll") },
    { id: "listed", label: t("artifacts.filterListed") },
    { id: "kept", label: t("artifacts.filterKept") },
    { id: "sold", label: t("artifacts.filterSold") },
  ]

  const STATUS_META: Record<ArtifactStatus, { label: string; color: string; Icon: typeof Store }> = {
    listed: { label: t("artifacts.statusListed"), color: "#00D4FF", Icon: Store },
    kept: { label: t("artifacts.statusKept"), color: "#6A6A8A", Icon: Archive },
    sold: { label: t("artifacts.statusSold"), color: "#4ADE80", Icon: CheckCircle2 },
  }

  const [filter, setFilter] = useState<Filter>(FILTERS.some((f) => f.id === initial) ? initial : "all")
  const [query, setQuery] = useState("")

  const { artifacts, fetchArtifacts, tcPrice, loading, error } = useOsgardStore()

  useEffect(() => {
    fetchArtifacts({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const shown = useMemo(() => {
    return artifacts.filter((a) => {
      const okFilter = filter === "all" || (a.status as ArtifactStatus) === filter
      const okQuery = a.name.toLowerCase().includes(query.toLowerCase())
      return okFilter && okQuery
    })
  }, [artifacts, filter, query])

  const counts = {
    all: artifacts.length,
    listed: artifacts.filter((a) => a.status === "listed").length,
    kept: artifacts.filter((a) => a.status === "kept").length,
    sold: artifacts.filter((a) => a.status === "sold").length,
  }

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #1A1A1A 100%)", color: COLORS.text }}>
      <Navbar />

      <main className="mx-auto max-w-[1240px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("artifacts.title")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("artifacts.subtitle")}
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} strokeWidth={1.75} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: COLORS.label }} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("artifacts.searchPlaceholder")}
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

        {/* Loading */}
        {loading && artifacts.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
            <p className="text-[14px]" style={{ color: COLORS.label }}>{t("artifacts.loadingArtifacts")}</p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="mt-6 text-[13px]" role="status" style={{ color: COLORS.red }}>
            {error}
          </p>
        )}

        {/* Grid */}
        {!loading && shown.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Boxes size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
            <p className="text-[15px]" style={{ color: COLORS.label }}>{t("artifacts.notFound")}</p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((a) => (
              <ArtifactCard
                key={a.id}
                a={a}
                tcUsdPrice={tcPrice.price}
                onSell={() => router.push("/my-sales")}
                t={t}
                statusMeta={STATUS_META}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

/** Приведение произвольной строки типа/редкости к безопасному ключу с фолбэком. */
function safeType(t: string): ArtifactType {
  return (t in ARTIFACT_TYPES ? (t as ArtifactType) : "artifact")
}
function safeRarity(r: string): Rarity {
  return (r in RARITY ? (r as Rarity) : "common")
}

function ArtifactCard({
  a,
  tcUsdPrice,
  onSell,
  t,
  statusMeta,
}: {
  a: {
    id: number
    name: string
    type: string
    rarity: string
    level: number
    power: number
    defense: number
    magic: number
    speed: number
    status: string
    price: number
    listCurrency: string
  }
  tcUsdPrice: number
  onSell: () => void
  t: (key: string, vars?: Record<string, string | number>) => string
  statusMeta: Record<ArtifactStatus, { label: string; color: string; Icon: typeof Store }>
}) {
  const TypeIcon = ARTIFACT_TYPES[safeType(a.type)].Icon
  const rarity = RARITY[safeRarity(a.rarity)]
  const status = statusMeta[(a.status as ArtifactStatus) in statusMeta ? (a.status as ArtifactStatus) : "kept"]

  const stats = { power: a.power, defense: a.defense, magic: a.magic, speed: a.speed }

  const isTimecoin = a.listCurrency === "timecoin"
  const priceLabel = isTimecoin ? fmtTC(a.price) : `${a.price.toLocaleString("ru-RU")} ${a.listCurrency}`
  const usdEstimate = isTimecoin ? fmtUSD(a.price * tcUsdPrice) : null

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
        <span style={{ color: COLORS.label }}>{ARTIFACT_TYPES[safeType(a.type)].label}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: COLORS.label }}>{t("artifacts.level", { level: a.level })}</span>
        <span style={{ color: COLORS.border }}>·</span>
        <span style={{ color: rarity.color }}>{rarity.label}</span>
      </div>

      {/* Stats */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {STAT_META.map((s) => (
          <div key={s.key} className="flex items-center justify-between rounded-lg px-3 py-1.5 text-[12px]" style={{ border: `1px solid ${COLORS.border}` }}>
            <span style={{ color: COLORS.label }}>{s.label}</span>
            <span>{stats[s.key]}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between pt-5">
        <div className="flex flex-col">
          <span className="text-[15px] font-medium" style={{ color: COLORS.accent }}>
            {priceLabel}
          </span>
          {usdEstimate && (
            <span className="text-[11px]" style={{ color: COLORS.label }}>
              ≈ {usdEstimate}
            </span>
          )}
        </div>
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
            {t("artifacts.sell")}
          </button>
        )}
      </div>
    </article>
  )
}
