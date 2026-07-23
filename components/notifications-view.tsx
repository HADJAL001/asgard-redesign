"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCheck,
  Heart,
  MessageCircle,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "@/lib/store/osgard-store"
import { useNotificationsStore, type AppNotification } from "@/lib/store/notifications-store"
import { formatTokens } from "@/lib/economy"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E
   status: new #00D4FF · important #F59E0B · read #6B7280 */

type NotifType = "comment" | "like" | "price" | "system"
type Status = "new" | "important" | "read"
type Bucket = "today" | "yesterday" | "week" | "earlier"

type Notification = {
  id: number
  type: NotifType
  status: Status
  text: string
  detail: string
  time: string
  date: string
  bucket: Bucket
}

const TYPE_ICON: Record<NotifType, LucideIcon> = {
  comment: MessageCircle,
  like: Heart,
  price: TrendingUp,
  system: AlertTriangle,
}

const STATUS: Record<Status, { label: string; color: string }> = {
  new: { label: "Новое", color: "#00D4FF" },
  important: { label: "Важное", color: "#F59E0B" },
  read: { label: "Прочитано", color: "#6B7280" },
}

const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "today", label: "Сегодня" },
  { id: "yesterday", label: "Вчера" },
  { id: "week", label: "На этой неделе" },
  { id: "earlier", label: "Раньше" },
]

/* SQLite CURRENT_TIMESTAMP отдаёт UTC-строку вида "YYYY-MM-DD HH:MM:SS" —
   для корректного парсинга в браузере (в т.ч. Safari) добавляем разделитель "T" и "Z". */
function parseServerDate(raw: string): Date {
  return new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`)
}

function bucketFor(raw: string): Bucket {
  const diffDays = Math.floor((Date.now() - parseServerDate(raw).getTime()) / 86_400_000)
  if (diffDays <= 0) return "today"
  if (diffDays === 1) return "yesterday"
  if (diffDays <= 7) return "week"
  return "earlier"
}

function dateLabelFor(raw: string): string {
  const diffDays = Math.floor((Date.now() - parseServerDate(raw).getTime()) / 86_400_000)
  if (diffDays <= 0) return "Сегодня"
  if (diffDays === 1) return "Вчера"
  return `${diffDays} ${diffDays % 10 === 1 && diffDays % 100 !== 11 ? "день" : "дней"} назад`
}

function timeLabelFor(raw: string): string {
  return parseServerDate(raw).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
}

function toCard(n: AppNotification): Notification {
  const type: NotifType = n.type === "like" || n.type === "comment" ? n.type : "system"
  return {
    id: n.id,
    type,
    status: n.read ? "read" : "new",
    text: n.text,
    detail: n.actor ? n.actor.displayName : "",
    time: timeLabelFor(n.createdAt),
    date: dateLabelFor(n.createdAt),
    bucket: bucketFor(n.createdAt),
  }
}

function Metric({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-lg px-5 py-4"
      style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
    >
      <span className="text-[24px] font-medium leading-none">{value}</span>
      <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
        {label}
      </span>
    </div>
  )
}

function NotificationCard({
  item,
  onRead,
}: {
  item: Notification
  onRead: (id: number) => void
}) {
  const Icon = TYPE_ICON[item.type]
  const status = STATUS[item.status]
  const unread = item.status !== "read"

  return (
    <article
      className="rounded-lg p-4 transition-colors"
      style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
    >
      <div className="flex items-start gap-3">
        {/* status dot */}
        <span
          className="mt-1.5 size-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: status.color }}
          aria-hidden="true"
        />

        <div className="min-w-0 flex-1">
          {/* meta row: status pill + type icon */}
          <div className="mb-1.5 flex items-center gap-2">
            <span
              className="rounded px-2 py-0.5 text-[11px] font-medium"
              style={{
                color: status.color,
                border: `1px solid ${status.color}`,
                opacity: unread ? 1 : 0.7,
              }}
            >
              {status.label}
            </span>
            <span
              className="inline-flex size-6 items-center justify-center rounded"
              style={{ border: "1px solid #2A2A3E", color: "#6A6A8A" }}
            >
              <Icon size={14} strokeWidth={1.75} />
            </span>
          </div>

          {/* main text */}
          <p className="text-[14px] leading-relaxed" style={{ color: "#FFFFFF" }}>
            {item.text}
          </p>
          {/* detail */}
          {item.detail && (
            <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              {item.detail}
            </p>
          )}
          {/* time */}
          <p className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {item.time} · {item.date}
          </p>

          {/* action */}
          {unread && item.id > 0 && (
            <button
              type="button"
              onClick={() => onRead(item.id)}
              className="mt-3 text-[13px] transition-opacity hover:opacity-80"
              style={{ color: "#00D4FF" }}
            >
              Отметить прочитанным
            </button>
          )}
        </div>
      </div>
    </article>
  )
}

export function NotificationsView() {
  const { tcPrice, change24h, tcTransactions } = useOsgard()
  const { notifications, loading, fetchNotifications, markRead, markAllRead } = useNotificationsStore()

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  // Live TC market notifications, derived from the store, shown under "today".
  // Синтетические записи (без бэкенд-аналога) — id всегда отрицательный.
  const marketNotifs = useMemo<Notification[]>(() => {
    const up = change24h >= 0
    const list: Notification[] = [
      {
        id: -1,
        type: "price",
        status: "important",
        text: `TimeCoin ${up ? "вырос" : "снизился"} на ${Math.abs(change24h).toFixed(2)}% за 24ч`,
        detail: `Текущий курс: $${tcPrice.toFixed(2)} за 1 ∞`,
        time: "сейчас",
        date: "Сегодня",
        bucket: "today",
      },
    ]
    tcTransactions.slice(0, 4).forEach((t, i) => {
      const label =
        t.kind === "buy"
          ? `Покупка ${formatTokens(t.amountTC)} ∞`
          : t.kind === "sell"
            ? `Продажа ${formatTokens(t.amountTC)} ∞`
            : t.kind === "stake"
              ? `Стейк ${formatTokens(t.amountTC)} ∞`
              : t.kind === "unstake"
                ? `Разблокировка ${formatTokens(t.amountTC)} ∞`
                : `Сожжено ${formatTokens(t.amountTC)} ∞`
      list.push({
        id: -100 - i,
        type: "price",
        status: "new",
        text: label,
        detail: t.price > 0 ? `По курсу $${t.price.toFixed(2)} · ${t.amountUSD ? `$${t.amountUSD.toFixed(2)}` : "—"}` : "Дефляционное сжигание предложения",
        time: new Date(t.ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        date: "Сегодня",
        bucket: "today",
      })
    })
    return list
  }, [tcPrice, change24h, tcTransactions])

  const [bucket, setBucket] = useState<Bucket>("today")

  const realCards = useMemo(() => notifications.map(toCard), [notifications])
  const allItems = useMemo(() => [...marketNotifs, ...realCards], [marketNotifs, realCards])

  const total = allItems.length
  const fresh = allItems.filter((n) => n.status === "new").length
  const important = allItems.filter((n) => n.status === "important").length

  const counts = useMemo(() => {
    const c: Record<Bucket, number> = { today: 0, yesterday: 0, week: 0, earlier: 0 }
    for (const n of allItems) c[n.bucket]++
    return c
  }, [allItems])

  const visible = allItems.filter((n) => n.bucket === bucket)

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #14141E 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto max-w-[900px] px-6 py-10 md:px-10 md:py-12">
        {/* Title row */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[32px] font-semibold leading-tight">Уведомления</h1>
            <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Все оповещения за последние 30 дней
            </p>
          </div>
          <button
            type="button"
            onClick={markAllRead}
            className="inline-flex items-center gap-2 self-start rounded-lg px-4 py-2.5 text-[14px] transition-colors sm:self-auto"
            style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.8)" }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00D4FF")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#2A2A3E")}
          >
            <CheckCheck size={16} strokeWidth={1.75} style={{ color: "#00D4FF" }} />
            Всё прочитано
          </button>
        </div>

        {/* Metrics */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          <Metric value={String(total)} label="Всего" />
          <Metric value={String(fresh)} label="Новые" />
          <Metric value={String(important)} label="Важные" />
        </div>

        {/* Time filters */}
        <div className="mt-8 flex flex-wrap gap-6 border-b" style={{ borderColor: "#2A2A3E" }}>
          {BUCKETS.map((b) => {
            const active = b.id === bucket
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setBucket(b.id)}
                className="relative -mb-px pb-3 text-[13px] uppercase tracking-wide transition-colors"
                style={{ color: active ? "#00D4FF" : "rgba(255,255,255,0.5)" }}
              >
                {b.label}
                <span className="ml-1.5 text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {counts[b.id]}
                </span>
                {active && (
                  <span
                    className="absolute inset-x-0 -bottom-px h-0.5"
                    style={{ backgroundColor: "#00D4FF" }}
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Feed */}
        <div className="mt-8 flex flex-col gap-4">
          {visible.length > 0 ? (
            visible.map((item) => (
              <NotificationCard key={item.id} item={item} onRead={markRead} />
            ))
          ) : (
            <p className="py-10 text-center text-[14px]" style={{ color: "rgba(255,255,255,0.35)" }}>
              {loading ? "Загрузка…" : "Нет уведомлений в этом периоде"}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
