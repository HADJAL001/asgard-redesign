"use client"

import { useEffect, useRef } from "react"

/**
 * DataTunnel — a 3D perspective "warp tunnel" of streaming code + particles
 * rushing outward from an off-center vanishing point. Designed to sit behind
 * the Neural Input pill.
 */

type Streamer = {
  angle: number // radial direction from the vanishing point
  z: number // depth: 1 (far, at vanishing point) -> 0 (near, at edge)
  speed: number
  text: string
  color: string
}

type Particle = {
  angle: number
  z: number
  speed: number
  size: number
  color: string
}

// Premium neon-cyan + deep violet palette only.
const COLORS = ["#22d3ee", "#a855f7"]
const GLYPHS = "01・アイウエオカ<>/{}[]#$%&ANOMLY∆Ωλ0123456789"
// Real code fragments that drift forward through the tunnel.
const CODE = [
  "const osgard = init()",
  "async init()",
  "sys.connect()",
  "await neural.sync()",
  "export core()",
  "return <Node/>",
  "0xF3A9::mesh",
  "for (n of nodes)",
  "quantum.bind()",
  "render(scene)",
  "state ⇒ next",
  "λ x.compute(x)",
]

function randText(len: number) {
  // ~55% real code fragments, ~45% matrix glyphs for texture.
  if (Math.random() < 0.55) return CODE[Math.floor(Math.random() * CODE.length)]
  let s = ""
  for (let i = 0; i < len; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
  return s
}

export function DataTunnel() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0
    let height = 0
    // Vanishing point shifted slightly right of center (organic curvature).
    let vpX = 0
    let vpY = 0
    let dpr = 1

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      vpX = width * 0.66
      vpY = height * 0.5
    }
    resize()

    const streamers: Streamer[] = Array.from({ length: 46 }, () => ({
      angle: Math.random() * Math.PI * 2,
      z: Math.random(),
      speed: 0.0016 + Math.random() * 0.004,
      text: randText(3 + Math.floor(Math.random() * 6)),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))

    const particles: Particle[] = Array.from({ length: 60 }, () => ({
      angle: Math.random() * Math.PI * 2,
      z: Math.random(),
      speed: 0.003 + Math.random() * 0.007,
      size: 0.6 + Math.random() * 1.8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }))

    // Project a (angle, z) polar coord into screen space. z: 1 far -> 0 near.
    const project = (angle: number, z: number) => {
      // perspective: near the vanishing point radius is tiny, at edges it's large
      const persp = 1 - z // 0 far, 1 near
      const maxR = Math.hypot(width, height) * 0.62
      const r = persp * persp * maxR
      return {
        x: vpX + Math.cos(angle) * r,
        y: vpY + Math.sin(angle) * r * 0.62,
        scale: persp,
      }
    }

    let raf = 0
    const render = () => {
      // motion-blur trail
      ctx.fillStyle = "rgba(10, 5, 18, 0.22)"
      ctx.fillRect(0, 0, width, height)

      // subtle glow at the vanishing point
      const grad = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, width * 0.5)
      grad.addColorStop(0, "rgba(120, 90, 255, 0.14)")
      grad.addColorStop(0.4, "rgba(6, 182, 212, 0.05)")
      grad.addColorStop(1, "rgba(10, 5, 18, 0)")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, width, height)

      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      for (const s of streamers) {
        const { x, y, scale } = project(s.angle, s.z)
        const fontSize = 4 + scale * 13
        // fade in from the far vanishing point, fade out at the near edge
        const edgeFade = s.z < 0.14 ? s.z / 0.14 : 1
        ctx.globalAlpha = Math.min(1, scale * 1.2) * edgeFade * 0.4
        ctx.fillStyle = s.color
        ctx.shadowColor = s.color
        ctx.shadowBlur = scale * 8
        ctx.font = `${fontSize}px "Geist Mono", ui-monospace, monospace`
        ctx.fillText(s.text, x, y)

        s.z -= s.speed
        if (s.z <= 0) {
          s.z = 1
          s.angle = Math.random() * Math.PI * 2
          s.text = randText(3 + Math.floor(Math.random() * 6))
          s.color = COLORS[Math.floor(Math.random() * COLORS.length)]
        }
      }

      ctx.shadowBlur = 0
      for (const p of particles) {
        const { x, y, scale } = project(p.angle, p.z)
        const edgeFade = p.z < 0.14 ? p.z / 0.14 : 1
        ctx.globalAlpha = Math.min(1, scale * 1.3) * edgeFade * 0.35
        ctx.fillStyle = p.color
        ctx.shadowColor = p.color
        ctx.shadowBlur = scale * 6
        ctx.beginPath()
        ctx.arc(x, y, p.size * (0.4 + scale), 0, Math.PI * 2)
        ctx.fill()

        p.z -= p.speed
        if (p.z <= 0) {
          p.z = 1
          p.angle = Math.random() * Math.PI * 2
        }
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0
      raf = requestAnimationFrame(render)
    }

    if (prefersReduced) {
      // Draw a single static frame.
      ctx.fillStyle = "rgba(10, 5, 18, 1)"
      ctx.fillRect(0, 0, width, height)
      for (const s of streamers) {
        const { x, y, scale } = project(s.angle, s.z)
        ctx.globalAlpha = scale
        ctx.fillStyle = s.color
        ctx.font = `${4 + scale * 13}px ui-monospace, monospace`
        ctx.textAlign = "center"
        ctx.fillText(s.text, x, y)
      }
      ctx.globalAlpha = 1
    } else {
      raf = requestAnimationFrame(render)
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" aria-hidden="true" />
}
