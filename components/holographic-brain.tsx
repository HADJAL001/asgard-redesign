"use client"

import { useEffect, useId, useRef, useState } from "react"

type Props = {
  size?: number
  className?: string
}

/**
 * Top-down holographic brain: two hemispheres traced with gyri curves,
 * a central sulcus, and synapses that fire along the pathways.
 * Rendered as an animated SVG so it stays crisp at any size.
 */
export function HolographicBrain({ size = 56, className }: Props) {
  // `mounted` stays false during SSR and the first client render so the
  // hydrated markup is byte-identical to the server; animation starts after.
  const [mounted, setMounted] = useState(false)
  const [t, setT] = useState(0)
  const raf = useRef<number | undefined>(undefined)

  // Unique ids so multiple brain instances on one page don't collide on
  // their gradient/filter defs (duplicate SVG ids break url(#...) refs).
  const uid = useId().replace(/[:]/g, "")
  const coreId = `brainCore-${uid}`
  const strokeId = `brainStroke-${uid}`
  const blurId = `brainBlur-${uid}`

  useEffect(() => {
    setMounted(true)
    let start: number | null = null
    const loop = (now: number) => {
      if (start === null) start = now
      setT((now - start) / 1000)
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [])

  // Synapse nodes distributed across the two hemispheres
  const synapses = [
    { x: 38, y: 34, h: 0 },
    { x: 32, y: 50, h: 0 },
    { x: 40, y: 66, h: 0 },
    { x: 46, y: 44, h: 0 },
    { x: 44, y: 58, h: 0 },
    { x: 62, y: 34, h: 1 },
    { x: 68, y: 50, h: 1 },
    { x: 60, y: 66, h: 1 },
    { x: 54, y: 44, h: 1 },
    { x: 56, y: 58, h: 1 },
  ]

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Holographic neural brain interface"
    >
      <defs>
        <radialGradient id={coreId} cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#0891b2" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#06121a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={strokeId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
        <filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.9" />
        </filter>
      </defs>

      {/* Ambient glow */}
      <ellipse cx="50" cy="49" rx="34" ry="38" fill={`url(#${coreId})`} />

      {/* Brain outer silhouette (two bulging hemispheres) */}
      <path
        d="M50 16
           C40 12, 28 16, 24 28
           C16 32, 15 44, 20 52
           C16 62, 22 74, 34 78
           C40 86, 50 86, 50 80
           Z"
        stroke={`url(#${strokeId})`}
        strokeWidth="1.6"
        opacity="0.85"
        filter={`url(#${blurId})`}
      />
      <path
        d="M50 16
           C60 12, 72 16, 76 28
           C84 32, 85 44, 80 52
           C84 62, 78 74, 66 78
           C60 86, 50 86, 50 80
           Z"
        stroke={`url(#${strokeId})`}
        strokeWidth="1.6"
        opacity="0.85"
        filter={`url(#${blurId})`}
      />

      {/* Central sulcus */}
      <line x1="50" y1="18" x2="50" y2="80" stroke="#67e8f9" strokeWidth="1" opacity="0.55" />

      {/* Gyri (folds) — left hemisphere */}
      <g stroke="#22d3ee" strokeWidth="0.8" fill="none" opacity="0.5">
        <path d="M44 26 Q34 30, 36 38 Q30 42, 34 50" />
        <path d="M42 40 Q32 44, 36 52 Q30 58, 36 66" />
        <path d="M46 56 Q36 60, 40 70" />
      </g>
      {/* Gyri (folds) — right hemisphere */}
      <g stroke="#a855f7" strokeWidth="0.8" fill="none" opacity="0.5">
        <path d="M56 26 Q66 30, 64 38 Q70 42, 66 50" />
        <path d="M58 40 Q68 44, 64 52 Q70 58, 64 66" />
        <path d="M54 56 Q64 60, 60 70" />
      </g>

      {/* Firing synapses (static until mounted to avoid hydration mismatch) */}
      {synapses.map((s, i) => {
        const phase = mounted ? (Math.sin(t * 2.4 + i * 1.1) + 1) / 2 : 0.5 // 0..1
        const r = Math.round((1.1 + phase * 1.6) * 100) / 100
        const op = Math.round((0.35 + phase * 0.6) * 100) / 100
        const color = s.h === 0 ? "#22d3ee" : "#c084fc"
        return (
          <g key={i}>
            <circle cx={s.x} cy={s.y} r={Math.round((r + 1.6) * 100) / 100} fill={color} opacity={Math.round(op * 25) / 100} />
            <circle cx={s.x} cy={s.y} r={r} fill={color} opacity={op} />
          </g>
        )
      })}

      {/* Sweeping scan line (static until mounted) */}
      {(() => {
        const y = mounted ? Math.round((26 + ((t * 26) % 48)) * 100) / 100 : 26
        return (
          <line x1="18" x2="82" y1={y} y2={y} stroke="#67e8f9" strokeWidth="0.6" opacity="0.35" />
        )
      })()}
    </svg>
  )
}
