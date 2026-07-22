"use client"

/* ================================================================
   OSGARD · AvatarOrb — премиум светящийся orb-бейдж
   ----------------------------------------------------------------
   Общая база для FAB ДЖАРВИС (JarvisFloatingWidget) и бродячего
   аватара (RoamingAvatar). Лёгкий CSS/SVG (без WebGL/canvas), чтобы
   быть дешёвым при частом монтировании/перемещении по экрану.
   Переиспользует glow-язык components/holo-widgets.tsx (радиальные
   градиенты + drop-shadow), но без canvas-анимации.
   ================================================================ */

import { useId } from "react"

export type AvatarOrbVariant = "idle" | "speaking" | "listening"

type AvatarOrbProps = {
  size?: number
  variant?: AvatarOrbVariant
  className?: string
}

const VARIANT_COLORS: Record<AvatarOrbVariant, { core: string; edge: string; ring: string }> = {
  idle: { core: "#8FF3FF", edge: "#0A6E93", ring: "#00D4FF" },
  speaking: { core: "#C9F9FF", edge: "#0A6E93", ring: "#38F0FF" },
  listening: { core: "#FFE7B0", edge: "#7A4A00", ring: "#FFC94A" },
}

export function AvatarOrb({ size = 56, variant = "idle", className = "" }: AvatarOrbProps) {
  const uid = useId().replace(/:/g, "")
  const colors = VARIANT_COLORS[variant]
  const coreId = `orbCore-${uid}`
  const ringId = `orbRing-${uid}`

  return (
    <div
      className={`avatar-orb avatar-orb--${variant} ${className}`}
      style={{ width: size, height: size, ["--orb-glow-color" as string]: colors.ring }}
      aria-hidden="true"
    >
      <div
        className="avatar-orb-glow"
        style={{ background: `radial-gradient(circle, ${colors.ring}55 0%, transparent 70%)` }}
      />
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <defs>
          <radialGradient id={coreId} cx="38%" cy="32%" r="70%">
            <stop offset="0%" stopColor={colors.core} />
            <stop offset="55%" stopColor={colors.ring} />
            <stop offset="100%" stopColor={colors.edge} />
          </radialGradient>
          <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.ring} stopOpacity="0.9" />
            <stop offset="50%" stopColor={colors.ring} stopOpacity="0.15" />
            <stop offset="100%" stopColor={colors.ring} stopOpacity="0.9" />
          </linearGradient>
        </defs>

        {/* внешнее орбитальное кольцо — намёк на "закрытую собственную сеть" */}
        <circle
          cx="50"
          cy="50"
          r="44"
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="1.4"
          strokeDasharray="6 5"
          className="avatar-orb-ring"
        />

        {/* ядро */}
        <circle cx="50" cy="50" r="30" fill={`url(#${coreId})`} className="avatar-orb-core" />

        {/* грани-фасеты — намёк на кристалл/icosahedron */}
        <g stroke={colors.edge} strokeOpacity="0.5" strokeWidth="0.6" fill="none">
          <path d="M50 22 L72 40 L64 66 L36 66 L28 40 Z" />
          <path d="M50 22 L50 50 M72 40 L50 50 M64 66 L50 50 M36 66 L50 50 M28 40 L50 50" />
        </g>

        {/* блик */}
        <ellipse cx="40" cy="36" rx="9" ry="6" fill="#ffffff" opacity="0.55" />
      </svg>
    </div>
  )
}

export default AvatarOrb
