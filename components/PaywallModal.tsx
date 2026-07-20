"use client"

/* ================================================================
   PaywallModal — модалка блокировки действия для незарегистрированных
   ----------------------------------------------------------------
   Появляется когда гость пытается сделать что-то интерактивное.
   Использует PremiumModal как обёртку.
   Контекст (blockedAction) подтягивается из ReadonlyModeProvider.
   ================================================================ */

import Link from "next/link"
import { Lock, Sparkles, Crown, Zap, ArrowRight } from "lucide-react"
import { PremiumModal } from "./PremiumModal"
import { useReadonlyMode } from "@/lib/readonly-mode"

/* Список преимуществ регистрации */
const PERKS = [
  { Icon: Sparkles, color: "#06B6D4", text: "Создавать артефакты и проекты" },
  { Icon: Crown,    color: "#A78BFA", text: "Торговать на маркетплейсе" },
  { Icon: Zap,      color: "#34D399", text: "Зарабатывать TimeCoin" },
  { Icon: Lock,     color: "#FBBF24", text: "Полный доступ ко всем функциям" },
]

export function PaywallModal() {
  const { isPaywallOpen, closePaywall, blockedAction } = useReadonlyMode()

  return (
    <PremiumModal
      open={isPaywallOpen}
      onClose={closePaywall}
      maxWidth="sm"
      icon={<Lock size={20} style={{ color: "#06B6D4" }} />}
      title="Только для участников"
      subtitle={
        blockedAction
          ? `«${blockedAction}» доступно после регистрации`
          : "Зарегистрируйтесь чтобы использовать полный функционал платформы"
      }
    >
      <div className="space-y-4">
        {/* Список что будет доступно */}
        <ul className="space-y-2">
          {PERKS.map(({ Icon, color, text }) => (
            <li
              key={text}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div
                className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: `${color}18`, border: `1px solid ${color}30` }}
              >
                <Icon size={13} style={{ color }} />
              </div>
              <span className="text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>{text}</span>
            </li>
          ))}
        </ul>

        {/* CTA кнопки */}
        <Link
          href="/register"
          onClick={closePaywall}
          className="flex items-center justify-center gap-2 w-full rounded-2xl py-3.5 text-[14px] font-semibold transition-all duration-200"
          style={{
            background: "linear-gradient(135deg, #06B6D4, #7C3AED)",
            color: "#fff",
            boxShadow: "0 0 30px rgba(6,182,212,0.25)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)" }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)" }}
        >
          Зарегистрироваться бесплатно <ArrowRight size={15} />
        </Link>

        <Link
          href="/login"
          onClick={closePaywall}
          className="flex items-center justify-center w-full rounded-2xl py-3 text-[13px] font-medium transition-colors duration-200"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "rgba(255,255,255,0.5)",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.8)" }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.5)" }}
        >
          Уже есть аккаунт? Войти
        </Link>
      </div>
    </PremiumModal>
  )
}
