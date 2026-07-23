"use client"

/* ================================================================
   LeaderboardView — Рейтинг архитекторов OSGARD
   ----------------------------------------------------------------
   Полностью переведён на реальные данные бэкенда через Zustand-стор
   useOsgardStore() (lib/store/osgard-store.tsx).

   Что делает компонент:
   - При монтировании вызывает fetchLeaderboard() (GET /leaderboard).
   - Отображает список пользователей (LeaderboardEntry) с сортировкой:
       - По доходу   (totalIncome)
       - По продажам (totalSales)
       - По уровню   (level)
   - Для каждого пользователя показывает:
       - Имя          (displayName || username)
       - Аватар       (avatarUrl с fallback-заглушкой)
       - Уровень      (level)
       - Доход        (fmtUSD)
       - Кол-во продаж (totalSales)
       - Кол-во артефактов (artifactCount)
   - Подиум (топ-3) + таблица остальных участников — визуальный стиль
     сохранён из оригинального LeaderboardView (палитра COLORS).
   ================================================================ */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Crown, Loader2, Users } from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgardStore } from "@/lib/store/osgard-store"
import { COLORS } from "@/lib/economy"
import { fmtUSD } from "@/lib/tc-market"
import { useTranslation } from "@/lib/i18n/use-translation"

const DEFAULT_AVATAR =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
       <rect width="48" height="48" rx="24" fill="#14141E"/>
       <circle cx="24" cy="18" r="8" fill="#2A2A3E"/>
       <path d="M8 42c0-9 7-14 16-14s16 5 16 14" fill="#2A2A3E"/>
     </svg>`,
  )

type SortKey = "income" | "level" | "sales"

const PODIUM = ["#FBBF24", "#CBD5E1", "#B87333"]

export function LeaderboardView() {
  const { t } = useTranslation()
  const { leaderboard, fetchLeaderboard, loading, error } = useOsgardStore()

  const SORTS: { id: SortKey; label: string }[] = [
    { id: "income", label: t("leaderboard.sortIncome") },
    { id: "level", label: t("leaderboard.sortLevel") },
    { id: "sales", label: t("leaderboard.sortSales") },
  ]

  useEffect(() => {
    fetchLeaderboard({ skipAuthRedirect: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [sort, setSort] = useState<SortKey>("income")

  const ranked = useMemo(() => {
    const arr = [...leaderboard].sort((a, b) => {
      if (sort === "level") return b.level - a.level || b.totalIncome - a.totalIncome
      if (sort === "sales") return b.totalSales - a.totalSales || b.totalIncome - a.totalIncome
      return b.totalIncome - a.totalIncome
    })
    return arr.map((u, i) => ({ ...u, position: i + 1 }))
  }, [leaderboard, sort])

  const podium = ranked.slice(0, 3)
  const rest = ranked.slice(3)

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0D0D1A 100%)", color: COLORS.text }}
    >
      <Navbar />

      <main className="mx-auto max-w-[1080px] px-6 py-10 md:px-10 md:py-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">{t("leaderboard.title")}</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              {t("leaderboard.subtitle")}
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
                  aria-pressed={active}
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

        {/* Loading */}
        {loading && ranked.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: COLORS.accent }} />
            <p className="text-[14px]" style={{ color: COLORS.label }}>
              {t("leaderboard.loadingRating")}
            </p>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <p className="mt-6 text-center text-[13px]" role="status" style={{ color: COLORS.red }}>
            {error}
          </p>
        )}

        {/* Empty */}
        {!loading && ranked.length === 0 && !error && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Users size={32} strokeWidth={1.25} style={{ color: COLORS.label }} />
            <p className="text-[15px]" style={{ color: COLORS.label }}>
              {t("leaderboard.empty")}
            </p>
          </div>
        )}

        {ranked.length > 0 && (
          <>
            {/* Podium */}
            <div className="mt-8 grid grid-cols-3 gap-4">
              {podium.map((u, i) => {
                const name = u.displayName || u.username
                return (
                  <Link
                    key={u.userId}
                    href={`/profile/${u.userId}`}
                    className="flex flex-col items-center rounded-xl px-4 py-6 text-center transition-colors"
                    style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
                  >
                    <span
                      className="flex size-11 items-center justify-center rounded-full"
                      style={{ border: `1px solid ${PODIUM[i]}` }}
                    >
                      <Crown size={20} strokeWidth={1.5} style={{ color: PODIUM[i] }} />
                    </span>
                    <img
                      src={u.avatarUrl || DEFAULT_AVATAR}
                      alt={name}
                      className="mt-3 size-10 rounded-full object-cover"
                      style={{ border: `1px solid ${COLORS.border}` }}
                      onError={(e) => {
                        ;(e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR
                      }}
                    />
                    <p className="mt-2 truncate text-[15px] font-medium">{name}</p>
                    <p className="text-[12px]" style={{ color: COLORS.label }}>
                      {t("leaderboard.level", { level: u.level })}
                    </p>
                    <p className="mt-2 text-[17px] font-medium" style={{ color: COLORS.accent }}>
                      {fmtUSD(u.totalIncome, 0)}
                    </p>
                    <p className="text-[11px]" style={{ color: COLORS.label }}>
                      {t("leaderboard.salesAndArtifacts", { sales: u.totalSales, artifacts: u.artifactCount })}
                    </p>
                  </Link>
                )
              })}
            </div>

            {/* Table */}
            <div
              className="mt-6 overflow-hidden rounded-xl"
              style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
            >
              <div
                className="grid grid-cols-[0.5fr_2fr_1fr_1.2fr_1fr_1fr] gap-4 px-6 py-3.5 text-[11px] font-medium uppercase tracking-[0.14em]"
                style={{ color: COLORS.label, borderBottom: `1px solid ${COLORS.border}` }}
              >
                <span>{t("leaderboard.colRank")}</span>
                <span>{t("leaderboard.colArchitect")}</span>
                <span>{t("leaderboard.colLevel")}</span>
                <span>{t("leaderboard.colIncome")}</span>
                <span className="text-right">{t("leaderboard.colSales")}</span>
                <span className="text-right">{t("leaderboard.colArtifacts")}</span>
              </div>
              {ranked.map((u) => {
                const name = u.displayName || u.username
                return (
                  <Link
                    key={u.userId}
                    href={`/profile/${u.userId}`}
                    className="grid grid-cols-[0.5fr_2fr_1fr_1.2fr_1fr_1fr] items-center gap-4 px-6 py-3.5 text-[14px] transition-colors hover:bg-white/5"
                    style={{ borderBottom: `1px solid ${COLORS.border}` }}
                  >
                    <span style={{ color: u.position <= 3 ? PODIUM[u.position - 1] : COLORS.label }}>
                      {u.position}
                    </span>
                    <div className="flex items-center gap-3">
                      <img
                        src={u.avatarUrl || DEFAULT_AVATAR}
                        alt={name}
                        className="size-8 shrink-0 rounded-full object-cover"
                        style={{ border: `1px solid ${COLORS.border}` }}
                        onError={(e) => {
                          ;(e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR
                        }}
                      />
                      <span className="truncate" style={{ color: COLORS.text }}>
                        {name}
                      </span>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.75)" }}>{t("leaderboard.levelShort", { level: u.level })}</span>
                    <span style={{ color: COLORS.accent }}>{fmtUSD(u.totalIncome, 0)}</span>
                    <span className="text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {u.totalSales}
                    </span>
                    <span className="text-right" style={{ color: "rgba(255,255,255,0.75)" }}>
                      {u.artifactCount}
                    </span>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
