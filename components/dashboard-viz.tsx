"use client"

import { useEffect, useRef, useState } from "react"

/* ---------------------------------------------------------------------------
 * NumberMatrix — hyper-dense terminal matrix of flowing process numbers
 * ------------------------------------------------------------------------- */
export function NumberMatrix({ height = 260 }: { height?: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    let width = wrap.clientWidth
    const fontSize = 14
    let columns = Math.floor(width / (fontSize * 0.85))
    let drops: number[] = []
    let speeds: number[] = []

    function setup() {
      width = wrap!.clientWidth
      canvas!.width = width * dpr
      canvas!.height = height * dpr
      canvas!.style.width = width + "px"
      canvas!.style.height = height + "px"
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      columns = Math.floor(width / (fontSize * 0.85))
      drops = Array.from({ length: columns }, () => Math.random() * -height)
      speeds = Array.from({ length: columns }, () => 0.5 + Math.random() * 1.2)
    }
    setup()

    const ro = new ResizeObserver(setup)
    ro.observe(wrap)

    type Floater = { x: number; y: number; vy: number; text: string; life: number; max: number }
    const floaters: Floater[] = []
    const bigNumbers = ["17,685", "555,411", "101,445", "225,600", "27,881", "775,411", "12,777"]

    function randDigit() {
      return String(Math.floor(Math.random() * 10))
    }

    let raf = 0
    let running = true
    let frame = 0

    function draw() {
      if (!running || !ctx) return
      frame++
      // trailing fade
      ctx.fillStyle = "rgba(4, 6, 12, 0.20)"
      ctx.fillRect(0, 0, width, height)

      ctx.font = `${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
      ctx.textBaseline = "top"
      const pointer = pointerRef.current

      for (let i = 0; i < columns; i++) {
        const x = i * fontSize * 0.85
        const y = drops[i] * fontSize
        const roll = (i * 7 + frame) % 100
        let color = "rgba(34, 197, 94, 0.85)" // green
        if (roll < 12) color = "rgba(239, 68, 68, 0.9)" // red
        else if (roll < 17) color = "rgba(255, 255, 255, 0.95)" // white

        // cursor ripple → cyan boost
        if (pointer.active) {
          const dx = x - pointer.x
          const dy = y - pointer.y
          if (dx * dx + dy * dy < 70 * 70) color = "rgba(0, 240, 255, 0.95)"
        }

        ctx.fillStyle = color
        ctx.fillText(randDigit(), x, y)

        drops[i] += speeds[i]
        if (y > height && Math.random() > 0.975) {
          drops[i] = Math.random() * -20
          speeds[i] = 0.5 + Math.random() * 1.2
        }
      }

      // spawn floating big numbers
      if (frame % 55 === 0) {
        floaters.push({
          x: Math.random() * (width - 120) + 20,
          y: height * (0.6 + Math.random() * 0.3),
          vy: 0.3 + Math.random() * 0.3,
          text: bigNumbers[Math.floor(Math.random() * bigNumbers.length)],
          life: 0,
          max: 120,
        })
      }
      for (let f = floaters.length - 1; f >= 0; f--) {
        const fl = floaters[f]
        fl.life++
        fl.y -= fl.vy
        const t = fl.life / fl.max
        const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8
        ctx.font = `700 22px ui-monospace, SFMono-Regular, Menlo, monospace`
        ctx.fillStyle = `rgba(0, 240, 255, ${Math.max(0, alpha) * 0.9})`
        ctx.shadowColor = "rgba(0, 240, 255, 0.7)"
        ctx.shadowBlur = 12
        ctx.fillText(fl.text, fl.x, fl.y)
        ctx.shadowBlur = 0
        if (fl.life >= fl.max) floaters.splice(f, 1)
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const onVis = () => {
      running = document.visibilityState === "visible"
      if (running) raf = requestAnimationFrame(draw)
    }
    document.addEventListener("visibilitychange", onVis)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [height])

  return (
    <div ref={wrapRef} className="relative w-full overflow-hidden rounded-lg" style={{ height }}>
      <canvas
        ref={canvasRef}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true }
        }}
        onPointerLeave={() => (pointerRef.current.active = false)}
      />
    </div>
  )
}

/* ---------------------------------------------------------------------------
 * IsometricBars — pseudo-3D isometric gold bar chart with hover popover
 * ------------------------------------------------------------------------- */
type BarDatum = { label: string; value: number; growth: string }

export function IsometricBars({ data }: { data: BarDatum[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 560
  const H = 300
  const baseY = 250
  const depth = { x: 16, y: -9 }
  const barW = 34
  const gap = (W - 60 - data.length * barW) / (data.length - 1)
  const maxVal = Math.max(...data.map((d) => d.value))

  return (
    <div className="relative w-full" style={{ height: 300 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block", width: "100%", height: "100%" }}
        role="img"
        aria-label="Project growth 3D bar chart"
      >
        <defs>
          <linearGradient id="barFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbbf24" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="barTop" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fde68a" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <linearGradient id="barSide" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b45309" />
            <stop offset="100%" stopColor="#78350f" />
          </linearGradient>
          <linearGradient id="trend" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <filter id="trendGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Isometric floor grid */}
        <g stroke="rgba(0,240,255,0.10)" strokeWidth="0.6">
          {Array.from({ length: 6 }).map((_, i) => (
            <line key={`h${i}`} x1="30" y1={baseY - i * 40} x2={W - 30} y2={baseY - i * 40} />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} x1={30 + i * 62} y1={baseY} x2={30 + i * 62 + depth.x * 3} y2={baseY + depth.y * 3} />
          ))}
        </g>

        {/* Background glowing trend line */}
        <polyline
          points={data
            .map((d, i) => {
              const x = 40 + i * (barW + gap) + barW / 2
              const y = baseY - (d.value / maxVal) * 150 - 40
              return `${x},${y}`
            })
            .join(" ")}
          fill="none"
          stroke="url(#trend)"
          strokeWidth="2.5"
          filter="url(#trendGlow)"
          opacity="0.9"
        />

        {/* Bars */}
        {data.map((d, i) => {
          const x = 40 + i * (barW + gap)
          const h = (d.value / maxVal) * 150 + 20
          const lift = hover === i ? 12 : 0
          const topY = baseY - h - lift
          const active = hover === i
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "transform 0.2s ease", cursor: "pointer" }}
            >
              {/* right side face */}
              <polygon
                points={`${x + barW},${topY} ${x + barW + depth.x},${topY + depth.y} ${x + barW + depth.x},${baseY - lift + depth.y} ${x + barW},${baseY - lift}`}
                fill="url(#barSide)"
                opacity={active ? 1 : 0.9}
              />
              {/* top face */}
              <polygon
                points={`${x},${topY} ${x + barW},${topY} ${x + barW + depth.x},${topY + depth.y} ${x + depth.x},${topY + depth.y}`}
                fill="url(#barTop)"
              />
              {/* front face */}
              <rect x={x} y={topY} width={barW} height={baseY - lift - topY} fill="url(#barFront)" />
              {/* glossy highlight */}
              <rect x={x + 3} y={topY + 3} width={4} height={baseY - lift - topY - 6} fill="rgba(255,255,255,0.35)" rx={2} />
              {/* label */}
              <text x={x + barW / 2 + depth.x / 2} y={baseY + 18} fill="#94a3b8" fontSize="10" textAnchor="middle" letterSpacing="1">
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Hover popover */}
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 rounded-lg px-3 py-1.5 text-center"
          style={{ background: "rgba(10,12,18,0.9)", border: "1px solid rgba(245,158,11,0.5)", boxShadow: "0 0 20px rgba(245,158,11,0.25)" }}
        >
          <p className="font-display text-sm font-bold text-amber-400">{data[hover].growth}</p>
          <p className="text-[10px] uppercase tracking-widest text-slate-400">{data[hover].label} · {data[hover].value} projects</p>
        </div>
      )}
    </div>
  )
}
