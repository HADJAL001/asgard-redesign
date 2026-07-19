"use client"

import { useState } from "react"
import {
  Search,
  HelpCircle,
  ChevronRight,
  MessageCircle,
  Send,
  X,
  Clock,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from "lucide-react"
import { Navbar } from "./navbar"

/* ---- Palette ----
   bg #0A0A0F · card #14141E · accent #00D4FF · text #FFFFFF · label #6A6A8A · border #2A2A3E */

type Faq = { id: number; q: string; a: string }

const FAQS: Faq[] = [
  {
    id: 1,
    q: "Как создать проект?",
    a: "Перейдите в раздел «Проекты» и нажмите кнопку «Создать проект». Заполните название, описание и выберите статус — проект появится в вашей сетке.",
  },
  {
    id: 2,
    q: "Где найти токены?",
    a: "Токены отображаются в разделе «Портфель». Там же доступна история начислений, сгорания и покупок за выбранный период.",
  },
  {
    id: 3,
    q: "Как улучшить артефакт?",
    a: "Откройте артефакт в разделе «Артефакты» и нажмите «Улучшить» — вы попадёте в Кузницу, где увидите требуемые ресурсы и прирост характеристик.",
  },
  {
    id: 4,
    q: "Что такое нейросеть?",
    a: "Нейросеть — это тип артефакта, создаваемый в Кузнице из энергии и материи. Она повышает эффективность обработки задач в ваших проектах.",
  },
  {
    id: 5,
    q: "Как привязать API?",
    a: "В разделе «Настройки → API Интеграции» создайте новый ключ, скопируйте его и укажите в заголовке Authorization ваших запросов.",
  },
]

type ChatMsg = { id: number; from: "op" | "me"; text: string; time: string }

const CHAT: ChatMsg[] = [
  { id: 1, from: "op", text: "Добрый день! Чем могу помочь?", time: "12:30" },
  { id: 2, from: "me", text: "Здравствуйте! У меня проблема с улучшением артефакта. Не хватает ресурсов.", time: "12:32" },
  { id: 3, from: "op", text: "Понял. Проверьте, сколько у вас кристаллов. Для улучшения нужно минимум 5.", time: "12:33" },
  { id: 4, from: "me", text: "У меня 12 кристаллов, но кнопка не активна.", time: "12:35" },
  { id: 5, from: "op", text: "Сейчас проверю ваш аккаунт…", time: "12:36" },
]

const METRICS = [
  { label: "Вопросов", value: "12", color: "#FFFFFF" },
  { label: "Решено", value: "8", color: "#4ADE80" },
  { label: "В работе", value: "3", color: "#FBBF24" },
  { label: "Среднее время", value: "2.4 часа", color: "#00D4FF" },
]

export function SupportView() {
  const [query, setQuery] = useState("")
  const [activeFaq, setActiveFaq] = useState<number | null>(1)
  const [chatOpen, setChatOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const [message, setMessage] = useState("")

  const filtered = FAQS.filter((f) => f.q.toLowerCase().includes(query.toLowerCase()))

  return (
    <div className="min-h-screen font-sans" style={{ background: "linear-gradient(180deg, #0A0A0F 0%, #0A1628 100%)", color: "#FFFFFF" }}>
      <Navbar />

      <main className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10">
        {/* Title */}
        <h1 className="text-[32px] font-semibold leading-tight">Поддержка</h1>
        <p className="mt-1 text-[14px]" style={{ color: "rgba(255,255,255,0.4)" }}>
          Помощь и ответы на вопросы
        </p>

        {/* Search */}
        <div
          className="mt-6 flex items-center gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          <Search size={18} strokeWidth={1.75} style={{ color: "#6A6A8A" }} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по вопросам…"
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-white/40"
            style={{ color: "rgba(255,255,255,0.85)" }}
          />
        </div>

        {/* Metrics */}
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {METRICS.map((m) => (
            <div
              key={m.label}
              className="rounded-xl p-5"
              style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
            >
              <div className="text-[24px] font-medium" style={{ color: m.color }}>
                {m.value}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: "rgba(255,255,255,0.5)" }}>
                {m.label}
              </div>
            </div>
          ))}
        </div>

        {/* Two columns: FAQ 30% / Ticket 70% */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
          {/* FAQ */}
          <section
            className="rounded-xl p-5"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <h2 className="text-[12px] font-medium uppercase tracking-[0.14em]" style={{ color: "#6A6A8A" }}>
              Частые вопросы
            </h2>
            <ul className="mt-4 flex flex-col gap-1">
              {filtered.map((f) => {
                const active = activeFaq === f.id
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => setActiveFaq(active ? null : f.id)}
                      className="flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left text-[14px] transition-colors"
                      style={{
                        color: active ? "#00D4FF" : "rgba(255,255,255,0.8)",
                        backgroundColor: active ? "rgba(0,212,255,0.08)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)"
                      }}
                      onMouseLeave={(e) => {
                        if (!active) e.currentTarget.style.backgroundColor = "transparent"
                      }}
                    >
                      <HelpCircle
                        size={16}
                        strokeWidth={1.75}
                        className="mt-0.5 shrink-0"
                        style={{ color: active ? "#00D4FF" : "#6A6A8A" }}
                      />
                      <span>{f.q}</span>
                    </button>
                    {active && (
                      <p
                        className="px-3 pb-2 pt-1 text-[13px] leading-relaxed"
                        style={{ color: "rgba(255,255,255,0.6)" }}
                      >
                        {f.a}
                      </p>
                    )}
                  </li>
                )
              })}
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-[13px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Ничего не найдено
                </li>
              )}
            </ul>
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-[13px] transition-colors"
              style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.7)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "#00D4FF"
                e.currentTarget.style.color = "#00D4FF"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#2A2A3E"
                e.currentTarget.style.color = "rgba(255,255,255,0.7)"
              }}
            >
              Все вопросы
              <ChevronRight size={15} strokeWidth={1.75} />
            </button>
          </section>

          {/* Ticket */}
          <section
            className="rounded-xl p-6"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-[12px] font-medium uppercase tracking-[0.14em]" style={{ color: "#6A6A8A" }}>
                Мой тикет
              </h2>
              <span className="text-[12px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                №1234 · 12.07.2026
              </span>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium"
                style={{ backgroundColor: "rgba(251,191,36,0.12)", color: "#FBBF24" }}
              >
                <Loader2 size={13} strokeWidth={2} />
                В работе
              </span>
            </div>

            <h3 className="mt-5 text-[18px] font-medium">Проблема с артефактом</h3>
            <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              При попытке улучшить артефакт «Кристалл Знаний» кнопка улучшения остаётся неактивн��й,
              несмотря на достаточное количество кристаллов. Оператор проверяет состояние аккаунта.
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <dt className="text-[12px]" style={{ color: "#6A6A8A" }}>
                  Открыт
                </dt>
                <dd className="mt-1 flex items-center gap-1.5 text-[14px]">
                  <Clock size={14} strokeWidth={1.75} style={{ color: "#6A6A8A" }} />
                  12.07.2026, 12:28
                </dd>
              </div>
              <div>
                <dt className="text-[12px]" style={{ color: "#6A6A8A" }}>
                  Категория
                </dt>
                <dd className="mt-1 text-[14px]">Артефакты</dd>
              </div>
            </dl>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <RefreshCw size={16} strokeWidth={1.75} />
                Обновить
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] transition-colors"
                style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.7)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "#F87171"
                  e.currentTarget.style.color = "#F87171"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "#2A2A3E"
                  e.currentTarget.style.color = "rgba(255,255,255,0.7)"
                }}
              >
                <CheckCircle2 size={16} strokeWidth={1.75} />
                Закрыть
              </button>
              <button
                type="button"
                onClick={() => setChatOpen(true)}
                className="ml-auto inline-flex items-center gap-2 text-[14px] transition-colors"
                style={{ color: "#00D4FF" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.8")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <MessageCircle size={16} strokeWidth={1.75} />
                Открыть чат
              </button>
            </div>
          </section>
        </div>

        {/* Write to support */}
        <section
          className="mt-6 rounded-xl p-6"
          style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
        >
          <h2 className="text-[12px] font-medium uppercase tracking-[0.14em]" style={{ color: "#6A6A8A" }}>
            Написать в поддержку
          </h2>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Опишите ваш вопрос или проблему…"
            className="mt-4 w-full resize-none rounded-lg px-4 py-3 text-[14px] outline-none placeholder:text-white/30 focus:border-[#00D4FF]"
            style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
          />
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setChatOpen(true)
                setMessage("")
              }}
              className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity"
              style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              <Send size={16} strokeWidth={1.75} />
              Отправить
            </button>
          </div>
        </section>
      </main>

      {/* Support chat modal */}
      {chatOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(5,8,20,0.7)" }}
          onClick={() => setChatOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Чат с поддержкой"
        >
          <div
            className="flex h-[80vh] w-full max-w-lg flex-col rounded-2xl"
            style={{ backgroundColor: "#0A0A0F", border: "1px solid #2A2A3E" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Chat header */}
            <div
              className="flex shrink-0 items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid #2A2A3E" }}
            >
              <div className="flex items-center gap-2.5">
                <MessageCircle size={18} strokeWidth={1.75} style={{ color: "#00D4FF" }} />
                <div>
                  <h2 className="text-[15px] font-medium">Чат с поддержкой</h2>
                  <p className="flex items-center gap-1.5 text-[11px]" style={{ color: "#4ADE80" }}>
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: "#4ADE80" }} />
                    Оператор онлайн
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                aria-label="Закрыть"
                className="transition-colors hover:text-white"
                style={{ color: "#6A6A8A" }}
              >
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {CHAT.map((m) => {
                const mine = m.from === "me"
                return (
                  <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <div
                      className="max-w-[80%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed"
                      style={{
                        backgroundColor: mine ? "#00D4FF" : "#14141E",
                        color: mine ? "#0A0A0F" : "#FFFFFF",
                        border: mine ? "none" : "1px solid #2A2A3E",
                      }}
                    >
                      {m.text}
                    </div>
                    <span className="mt-1 px-1 text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {m.time}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* Composer */}
            <div
              className="flex shrink-0 items-center gap-3 px-5 py-4"
              style={{ borderTop: "1px solid #2A2A3E" }}
            >
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Введите сообщение…"
                className="w-full rounded-lg px-4 py-2.5 text-[14px] outline-none placeholder:text-white/30 focus:border-[#00D4FF]"
                style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E", color: "#FFFFFF" }}
              />
              <button
                type="button"
                onClick={() => setDraft("")}
                aria-label="Отправить"
                className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-medium transition-opacity"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                <Send size={16} strokeWidth={1.75} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
