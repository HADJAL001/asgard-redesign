"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Hammer, Coins, Trophy, Loader2, Sparkles, type LucideIcon } from "lucide-react"
import { Navbar } from "./navbar"
import { useActivityStore, type ActivityEvent } from "@/lib/store/activity-store"
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

const TYPE_ICON: Record<string, LucideIcon> = {
  artifact_crafted: Hammer,
  artifact_sold: Coins,
  hof_entry: Trophy,
}

const TYPE_COLOR: Record<string, string> = {
  artifact_crafted: "#00D4FF",
  artifact_sold: "#34D399",
  hof_entry: "#FFD700",
}

/* SQLite CURRENT_TIMESTAMP отдаёт UTC-строку вида "YYYY-MM-DD HH:MM:SS" —
   для корректного парсинга в браузере (в т.ч. Safari) добавляем разделитель "T" и "Z". */
function parseServerDate(raw: string): Date {
  return new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`)
}

function timeLabelFor(raw: string): string {
  const diffMin = Math.floor((Date.now() - parseServerDate(raw).getTime()) / 60_000)
  if (diffMin < 1) return "только что"
  if (diffMin < 60) return `${diffMin} мин назад`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} ч назад`
  const diffD = Math.floor(diffH / 24)
  return `${diffD} ${diffD % 10 === 1 && diffD % 100 !== 11 ? "день" : "дней"} назад`
}

function EventCard({ item }: { item: ActivityEvent }) {
  const Icon = TYPE_ICON[item.type] ?? Sparkles
  const color = TYPE_COLOR[item.type] ?? "#6A6A8A"
  const name = item.actor.displayName || item.actor.username

  return (
    <article
      className="rounded-lg p-4 transition-colors"
      style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = color)}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
    >
      <div className="flex items-start gap-3">
        <Link href={`/profile/${item.actor.id}`} className="shrink-0">
          <img
            src={item.actor.avatarUrl || DEFAULT_AVATAR}
            alt={name}
            className="size-9 rounded-full object-cover"
            style={{ border: `1px solid ${color}55` }}
            onError={(e) => {
              ;(e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR
            }}
          />
        </Link>

        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-relaxed" style={{ color: "#FFFFFF" }}>
            <Link href={`/profile/${item.actor.id}`} className="font-medium hover:underline">
              {name}
            </Link>{" "}
            <span style={{ color: "rgba(255,255,255,0.75)" }}>{item.text}</span>
          </p>
          <p className="mt-1.5 flex items-center gap-1.5 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            <Icon size={12} strokeWidth={1.75} style={{ color }} aria-hidden="true" />
            {timeLabelFor(item.createdAt)}
          </p>
        </div>
      </div>
    </article>
  )
}

export function ActivityFeedView() {
  const { t } = useTranslation()
  const { events, nextCursor, loading, loadingMore, error, fetchFeed, loadMore } = useActivityStore()

  useEffect(() => {
    fetchFeed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-[700px] px-6 py-10 md:px-10 md:py-12">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">{t("activityFeed.title")}</h1>
          <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
            {t("activityFeed.subtitle")}
          </p>
        </div>

        {loading && events.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Loader2 size={28} className="animate-spin" style={{ color: "#00D4FF" }} />
            <p className="text-[14px]" style={{ color: "#6A6A8A" }}>
              {t("common.loading")}
            </p>
          </div>
        )}

        {error && !loading && (
          <p className="mt-6 text-center text-[13px]" role="status" style={{ color: "#F87171" }}>
            {error}
          </p>
        )}

        {!loading && events.length === 0 && !error && (
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Sparkles size={32} strokeWidth={1.25} style={{ color: "#6A6A8A" }} />
            <p className="text-[15px]" style={{ color: "#6A6A8A" }}>
              {t("activityFeed.empty")}
            </p>
          </div>
        )}

        {events.length > 0 && (
          <div className="mt-8 flex flex-col gap-3">
            {events.map((item) => (
              <EventCard key={item.id} item={item} />
            ))}
          </div>
        )}

        {nextCursor && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={loadingMore}
              className="rounded-lg px-4 py-2.5 text-[13px] transition-colors disabled:opacity-50"
              style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.8)" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
            >
              {loadingMore ? t("common.loading") : t("activityFeed.loadMore")}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
