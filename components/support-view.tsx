"use client"

import { useState } from "react"
import Link from "next/link"
import { Search, HelpCircle, ChevronRight, BookOpen, Beer, Construction } from "lucide-react"
import { Navbar } from "./navbar"
import { useTranslation } from "@/lib/i18n/use-translation"

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
    q: "Где найти баланс?",
    a: "Баланс всех валют — кредитов, шардов, кристаллов и TimeCoin — отображается в разделе «Кошелёк». Там же доступна история начислений и списаний за выбранный период.",
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

export function SupportView() {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [activeFaq, setActiveFaq] = useState<number | null>(1)

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

        {/* Two columns: FAQ 30% / in-development notice 70% */}
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

          {/* In-development notice — заменяет прежний макет с фейковым тикетом и чатом */}
          <section
            className="flex flex-col items-center justify-center rounded-xl p-10 text-center"
            style={{ backgroundColor: "#14141E", border: "1px solid #2A2A3E" }}
          >
            <span
              className="mb-4 flex size-14 items-center justify-center rounded-full"
              style={{ backgroundColor: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.25)" }}
            >
              <Construction size={26} strokeWidth={1.5} style={{ color: "#00D4FF" }} />
            </span>
            <h2 className="text-[18px] font-semibold text-white">{t("support.inDevelopmentTitle")}</h2>
            <p className="mt-2 max-w-md text-[14px] leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
              {t("support.inDevelopmentText")}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] font-medium transition-opacity"
                style={{ backgroundColor: "#00D4FF", color: "#0A0A0F" }}
              >
                <BookOpen size={16} strokeWidth={1.75} />
                Документация
              </Link>
              <Link
                href="/community"
                className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-[14px] transition-colors"
                style={{ border: "1px solid #2A2A3E", color: "rgba(255,255,255,0.7)" }}
              >
                <Beer size={16} strokeWidth={1.75} />
                Таверна
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
