"use client"

/* ================================================================
   RarestHallView — Публичный «Зал редчайших»
   ================================================================
   Ранжирует артефакты по craftScore (честность ковки), а не по
   доходу владельца. Каждое ремесло — в своём цвете (rarity).
   Для сравнения: hall-of-fame-view.tsx ранжирует по totalIncome
   и красит по доходным тирам (amber/sapphire/diamond).
   ================================================================ */

import { useEffect, useState, useCallback } from "react"
import Image from "next/image"
import { Navbar } from "./navbar"
import { apiClient } from "@/lib/api-client"
import { RARITY, type Rarity } from "@/lib/economy"
import { ArrowLeft, Loader2, Gem } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "@/lib/i18n/use-translation"

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

interface PublicRarestArtifact {
  id: number
  name: string
  type: string
  rarity: Rarity
  craftScore: number
  archetype: string | null
  palette: { primary: string; accent: string } | null
  createdAt: number
  holderHandle: string | null
}

interface RarestResponse {
  artifacts: PublicRarestArtifact[]
  total: number
  limit: number
  offset: number
}

const PAGE = 60

export function RarestHallView() {
  const { t } = useTranslation()
  const [items, setItems] = useState<PublicRarestArtifact[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async (offset: number) => {
    const res = await apiClient.get<RarestResponse>(`/rarest?limit=${PAGE}&offset=${offset}`)
    return res
  }, [])

  useEffect(() => {
    let alive = true
    load(0)
      .then((res) => {
        if (!alive) return
        setItems(res.artifacts ?? [])
        setTotal(res.total ?? 0)
      })
      .catch(() => {
        if (alive) setFailed(true)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [load])

  async function handleMore() {
    setLoadingMore(true)
    try {
      const res = await load(items.length)
      setItems((prev) => [...prev, ...(res.artifacts ?? [])])
      setTotal(res.total ?? total)
    } catch {
      /* тихо */
    } finally {
      setLoadingMore(false)
    }
  }

  const canLoadMore = items.length < total

  return (
    <div className="relative min-h-screen font-sans" style={{ color: TEXT }}>
      {/* Bespoke background — distinct from hall-of-fame */}
      <div
        className="fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(circle at 50% 30%, rgba(155,89,182,0.04) 0%, transparent 45%), linear-gradient(180deg, #05080F 0%, #0A0E1A 45%, #111833 100%)",
        }}
      />
      <Navbar />

      <main className="relative mx-auto max-w-5xl px-6 pb-20 pt-10">
        <Link
          href="/hall-of-fame"
          className="inline-flex items-center gap-2 text-[13px] transition-colors hover:text-white"
          style={{ color: LABEL }}
        >
          <ArrowLeft size={15} strokeWidth={1.75} aria-hidden="true" />
          {t("rarestHall.backToHallOfFame")}
        </Link>

        {/* Hero */}
        <header className="mt-8 text-center">
          <span
            className="inline-flex size-16 items-center justify-center rounded-full"
            style={{ border: `1px solid ${RARITY.epic.color}55`, color: RARITY.epic.color }}
          >
            <Gem size={34} strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h1
            className="mt-6 text-[40px] leading-none tracking-tight text-balance sm:text-[52px]"
            style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: RARITY.epic.color }}
          >
            {t("rarestHall.title")}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-pretty" style={{ color: LABEL }}>
            {t("rarestHall.subtitle")}
          </p>

          {/* Rarity summary — БЕЗ общего числа артефактов (как и в hall-of-fame) */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-[13px]">
            {(["mythic", "legendary", "epic", "rare", "common"] as const).map((r) => (
              <span
                key={r}
                className="inline-flex items-center gap-1.5 rounded-full px-4 py-2"
                style={{
                  border: `1px solid ${RARITY[r].color}44`,
                  color: RARITY[r].color,
                }}
              >
                <span aria-hidden="true">{RARITY[r].symbol}</span>
                {RARITY[r].label}
              </span>
            ))}
          </div>
        </header>

        {/* Loading */}
        {loading && items.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: RARITY.epic.color }} />
            <p className="text-[14px]" style={{ color: LABEL }}>
              {t("rarestHall.loading")}
            </p>
          </div>
        )}

        {/* Error */}
        {failed && !loading && (
          <p className="mt-6 text-center text-[13px]" role="status" style={{ color: "#F87171" }}>
            Не удалось загрузить зал. Обновите страницу.
          </p>
        )}

        {/* Empty */}
        {!loading && items.length === 0 && !failed && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Gem size={32} strokeWidth={1.25} style={{ color: LABEL }} />
            <p className="text-[15px]" style={{ color: LABEL }}>
              {t("rarestHall.nobodyFound")}
            </p>
          </div>
        )}

        {/* Cards */}
        {items.length > 0 && (
          <div className="mt-8 flex flex-col gap-5">
            {items.map((a, i) => {
              const rarityMeta = RARITY[a.rarity]
              const accent = rarityMeta?.color ?? LABEL
              const cardBg = a.palette?.primary ?? "#14141E"

              return (
                <Link
                  key={`${a.id}-${i}`}
                  href={`/marketplace?artifactId=${a.id}`}
                  className="block p-6 transition-colors hover:border-opacity-70"
                  style={{
                    border: `1px solid ${accent}33`,
                    borderRadius: 12,
                    backgroundColor: `${cardBg}40`,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <div className="flex items-start gap-5">
                    {/* Rank + rarity */}
                    <div className="flex flex-col items-center gap-1" style={{ minWidth: 52 }}>
                      <span
                        className="text-[26px] leading-none"
                        aria-hidden="true"
                        style={{ color: accent, filter: `drop-shadow(0 0 6px ${accent}66)` }}
                      >
                        {rarityMeta.symbol}
                      </span>
                      <span className="text-[11px] font-medium" style={{ color: accent }}>
                        #{i + 1}
                      </span>
                    </div>

                    {/* Body */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="truncate text-[17px]"
                          style={{ fontFamily: "var(--font-playfair)", fontWeight: 600, color: TEXT }}
                        >
                          {a.name}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]"
                          style={{ border: `1px solid ${accent}55`, color: accent }}
                        >
                          {rarityMeta.label}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px]" style={{ color: LABEL }}>
                        {a.type} · {a.archetype ? `${a.archetype} · ` : ""}{a.holderHandle || t("rarestHall.holderUnknown")}
                      </p>
                      {a.palette && (
                        <div className="mt-2 flex items-center gap-2">
                          <div
                            className="h-3 w-8 rounded"
                            style={{ backgroundColor: a.palette.primary }}
                            aria-label={`Палитра: основной ${a.palette.primary}`}
                          />
                          <div
                            className="h-3 w-8 rounded"
                            style={{ backgroundColor: a.palette.accent }}
                            aria-label={`Палитра: акцент ${a.palette.accent}`}
                          />
                        </div>
                      )}
                    </div>

                    {/* Craft score */}
                    <div className="text-right">
                      <p
                        className="text-[20px] leading-none"
                        style={{ fontFamily: "var(--font-playfair)", fontWeight: 700, color: accent }}
                      >
                        {(a.craftScore * 100).toFixed(0)}
                      </p>
                      <p className="mt-1.5 text-[10px] uppercase tracking-[0.16em]" style={{ color: LABEL }}>
                        {t("rarestHall.craftScore", { score: "" }).trim()}
                      </p>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {canLoadMore && (
          <button
            type="button"
            className="mt-8 block mx-auto px-6 py-2.5 rounded-lg text-[13px] font-medium transition-colors"
            onClick={handleMore}
            disabled={loadingMore}
            style={{
              backgroundColor: `${RARITY.epic.color}22`,
              color: RARITY.epic.color,
              border: `1px solid ${RARITY.epic.color}44`,
            }}
          >
            {loadingMore ? <Loader2 size={14} className="inline animate-spin" /> : t("rarestHall.loadMore")}
          </button>
        )}

        <p className="mt-12 text-center text-[12px]" style={{ color: LABEL }}>
          {t("rarestHall.footerNote")}
        </p>
      </main>
    </div>
  )
}
