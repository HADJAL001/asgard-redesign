"use client"

/* ================================================================
   OSGARD · GuestJarvisHint — подсказка ДЖАРВИСа для неавторизованных
   ----------------------------------------------------------------
   Открывается вместо paywall-модалки по клику на FAB ДЖАРВИСа, пока
   пользователь не авторизован. Показывает несколько готовых
   вопрос-ответов (без реального AI-вызова — все /jarvis/* роуты
   бэкенда требуют авторизации) + два CTA.

   "Попробовать бесплатно" не завязан напрямую на DemoProjectModal
   (тот сейчас активно меняется параллельной сессией в рамках
   реконнекта hero-формы) — вместо прямого импорта шлёт DOM-событие
   "osgard:guest-try-free", которое слушает форма на лендинге. Если
   слушателя ещё нет, просто мягко скроллит к началу страницы, где
   расположена hero-форма.
   ================================================================ */

import Link from "next/link"
import { X, Sparkles, ArrowRight } from "lucide-react"
import { AvatarOrb } from "@/components/ui/AvatarOrb"

const FAQ: { q: string; a: string }[] = [
  {
    q: "Что ты умеешь?",
    a: "Я помогаю придумывать проекты, писать код и собирать артефакты вселенной голосом или текстом. Полный доступ открывается после регистрации.",
  },
  {
    q: "Это бесплатно?",
    a: "Демо-генерация доступна гостям без регистрации, с лимитом попыток в сутки. Полный ДЖАРВИС и сохранение прогресса — после входа в аккаунт.",
  },
  {
    q: "Мои данные сохранятся?",
    a: "Демо-сессия живёт в этом браузере. При регистрации мы бесплатно конвертируем её в реальные проекты и начислим бонус.",
  },
  {
    q: "Как начать?",
    a: "Нажми «Попробовать бесплатно» ниже — не нужно ничего вводить, кроме названия своей вселенной.",
  },
]

type GuestJarvisHintProps = {
  onClose: () => void
  onTryFree?: () => void
}

function defaultTryFree() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent("osgard:guest-try-free"))
  window.scrollTo({ top: 0, behavior: "smooth" })
}

export function GuestJarvisHint({ onClose, onTryFree }: GuestJarvisHintProps) {
  function handleTryFree() {
    ;(onTryFree ?? defaultTryFree)()
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-label="Подсказка ДЖАРВИСа"
      style={{
        position: "fixed",
        right: 24,
        bottom: 96,
        zIndex: 9998,
        width: 320,
        maxWidth: "calc(100vw - 32px)",
        borderRadius: 18,
        overflow: "hidden",
        background: "#0A0A0F",
        border: "1px solid rgba(0,212,255,0.25)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
        color: "#fff",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "14px 14px 10px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <AvatarOrb size={36} variant="idle" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>ДЖАРВИС</div>
          <div style={{ fontSize: 12, opacity: 0.6 }}>Гостевой режим</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.6)",
            cursor: "pointer",
            padding: 4,
          }}
        >
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, maxHeight: 280, overflowY: "auto" }}>
        {FAQ.map((item) => (
          <div key={item.q}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#00D4FF", marginBottom: 2 }}>{item.q}</div>
            <div style={{ fontSize: 13, opacity: 0.75, lineHeight: 1.4 }}>{item.a}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 14px 14px" }}>
        <button
          type="button"
          onClick={handleTryFree}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "10px 16px",
            borderRadius: 10,
            border: "none",
            background: "#00D4FF",
            color: "#0A0A0F",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <Sparkles size={16} />
          Попробовать бесплатно
        </button>
        <Link
          href="/register"
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.2)",
            color: "#fff",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          Открыть полного ДЖАРВИСа
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}

export default GuestJarvisHint
