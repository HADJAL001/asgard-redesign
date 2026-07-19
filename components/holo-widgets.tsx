"use client"

import { useEffect, useRef } from "react"

/* ------------------------------------------------------------------ */
/*  HoloTelemetry — floating dust particles + a 3D-perspective         */
/*  equalizer bar graph. Used as the Neural Input canvas backdrop.     */
/* ------------------------------------------------------------------ */
export function HoloTelemetry({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let w = 0
    let h = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    // dust particles
    const dust = Array.from({ length: 70 }, () => ({
      x: Math.random(),
      y: Math.random(),
      r: 0.4 + Math.random() * 1.4,
      s: 0.02 + Math.random() * 0.06,
      a: 0.15 + Math.random() * 0.4,
    }))

    // equalizer bars — two receding rows for depth
    const BARS = 34
    const phases = Array.from({ length: BARS }, () => Math.random() * Math.PI * 2)

    let raf = 0
    let running = true
    let last = performance.now()
    let t = 0

    function draw(now: number) {
      if (!running || !ctx) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      t += dt
      ctx.clearRect(0, 0, w, h)

      // floating dust
      for (const d of dust) {
        d.y -= d.s * dt
        if (d.y < 0) {
          d.y = 1
          d.x = Math.random()
        }
        const px = d.x * w
        const py = d.y * h
        const glow = ctx.createRadialGradient(px, py, 0, px, py, d.r * 3)
        glow.addColorStop(0, `rgba(56,189,248,${d.a})`)
        glow.addColorStop(1, "rgba(56,189,248,0)")
        ctx.fillStyle = glow
        ctx.beginPath()
        ctx.arc(px, py, d.r * 3, 0, Math.PI * 2)
        ctx.fill()
      }

      // equalizer rows (back row dimmer + smaller, front row brighter)
      const rows = [
        { y: h * 0.9, scale: 0.55, alpha: 0.28, off: 0.5 },
        { y: h * 0.96, scale: 1, alpha: 0.7, off: 0 },
      ]
      const gap = w / BARS
      for (const row of rows) {
        for (let i = 0; i < BARS; i++) {
          const level = (Math.sin(t * 3 + phases[i] + row.off) * 0.5 + 0.5) * (0.35 + (i % 5) * 0.13)
          const bh = level * h * 0.5 * row.scale
          const bw = gap * 0.42
          const x = i * gap + gap * 0.3
          const grad = ctx.createLinearGradient(0, row.y, 0, row.y - bh)
          grad.addColorStop(0, `rgba(14,165,233,${row.alpha})`)
          grad.addColorStop(1, `rgba(103,232,249,${row.alpha * 0.4})`)
          ctx.fillStyle = grad
          ctx.fillRect(x, row.y - bh, bw, bh)
          // bright cap
          ctx.fillStyle = `rgba(165,243,252,${row.alpha})`
          ctx.fillRect(x, row.y - bh, bw, 1.4)
        }
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const onVis = () => {
      running = document.visibilityState === "visible"
      if (running) {
        last = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}

/* ------------------------------------------------------------------ */
/*  ParticleBrain — a rotating, breathing brain-shaped particle cloud  */
/*  in gold / violet / cyan. Used for the Neural Player Matrix card.   */
/* ------------------------------------------------------------------ */
export function ParticleBrain({ size = 200, className = "" }: { size?: number; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    const cx = size / 2
    const cy = size / 2
    const radius = size * 0.36

    const palette = [
      [245, 200, 92], // warm gold
      [168, 85, 247], // violet
      [56, 189, 248], // cyan
    ]

    // brain-ish point cloud from a deformed fibonacci sphere
    type P = { x: number; y: number; z: number; c: number[] }
    const pts: P[] = []
    const N = 1500
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < N; i++) {
      const y0 = 1 - (i / (N - 1)) * 2
      const rr = Math.sqrt(1 - y0 * y0)
      const th = golden * i
      let x = Math.cos(th) * rr
      let y = y0
      let z = Math.sin(th) * rr
      // central longitudinal fissure — thin the middle band
      if (Math.abs(x) < 0.1 && Math.random() < 0.7) continue
      // gyrus folds
      const fold = 1 + 0.1 * Math.sin(x * 9) * Math.cos(z * 7) + 0.06 * Math.sin(y * 11)
      // brain proportions: wide, slightly flattened, longer front-back
      x *= 1.15 * fold
      y *= 0.82 * fold
      z *= 1.02 * fold
      pts.push({ x, y, z, c: palette[i % palette.length] })
    }

    let raf = 0
    let running = true
    let last = performance.now()
    let angle = 0
    let t = 0

    function rot(p: P, a: number) {
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      return { x: p.x * ca - p.z * sa, y: p.y, z: p.x * sa + p.z * ca }
    }

    function draw(now: number) {
      if (!running || !ctx) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      angle += dt * 0.18
      t += dt
      const breathe = 1 + Math.sin(t * 1.4) * 0.035
      ctx.clearRect(0, 0, size, size)

      // ambient core glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.6)
      glow.addColorStop(0, "rgba(168,85,247,0.16)")
      glow.addColorStop(0.5, "rgba(56,189,248,0.08)")
      glow.addColorStop(1, "rgba(0,0,0,0)")
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, size, size)

      for (const p of pts) {
        const r = rot(p, angle)
        const depth = (r.z + 1.4) / 2.8 // 0..1
        const px = cx + r.x * radius * breathe
        const py = cy - r.y * radius * breathe
        const [cr, cg, cb] = p.c
        const alpha = 0.2 + depth * 0.7
        const dot = 0.5 + depth * 1.3
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha})`
        ctx.beginPath()
        ctx.arc(px, py, dot, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const onVis = () => {
      running = document.visibilityState === "visible"
      if (running) {
        last = performance.now()
        raf = requestAnimationFrame(draw)
      }
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [size])

  return <canvas ref={canvasRef} style={{ width: size, height: size }} className={className} aria-hidden="true" />
}

/* ------------------------------------------------------------------ */
/*  CyberLock — a glowing padlock on a circuit board with pulsing      */
/*  neon traces. Used for the Elite CyberSec Access card.              */
/* ------------------------------------------------------------------ */
export function CyberLock({ className = "" }: { className?: string }) {
  // symmetrical circuit traces radiating from the lock core
  const traces = [
    "M50 60 H22 V40",
    "M50 60 H14 V78",
    "M50 60 H30 V90",
    "M50 60 H78 V40",
    "M50 60 H86 V78",
    "M50 60 H70 V90",
    "M50 60 V26 H32",
    "M50 60 V26 H68",
  ]
  const nodes = [
    [22, 40], [14, 78], [30, 90], [78, 40], [86, 78], [70, 90], [32, 26], [68, 26],
  ]
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="lockBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="100%" stopColor="#64748b" />
        </linearGradient>
        <filter id="lockGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.8" />
        </filter>
      </defs>

      {/* pulsing circuit traces */}
      {traces.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
          style={{ filter: "drop-shadow(0 0 2px #22d3ee)", animation: `lockPulse ${1.8 + (i % 4) * 0.3}s ease-in-out ${i * 0.12}s infinite` }}
        />
      ))}
      {/* trace end nodes */}
      {nodes.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#67e8f9" style={{ filter: "drop-shadow(0 0 3px #22d3ee)", animation: `lockPulse ${2 + (i % 3) * 0.4}s ease-in-out infinite` }} />
      ))}

      {/* padlock shackle */}
      <path d="M40 46 V38 a10 10 0 0 1 20 0 V46" fill="none" stroke="url(#lockBody)" strokeWidth="4" strokeLinecap="round" />
      {/* padlock body */}
      <rect x="34" y="46" width="32" height="26" rx="5" fill="url(#lockBody)" stroke="#0ea5e9" strokeWidth="0.8" />
      {/* keyhole glow */}
      <circle cx="50" cy="57" r="4" fill="#0891b2" style={{ filter: "drop-shadow(0 0 4px #22d3ee)" }} />
      <circle cx="50" cy="57" r="1.8" fill="#a5f3fc" />
      <rect x="49" y="58" width="2" height="7" rx="1" fill="#0891b2" />
    </svg>
  )
}
