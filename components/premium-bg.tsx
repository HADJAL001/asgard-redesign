"use client"

/* ================================================================
   OSGARD · PremiumBackground — переиспользуемый премиальный фон
   ----------------------------------------------------------------
   Тонкий слой дрейфующих тематических глифов + мягкое сияние и
   виньетка. Разные variant дают разный «смысл» фона (монеты, валюты
   и золото, идеи-иконки, артефакты рынка). Чисто CSS/юникод — без
   внешних картинок, ничего «битого». Позиции детерминированы по
   индексу (без Math.random) — нет SSR-расхождений.
   Рендерится ЗА контентом (z-index 0), контент оборачивай в
   relative z-10.
   ================================================================ */

import { useId } from "react"

type Variant = "coins" | "gold" | "ideas" | "market"

const GLYPHS: Record<Variant, string[]> = {
  coins: ["∞", "$", "◎", "∞", "¤", "◉"],
  gold: ["$", "€", "£", "¥", "▬", "∞"],
  ideas: ["🛡", "🛒", "🌐", "💬", "📈", "🎮", "🔒", "📱", "⚙", "✦"],
  market: ["◈", "◆", "❖", "✦", "◇", "⬡"],
}

const TINT: Record<Variant, string> = {
  coins: "rgba(230,200,104,0.5)",   // золото
  gold: "rgba(230,200,104,0.5)",
  ideas: "rgba(120,180,255,0.42)",  // холодный «идейный» неон
  market: "rgba(181,123,255,0.45)", // фиолетовый премиум
}

const GLOW: Record<Variant, string> = {
  coins: "rgba(201,168,76,0.14)",
  gold: "rgba(201,168,76,0.16)",
  ideas: "rgba(80,140,255,0.12)",
  market: "rgba(155,89,182,0.14)",
}

const CSS = `
@keyframes pbg-drift { 0% { transform: translateY(12px); opacity: 0 } 12% { opacity: 1 } 88% { opacity: 1 } 100% { transform: translateY(-26px); opacity: 0 } }
@keyframes pbg-glow { 0%,100% { opacity: .55 } 50% { opacity: .95 } }
.pbg-root { position: absolute; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
.pbg-g { position: absolute; will-change: transform, opacity; user-select: none; line-height: 1; }
.pbg-glow { position: absolute; left: 50%; top: 12%; width: 720px; height: 380px; transform: translateX(-50%);
  filter: blur(40px); animation: pbg-glow 7s ease-in-out infinite; }
.pbg-vignette { position: absolute; inset: 0; background: radial-gradient(120% 90% at 50% 30%, transparent 42%, rgba(3,5,12,0.6) 100%); }
@media (prefers-reduced-motion: reduce) { .pbg-g { animation: none !important; opacity: .5 !important; } }
`

export function PremiumBackground({ variant = "coins" }: { variant?: Variant }) {
  const uid = useId().replace(/[:]/g, "")
  const glyphs = GLYPHS[variant]
  const tint = TINT[variant]
  const COUNT = 26

  return (
    <div className="pbg-root" aria-hidden="true">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pbg-glow" style={{ background: `radial-gradient(closest-side, ${GLOW[variant]}, transparent)` }} />
      {Array.from({ length: COUNT }).map((_, i) => {
        // Детерминированная псевдослучайная раскладка по индексу.
        const left = (i * 37 + 11) % 100
        const top = (i * 53 + 7) % 100
        const size = 16 + ((i * 13) % 30)
        const dur = 9 + ((i * 7) % 12)
        const delay = -((i * 5) % 12)
        const g = glyphs[i % glyphs.length]
        const isEmoji = variant === "ideas"
        return (
          <span
            key={`${uid}-${i}`}
            className="pbg-g"
            style={{
              left: `${left}%`,
              top: `${top}%`,
              fontSize: `${size}px`,
              color: isEmoji ? undefined : tint,
              opacity: isEmoji ? 0.14 : undefined,
              filter: isEmoji ? "grayscale(0.2)" : undefined,
              animation: `pbg-drift ${dur}s ease-in-out ${delay}s infinite`,
            }}
          >
            {g}
          </span>
        )
      })}
      <div className="pbg-vignette" />
    </div>
  )
}
