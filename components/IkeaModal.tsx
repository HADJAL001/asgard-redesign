"use client"

/* ================================================================
   IkeaModal — модалка ИКЕА-эффекта после исчерпания демо-генераций
   ----------------------------------------------------------------
   Показывает список созданных вселенных, которые "потеряются",
   4 преимущества регистрации и CTA кнопки.
   Неоновое золотое свечение — ощущение "потери ценного".
   ================================================================ */

import Link from "next/link"
import { Gift, Crown, Sparkles, Zap, Shield, ArrowRight, Clock } from "lucide-react"
import { PremiumModal } from "./PremiumModal"
import type { DemoSessionV2 } from "./DemoProjectModal"

const PERKS = [
  {
    Icon: Sparkles,
    color: "#FBBF24",
    glow: "rgba(251,191,36,0.2)",
    title: "50 бонусных AI-токенов",
    desc: "Сразу после регистрации на счёт",
  },
  {
    Icon: Crown,
    color: "#A78BFA",
    glow: "rgba(167,139,250,0.2)",
    title: "Все артефакты сохранятся",
    desc: "Твои вселенные не исчезнут",
  },
  {
    Icon: Zap,
    color: "#34D399",
    glow: "rgba(52,211,153,0.2)",
    title: "Редкий артефакт в подарок",
    desc: "Эксклюзивный стартовый бонус",
  },
  {
    Icon: Shield,
    color: "#60A5FA",
    glow: "rgba(96,165,250,0.2)",
    title: "Полный доступ к платформе",
    desc: "Торговля, стейкинг, маркетплейс",
  },
]

export interface IkeaModalProps {
  open: boolean
  onClose: () => void
  session: DemoSessionV2 | null
  /** Вернуться к созданию новых проектов (без регистрации) */
  onContinueDemo?: () => void
}

export function IkeaModal({ open, onClose, session, onContinueDemo }: IkeaModalProps) {
  const totalArtifacts = session?.projects.reduce((s, p) => s + p.artifactCount, 0) ?? 0
  const projectCount = session?.projects.length ?? 0

  /* Таймер до истечения сессии */
  const expiresAt = session?.expiresAt ?? 0
  const hoursLeft = Math.max(0, Math.ceil((expiresAt - Date.now()) / 3600_000))

  return (
    <PremiumModal
      open={open}
      onClose={onClose}
      maxWidth="md"
      hideClose={false}
      icon={<Gift size={22} style={{ color: "#FBBF24" }} />}
      title={`Ты создал ${totalArtifacts} артефактов!`}
      subtitle={`${projectCount} ${projectCount === 1 ? "вселенная" : projectCount < 5 ? "вселенные" : "вселенных"} ждут сохранения`}
    >
      <div className="space-y-5">

        {/* Список проектов под угрозой */}
        {session && session.projects.length > 0 && (
          <div
            className="rounded-2xl p-4 space-y-2"
            style={{
              background: "rgba(251,191,36,0.04)",
              border: "1px solid rgba(251,191,36,0.15)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Clock size={13} style={{ color: "#FBBF24" }} />
              <span className="text-[11px] font-medium" style={{ color: "#FBBF24" }}>
                ИСЧЕЗНУТ ЧЕРЕЗ {hoursLeft}ч БЕЗ РЕГИСТРАЦИИ
              </span>
            </div>
            {session.projects.map((p, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px]"
                    style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)" }}
                  >
                    🌌
                  </div>
                  <span className="text-[13px] text-white/80 truncate max-w-[160px]">{p.name}</span>
                </div>
                <span
                  className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(251,191,36,0.1)", color: "#FBBF24" }}
                >
                  {p.artifactCount} арт.
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 4 преимущества */}
        <div className="grid grid-cols-2 gap-2.5">
          {PERKS.map(({ Icon, color, glow, title, desc }) => (
            <div
              key={title}
              className="rounded-2xl p-3.5 flex flex-col gap-2"
              style={{
                background: `rgba(${hexToRgb(color)}, 0.04)`,
                border: `1px solid rgba(${hexToRgb(color)}, 0.15)`,
              }}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: glow, border: `1px solid rgba(${hexToRgb(color)}, 0.3)` }}
              >
                <Icon size={15} style={{ color }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-white leading-snug">{title}</p>
                <p className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Главный CTA */}
        <Link
          href="/register"
          className="flex items-center justify-center gap-2.5 w-full rounded-2xl py-4 text-[15px] font-bold transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #FBBF24, #F59E0B, #EF4444)",
            color: "#1a0f00",
            boxShadow: "0 0 40px rgba(251,191,36,0.3), 0 8px 32px rgba(0,0,0,0.4)",
            letterSpacing: "-0.01em",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 0 50px rgba(251,191,36,0.4), 0 12px 40px rgba(0,0,0,0.5)" }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 0 40px rgba(251,191,36,0.3), 0 8px 32px rgba(0,0,0,0.4)" }}
        >
          🚀 Зарегистрироваться и сохранить <ArrowRight size={16} />
        </Link>

        {/* Вторичный CTA */}
        <button
          type="button"
          onClick={() => { onContinueDemo?.(); onClose() }}
          className="w-full rounded-2xl py-3 text-[13px] font-medium transition-colors duration-200"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.4)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)" }}
        >
          Продолжить без регистрации
        </button>

        {/* Мелкий дисклеймер */}
        <p className="text-center text-[11px]" style={{ color: "rgba(255,255,255,0.2)" }}>
          Регистрация бесплатна · Без кредитной карты
        </p>
      </div>
    </PremiumModal>
  )
}

/* Утилита: hex → "r,g,b" для rgba() */
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}
