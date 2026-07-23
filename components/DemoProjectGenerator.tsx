"use client"

/* ================================================================
   DemoProjectGenerator — встроенный виджет на лендинге
   ----------------------------------------------------------------
   Кнопка-триггер «Создай свою вселенную» → открывает DemoProjectModal.
   Если лимит исчерпан → открывает IkeaModal.
   Отображает счётчик уже созданных вселенных из localStorage.
   ================================================================ */

import { useState, useEffect } from "react"
import { Sparkles, Rocket } from "lucide-react"
import { DemoProjectModal, loadSession, type DemoSessionV2 } from "./DemoProjectModal"
import { IkeaModal } from "./IkeaModal"

export function DemoProjectGenerator() {
  const [demoOpen, setDemoOpen] = useState(false)
  const [ikeaOpen, setIkeaOpen] = useState(false)
  const [ikeaSession, setIkeaSession] = useState<DemoSessionV2 | null>(null)
  const [sessionSummary, setSessionSummary] = useState<{ used: number; total: number } | null>(null)

  /* Загружаем сводку сессии из localStorage для отображения счётчика */
  useEffect(() => {
    Promise.resolve().then(() => {
      const s = loadSession()
      if (s.generationsUsed > 0) {
        setSessionSummary({ used: s.generationsUsed, total: s.generationsUsed })
      }
    })
  }, [demoOpen])

  function handleLimitReached(session: DemoSessionV2) {
    setDemoOpen(false)
    setIkeaSession(session)
    setIkeaOpen(true)
  }

  return (
    <>
      {/* ── Виджет на лендинге ── */}
      <section
        className="relative w-full py-20 px-4 flex flex-col items-center overflow-hidden"
        style={{
          background: "#020408",
        }}
      >
        {/* Ambient декор */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, rgba(212,175,55,0.1), transparent 70%)",
            filter: "blur(40px)",
          }}
          aria-hidden="true"
        />

        {/* Бейдж */}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-[12px] font-medium mb-6 tracking-wide"
          style={{
            background: "rgba(212,175,55,0.08)",
            border: "1px solid rgba(212,175,55,0.2)",
            color: "var(--eg-gold-1)",
          }}
        >
          <Sparkles size={13} />
          Попробуй бесплатно · Без регистрации
        </div>

        {/* Заголовок */}
        <h2
          className="text-[32px] sm:text-[42px] font-bold text-center text-white mb-3 leading-tight tracking-[-0.03em]"
          style={{ maxWidth: 640 }}
        >
          Создай свою вселенную
          <span
            className="block"
            style={{
              background: "linear-gradient(90deg, var(--eg-gold-1), var(--eg-gold-3))",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            за 7 секунд
          </span>
        </h2>

        <p
          className="text-[15px] text-center mb-8 max-w-md leading-relaxed"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          AI генерирует уникальный проект с артефактами — бесплатно. 3 попытки в день.
        </p>

        {/* Счётчик если уже есть генерации */}
        {sessionSummary && sessionSummary.used > 0 && (
          <div
            className="flex items-center gap-2 mb-5 px-4 py-2 rounded-full text-[12px]"
            style={{
              background: "rgba(212,175,55,0.06)",
              border: "1px solid rgba(212,175,55,0.15)",
              color: "var(--eg-gold-1)",
            }}
          >
            🌌 Ты уже создал {sessionSummary.used} {sessionSummary.used === 1 ? "вселенную" : "вселенных"} · сохрани их!
          </div>
        )}

        {/* Главная кнопка */}
        <button
          type="button"
          onClick={() => setDemoOpen(true)}
          className="group relative inline-flex items-center gap-3 rounded-2xl px-8 py-4 text-[16px] font-bold text-white transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, var(--eg-gold-1) 0%, var(--eg-gold-3) 100%)",
            color: "#0A0D14",
            boxShadow: "0 0 40px rgba(212,175,55,0.3), 0 8px 32px rgba(0,0,0,0.4)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "translateY(-2px) scale(1.02)"
            e.currentTarget.style.boxShadow = "0 0 60px rgba(212,175,55,0.4), 0 12px 40px rgba(0,0,0,0.5)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)"
            e.currentTarget.style.boxShadow = "0 0 40px rgba(212,175,55,0.3), 0 8px 32px rgba(0,0,0,0.4)"
          }}
        >
          <Rocket size={20} className="transition-transform duration-300 group-hover:rotate-12" />
          Сгенерировать AI-проект
          <span
            className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
            style={{ background: "var(--eg-gold-1)", boxShadow: "0 0 8px var(--eg-gold-1)", animation: "pg-pulse 2s ease-in-out infinite" }}
            aria-hidden="true"
          />
        </button>

        {/* Подсказка */}
        <p className="mt-4 text-[12px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          Sci-Fi · Fantasy · Cyberpunk · Steampunk и другие темы
        </p>

        {/* Примеры проектов */}
        <div className="mt-10 flex flex-wrap justify-center gap-2 max-w-xl">
          {[
            "Мой AI-арсенал",
            "Звёздная империя",
            "Кибер-нуар 2087",
            "Лес духов",
            "Стальной рассвет",
            "Архив богов",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setDemoOpen(true)}
              className="px-3 py-1.5 rounded-xl text-[12px] transition-all duration-200"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.4)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(212,175,55,0.3)"
                e.currentTarget.style.color = "rgba(255,255,255,0.7)"
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"
                e.currentTarget.style.color = "rgba(255,255,255,0.4)"
              }}
            >
              {ex}
            </button>
          ))}
        </div>
      </section>

      {/* ── Модалки ── */}
      <DemoProjectModal
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        onLimitReached={handleLimitReached}
      />

      <IkeaModal
        open={ikeaOpen}
        onClose={() => setIkeaOpen(false)}
        session={ikeaSession}
        onContinueDemo={() => setDemoOpen(true)}
      />

      <style>{`
        @keyframes pg-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.6; transform: scale(1.4); }
        }
      `}</style>
    </>
  )
}
