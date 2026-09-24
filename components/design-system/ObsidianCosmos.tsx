"use client"

import { useEffect, useRef } from "react"

type Star = { x: number; y: number; depth: number; size: number; twinkle: number }

export function ObsidianCosmos() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointer = useRef({ x: 0.5, y: 0.45 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d", { alpha: true })
    if (!context) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const stars: Star[] = Array.from({ length: 110 }, (_, index) => ({
      x: (index * 73.17 % 100) / 100,
      y: (index * 41.83 % 100) / 100,
      depth: 0.25 + ((index * 17) % 100) / 100,
      size: 0.45 + (index % 4) * 0.25,
      twinkle: (index * 0.73) % (Math.PI * 2),
    }))
    let frame = 0
    let animation = 0
    let width = 0
    let height = 0
    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5)
      width = Math.max(1, rect.width)
      height = Math.max(1, rect.height)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      draw(0)
    }
    const draw = (time: number) => {
      frame += 1
      context.clearRect(0, 0, width, height)
      const px = pointer.current.x - 0.5
      const py = pointer.current.y - 0.5
      const glow = context.createRadialGradient(width * (0.5 + px * 0.22), height * (0.42 + py * 0.18), 0, width * 0.5, height * 0.45, Math.max(width, height) * 0.7)
      glow.addColorStop(0, "rgba(42, 10, 74, .16)")
      glow.addColorStop(.45, "rgba(0, 77, 64, .08)")
      glow.addColorStop(1, "rgba(0, 0, 0, 0)")
      context.fillStyle = glow
      context.fillRect(0, 0, width, height)
      for (const star of stars) {
        const drift = reduced.matches ? 0 : Math.sin(time * 0.00008 + star.twinkle) * 0.003
        const x = star.x * width + px * star.depth * 28 + drift * width
        const y = star.y * height + py * star.depth * 18
        const alpha = 0.2 + star.depth * 0.48 + (reduced.matches ? 0 : Math.sin(time * 0.001 + star.twinkle) * 0.08)
        context.fillStyle = star.depth > 0.72 ? `rgba(212,175,55,${alpha})` : `rgba(229,228,226,${alpha})`
        context.beginPath()
        context.arc(x, y, star.size * star.depth, 0, Math.PI * 2)
        context.fill()
      }
      if (!reduced.matches) animation = window.requestAnimationFrame(draw)
    }
    const move = (event: PointerEvent) => {
      pointer.current = { x: event.clientX / Math.max(window.innerWidth, 1), y: event.clientY / Math.max(window.innerHeight, 1) }
    }
    resize()
    window.addEventListener("resize", resize, { passive: true })
    window.addEventListener("pointermove", move, { passive: true })
    if (!reduced.matches) animation = window.requestAnimationFrame(draw)
    return () => {
      window.cancelAnimationFrame(animation)
      window.removeEventListener("resize", resize)
      window.removeEventListener("pointermove", move)
      if (frame) context.clearRect(0, 0, width, height)
    }
  }, [])

  return <canvas ref={canvasRef} className="ds-obsidian-cosmos" aria-hidden="true" />
}
