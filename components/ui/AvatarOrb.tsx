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
  const bodyId = `orbBody-${uid}`
  const coreH = size * 1.34

  return (
    <div
      className={`avatar-orb avatar-orb--${variant} ${className}`}
      style={{ width: size, height: coreH, ["--orb-glow-color" as string]: colors.ring }}
      aria-hidden="true"
    >
      <div
        className="avatar-orb-glow"
        style={{ background: `radial-gradient(circle, ${colors.ring}30 0%, transparent 72%)` }}
      />
      <svg viewBox="0 0 100 134" style={{ width: "100%", height: "100%" }}>
        <defs>
          <radialGradient id={coreId} cx="36%" cy="28%" r="72%">
            <stop offset="0%" stopColor={colors.core} />
            <stop offset="50%" stopColor={colors.ring} />
            <stop offset="100%" stopColor={colors.edge} />
          </radialGradient>
          <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={colors.ring} stopOpacity="0.85" />
            <stop offset="50%" stopColor={colors.ring} stopOpacity="0.12" />
            <stop offset="100%" stopColor={colors.ring} stopOpacity="0.85" />
          </linearGradient>
          <linearGradient id={bodyId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2C303C" />
            <stop offset="55%" stopColor="#181B24" />
            <stop offset="100%" stopColor="#0A0B10" />
          </linearGradient>
        </defs>

        {/* корпус / плечи — премиальный тёмный металл с тонким рант-контуром цвета скина */}
        <path
          d="M28 82 Q50 74 72 82 L80 128 Q50 136 20 128 Z"
          fill={`url(#${bodyId})`}
          stroke={colors.ring}
          strokeOpacity="0.3"
          strokeWidth="1"
        />
        <path d="M34 90 Q50 85 66 90" stroke={colors.ring} strokeOpacity="0.35" strokeWidth="1" fill="none" />
        <circle cx="50" cy="104" r="4.5" fill={colors.edge} opacity="0.5" />
        <circle cx="50" cy="104" r="2.2" fill={colors.ring} className="avatar-orb-chest" />

        {/* внешнее орбитальное кольцо — намёк на "закрытую собственную сеть" */}
        <circle
          cx="50"
          cy="38"
          r="33"
          fill="none"
          stroke={`url(#${ringId})`}
          strokeWidth="1.2"
          strokeDasharray="5 4.5"
          className="avatar-orb-ring"
        />

        {/* голова / ядро */}
        <circle cx="50" cy="38" r="23" fill={`url(#${coreId})`} className="avatar-orb-core" />

        {/* грани-фасеты — намёк на кристалл/icosahedron */}
        <g stroke={colors.edge} strokeOpacity="0.45" strokeWidth="0.5" fill="none">
          <path d="M50 17 L67.5 30.5 L61 52.5 L39 52.5 L32.5 30.5 Z" />
          <path d="M50 17 L50 38 M67.5 30.5 L50 38 M61 52.5 L50 38 M39 52.5 L50 38 M32.5 30.5 L50 38" />
        </g>

        {/* блик */}
        <ellipse cx="41.5" cy="27" rx="7" ry="4.6" fill="#ffffff" opacity="0.5" />
      </svg>
    </div>
  )
}

export default AvatarOrb
