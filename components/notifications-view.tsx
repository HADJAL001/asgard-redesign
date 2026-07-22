"use client"

import { useMemo, useState } from "react"
import {
  Bell,
  Folder,
  MessageCircle,
  Star,
  AlertTriangle,
  CheckCheck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react"
import { Navbar } from "./navbar"
import { useOsgard } from "@/lib/store/osgard-store"
import { formatTokens } from "@/lib/economy"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E
   status: new #00D4FF · important #F59E0B · read #6B7280 */

type NotifType = "comment" | "project" | "message" | "artifact" | "system" | "price"
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
  comment: Bell,
  project: Folder,
  message: MessageCircle,
  artifact: Star,
  system: AlertTriangle,
  price: TrendingUp,
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

const DATA: Notification[] = [
  {
    id: 1,
    type: "comment",
    status: "new",
    text: "Alex Odin прокомментировал пост",
    detail: "«Отличная идея, коллеги!»",
    time: "12:30",
    date: "Сегодня",
    bucket: "today",
  },
  {
    id: 2,
    type: "project",
    status: "important",
    text: "Проект «Нейросеть» перешёл на этап «Тестирование»",
    detail: "Ожидайте результатов через 3 дня.",
    time: "10:15",
    date: "Сегодня",
    bucket: "today",
  },
  {
    id: 3,
    type: "system",
    status: "new",
    text: "Обновление ядра OSGARD до версии 4.2",
    detail: "Улучшена производительность рендеринга и стабильность.",
    time: "08:40",
    date: "Сегодня",
    bucket: "today",
  },
  {
    id: 4,
    type: "message",
    status: "read",
    text: "Medusa_Code отправил сообщение",
    detail: "«Когда встреча по проекту?»",
    time: "18:45",
    date: "Вчера",
    bucket: "yesterday",
  },
  {
    id: 5,
    type: "comment",
    status: "important",
    text: "Assardi_Valkyrie упомянула вас в обсуждении",
    detail: "«@AlexOdin взгляни на архитектуру шлюза»",
    time: "14:20",
    date: "Вчера",
    bucket: "yesterday",
  },
  {
    id: 6,
    type: "artifact",
    status: "read",
    text: "Вы получили новый артефакт",
    detail: "«Кристалл Творца» (Легендарный)",
    time: "09:20",
    date: "2 дня назад",
    bucket: "week",
  },
  {
    id: 7,
    type: "project",
    status: "read",
    text: "Проект «Orbital API» завершён",
    detail: "Все задачи закрыты. Финальный отчёт готов.",
    time: "16:05",
    date: "3 дня назад",
    bucket: "week",
  },
  {
    id: 8,
    type: "system",
    status: "important",
    text: "Обнаружен вход с нового устройства",
    detail: "MacBook Pro · Москва. Если это не вы — смените пароль.",
    time: "11:30",
    date: "4 дня назад",
    bucket: "week",
  },
  {
    id: 9,
    type: "message",
    status: "read",
    text: "Gold_Architect отправил приглашение в проект",
    detail: "«Nebula Core» — роль: Архитектор.",
    time: "10:00",
    date: "12 дней назад",
    bucket: "earlier",
  },
  {
    id: 10,
    type: "artifact",
    status: "read",
    text: "Артефакт «Щит Валькирии» улучшен до Lvl. 5",
    detail: "Защита +40, Магия +15.",
    time: "19:12",
    date: "18 дней назад",
    bucket: "earlier",
  },
  {
    id: 11,
    type: "comment",
    status: "read",
    text: "3 новых реакции на ваш пост",
    detail: "«Полностью на палитре OSGARD, без стекла...»",
    time: "13:45",
    date: "21 день назад",
    bucket: "earlier",
  },
  {
    id: 12,
    type: "important" as never,
    status: "read",
    text: "Начислено 340 токенов за активность",
    detail: "Еженедельная награда сообщества.",
    time: "09:00",
    date: "25 дней назад",
    bucket: "earlier",
  },
]

// normalize the intentionally-mistyped last row
DATA[11].type = "system"

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
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
            {item.detail}
          </p>
          {/* time */}
          <p className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.3)" }}>
            {item.time} · {item.date}
          </p>

          {/* action */}
          {unread && (
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

  // Live TC market notifications, derived from the store, shown under "today".
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

  const [items, setItems] = useState<Notification[]>(DATA)
  const [bucket, setBucket] = useState<Bucket>("today")

  const allItems = useMemo(() => [...marketNotifs, ...items], [marketNotifs, items])

  const markRead = (id: number) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: "read" } : n)))

  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, status: "read" as Status })))

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
              Нет уведомлений в этом периоде
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
