"use client"

import { useEffect, useRef } from "react"

export type GlobeHotspot = {
  lat: number
  lon: number
  label?: string
}

type HolographicGlobeProps = {
  size?: number
  className?: string
  speed?: number
  hotspots?: GlobeHotspot[]
  showArcs?: boolean
  showSpikes?: boolean
  dotColor?: string
  landColor?: string
  interactive?: boolean
}

/**
 * Rough continent land mask using bounding regions.
 * lat: -90..90 (south..north), lon: -180..180 (west..east)
 */
function isLand(lat: number, lon: number): boolean {
  // North America
  if (lat > 14 && lat < 72 && lon > -168 && lon < -52) {
    const width = 1 - (lat - 14) / 90
    if (lon > -140 - width * 20 && lon < -55 + width * 10) return true
  }
  // Central America
  if (lat > 7 && lat < 18 && lon > -95 && lon < -77) return true
  // Greenland
  if (lat > 60 && lat < 83 && lon > -55 && lon < -18) return true
  // South America
  if (lat > -55 && lat < 13 && lon > -82 && lon < -34) {
    const taper = (lat + 55) / 68 // wider toward north
    if (lon > -82 + (1 - taper) * 18 && lon < -34 - (1 - taper) * 6) return true
  }
  // Europe
  if (lat > 36 && lat < 71 && lon > -11 && lon < 42) return true
  // Africa
  if (lat > -35 && lat < 37 && lon > -18 && lon < 52) {
    const taper = 1 - Math.max(0, (-lat) / 35) * 0.45
    if (lon < 52 * taper + 8) return true
  }
  // Asia main block
  if (lat > 8 && lat < 76 && lon > 40 && lon < 150) return true
  // India peninsula
  if (lat > 6 && lat < 30 && lon > 68 && lon < 90) return true
  // SE Asia / Indonesia
  if (lat > -10 && lat < 8 && lon > 95 && lon < 141) return true
  // Australia
  if (lat > -39 && lat < -11 && lon > 113 && lon < 154) return true
  return false
}

function latLonToVec(lat: number, lon: number) {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return {
    x: -Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  }
}

export function HolographicGlobe({
  size = 240,
  className = "",
  speed = 0.12,
  hotspots = [],
  showArcs = true,
  showSpikes = true,
  dotColor = "0, 240, 255",
  landColor = "80, 200, 255",
  interactive = false,
}: HolographicGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pointerRef = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })

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
    const radius = size * 0.38

    // Generate fibonacci sphere points, keep land + sparse ocean grid
    const N = 2600
    type Pt = { x: number; y: number; z: number; land: boolean }
    const points: Pt[] = []
    const golden = Math.PI * (3 - Math.sqrt(5))
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2
      const r = Math.sqrt(1 - y * y)
      const t = golden * i
      const x = Math.cos(t) * r
      const z = Math.sin(t) * r
      const lat = Math.asin(y) * (180 / Math.PI)
      const lon = Math.atan2(z, x) * (180 / Math.PI)
      const land = isLand(lat, lon)
      // keep all land, only ~1 in 4 ocean points for a faint grid
      if (land || i % 4 === 0) points.push({ x, y, z, land })
    }

    // Great-circle arcs (data streams)
    const arcDefs = [
      { a: latLonToVec(40, -100), b: latLonToVec(51, 0), color: "255, 190, 90" },
      { a: latLonToVec(35, 139), b: latLonToVec(-33, 151), color: "255, 160, 60" },
      { a: latLonToVec(1, 103), b: latLonToVec(48, 2), color: "255, 210, 120" },
      { a: latLonToVec(-23, -46), b: latLonToVec(28, 77), color: "120, 220, 255" },
    ]

    let raf = 0
    let angle = 0
    let running = true
    let last = performance.now()

    function rotate(p: { x: number; y: number; z: number }, ang: number) {
      const cosA = Math.cos(ang)
      const sinA = Math.sin(ang)
      return {
        x: p.x * cosA - p.z * sinA,
        y: p.y,
        z: p.x * sinA + p.z * cosA,
      }
    }

    function draw(now: number) {
      if (!running || !ctx) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const pointer = pointerRef.current
      const localSpeed = interactive && pointer.active ? speed * 0.25 : speed
      angle += dt * localSpeed

      ctx.clearRect(0, 0, size, size)

      // Outer atmospheric glow
      const glow = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius * 1.5)
      glow.addColorStop(0, `rgba(${dotColor}, 0.10)`)
      glow.addColorStop(1, `rgba(${dotColor}, 0)`)
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(cx, cy, radius * 1.5, 0, Math.PI * 2)
      ctx.fill()

      // Sphere rim
      ctx.strokeStyle = `rgba(${dotColor}, 0.45)`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.stroke()

      // Radial signal spikes
      if (showSpikes) {
        const spikeCount = 26
        for (let i = 0; i < spikeCount; i++) {
          const a = (i / spikeCount) * Math.PI * 2 + angle * 0.3
          const len = radius * (0.08 + (i % 3) * 0.05)
          ctx.strokeStyle = `rgba(${dotColor}, ${i % 4 === 0 ? 0.5 : 0.18})`
          ctx.lineWidth = i % 4 === 0 ? 1 : 0.6
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius)
          ctx.lineTo(cx + Math.cos(a) * (radius + len), cy + Math.sin(a) * (radius + len))
          ctx.stroke()
        }
      }

      // Dots
      for (const p of points) {
        const r = rotate(p, angle)
        if (r.z < 0) continue // back hemisphere
        const px = cx + r.x * radius
        const py = cy - r.y * radius
        const depth = (r.z + 1) / 2 // 0..1
        if (p.land) {
          const alpha = 0.35 + depth * 0.6
          ctx.fillStyle = `rgba(${landColor}, ${alpha})`
          ctx.beginPath()
          ctx.arc(px, py, 0.9 + depth * 0.8, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = `rgba(${dotColor}, ${0.08 + depth * 0.12})`
          ctx.fillRect(px, py, 0.8, 0.8)
        }
      }

      // Data-stream arcs
      if (showArcs) {
        for (const arc of arcDefs) {
          const steps = 40
          ctx.strokeStyle = `rgba(${arc.color}, 0.55)`
          ctx.lineWidth = 1.2
          ctx.beginPath()
          let started = false
          for (let s = 0; s <= steps; s++) {
            const tt = s / steps
            // slerp
            const dot = arc.a.x * arc.b.x + arc.a.y * arc.b.y + arc.a.z * arc.b.z
            const omega = Math.acos(Math.max(-1, Math.min(1, dot)))
            const sinO = Math.sin(omega) || 1
            const k1 = Math.sin((1 - tt) * omega) / sinO
            const k2 = Math.sin(tt * omega) / sinO
            let vx = arc.a.x * k1 + arc.b.x * k2
            let vy = arc.a.y * k1 + arc.b.y * k2
            let vz = arc.a.z * k1 + arc.b.z * k2
            // lift arc above surface
            const lift = 1 + Math.sin(tt * Math.PI) * 0.12
            vx *= lift
            vy *= lift
            vz *= lift
            const r = rotate({ x: vx, y: vy, z: vz }, angle)
            const px = cx + r.x * radius
            const py = cy - r.y * radius
            if (r.z < -0.1) {
              started = false
              continue
            }
            if (!started) {
              ctx.moveTo(px, py)
              started = true
            } else {
              ctx.lineTo(px, py)
            }
          }
          ctx.stroke()
        }
      }

      // Hotspots
      for (const h of hotspots) {
        const r = rotate(latLonToVec(h.lat, h.lon), angle)
        if (r.z < 0) continue
        const px = cx + r.x * radius
        const py = cy - r.y * radius
        const pulse = 0.5 + Math.sin(now / 400 + h.lon) * 0.5
        // glow
        const hg = ctx.createRadialGradient(px, py, 0, px, py, 10 + pulse * 6)
        hg.addColorStop(0, `rgba(239, 68, 68, ${0.6 + pulse * 0.4})`)
        hg.addColorStop(1, "rgba(239, 68, 68, 0)")
        ctx.fillStyle = hg
        ctx.beginPath()
        ctx.arc(px, py, 10 + pulse * 6, 0, Math.PI * 2)
        ctx.fill()
        // core
        ctx.fillStyle = "rgba(255, 120, 120, 1)"
        ctx.beginPath()
        ctx.arc(px, py, 2.2, 0, Math.PI * 2)
        ctx.fill()
        // label with leader line for first labeled hotspot on the front
        if (h.label && r.z > 0.25) {
          ctx.strokeStyle = "rgba(239, 68, 68, 0.7)"
          ctx.lineWidth = 1
          const lx = px + 26
          const ly = py - 20
          ctx.beginPath()
          ctx.moveTo(px, py)
          ctx.lineTo(px + 18, py - 14)
          ctx.lineTo(lx + 4, ly)
          ctx.stroke()
          ctx.fillStyle = "rgba(255, 180, 180, 0.95)"
          ctx.font = "600 9px ui-sans-serif, system-ui, sans-serif"
          ctx.textBaseline = "middle"
          ctx.fillText(h.label, lx + 8, ly)
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
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [size, speed, hotspots, showArcs, showSpikes, dotColor, landColor, interactive])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size }}
      className={className}
      aria-hidden="true"
      onPointerMove={
        interactive
          ? (e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              pointerRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, active: true }
            }
          : undefined
      }
      onPointerLeave={interactive ? () => (pointerRef.current.active = false) : undefined}
    />
  )
}
