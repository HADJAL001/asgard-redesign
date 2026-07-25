"use client"

/* ================================================================
   OSGARD · Brand Mark (∞)  — Claude B
   ----------------------------------------------------------------
   Фирменный знак бесконечности в «дорогом» исполнении:
   гравированный золотой лемнискат (металлический градиент
   F7E05E→D4AF37→B8860B) + тонкий бегущий световой филамент.

   Это ЛОГОТИП-использование (шапка входа/регистрации, сплэши),
   а НЕ денежный глиф TimeCoin — тот остаётся lucide-иконкой ∞
   инлайн в тексте (30+ мест) и здесь не участвует.

   Один непрерывный path (крест по центру = «узел бесконечности»),
   round-стыки → эффект гравировки. Анимация — только на overlay-
   филаменте, уважает prefers-reduced-motion (см. globals.css).
   ================================================================ */

// Непрерывный лемнискат: старт в центре (50,28) → левая петля → центр →
// правая петля → центр. Пересечение по центру даёт «узел».
const INFINITY_PATH =
  "M50 28 C42 14 22 14 22 28 C22 42 42 42 50 28 C58 14 78 14 78 28 C78 42 58 42 50 28 Z"

export type OsgardMarkProps = {
  /** Размер стеклянной золотой коробки в px (по умолчанию 64 = h-16 w-16). */
  size?: number
  /** Обернуть знак в стеклянную золотую «оправу» (лого-режим). */
  boxed?: boolean
  /** Бегущий световой филамент (заглушается prefers-reduced-motion). */
  animated?: boolean
  /** Доп. классы на обёртку (в boxed-режиме) или на сам svg. */
  className?: string
}

/**
 * Премиальный бренд-знак OSGARD (∞).
 * По умолчанию — в стеклянной золотой коробке 64×64 (как шапка входа).
 * `boxed={false}` даёт «голый» знак для инлайн-использования в премиум-панелях.
 */
export function OsgardMark({
  size = 64,
  boxed = true,
  animated = true,
  className,
}: OsgardMarkProps) {
  const glyphWidth = Math.round(size * 0.58)

  const glyph = (
    <svg
      className={`osgard-mark${boxed ? "" : ` ${className ?? ""}`}`}
      width={glyphWidth}
      viewBox="0 0 100 56"
      role="img"
      aria-label="OSGARD"
      fill="none"
    >
      <defs>
        <linearGradient
          id="osgard-mark-gold"
          x1="0"
          y1="0"
          x2="100"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#F7E05E" />
          <stop offset="46%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#B8860B" />
        </linearGradient>
      </defs>

      {/* Гравированное золотое тело знака. */}
      <path className="osgard-mark-base" d={INFINITY_PATH} strokeWidth={7} />

      {/* Бегущий световой блик вдоль контура (pathLength нормирован к 300,
          чтобы dash-анимация не зависела от реальной длины геометрии). */}
      {animated && (
        <path
          className="osgard-mark-sheen"
          d={INFINITY_PATH}
          strokeWidth={3.4}
          pathLength={300}
        />
      )}
    </svg>
  )

  if (!boxed) return glyph

  return (
    <div
      className={`osgard-mark-box relative flex items-center justify-center rounded-2xl border border-[color:rgb(var(--color-gold-rgb)/0.4)] bg-[color:var(--eg-glass-bg)] shadow-[var(--eg-glow-gold)] backdrop-blur ${className ?? ""}`}
      style={{ height: size, width: size }}
    >
      {glyph}
    </div>
  )
}
