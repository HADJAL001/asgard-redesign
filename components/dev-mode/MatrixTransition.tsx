"use client"

/* ================================================================
   OSGARD · MatrixTransition — киношная «перезагрузка системы»
   при переключении между мирами (world ⇄ dev).
   ----------------------------------------------------------------
   Четыре фазы, ~1.5 c:
     1. Распад   — сетка светящихся точек разлетается с ускорением,
                   реальный экран под ней уходит в blur + затемнение.
     2. Пустота  — короткий провал в чёрное (в этот момент подменяется
                   интерфейс — подмена не видна как скачок).
     3. Сборка   — точки слетаются обратно в строгую сетку.
     4. Растворение — точки гаснут, новый интерфейс проявляется.

   Почему НЕ html2canvas: снимок DOM тянул бы тяжёлую зависимость и всё
   равно врал бы на `backdrop-filter`/`mix-blend-mode`, которых в проекте
   много (ambient-*, стеклянные карточки). Вместо буквального снимка —
   сетка частиц в цветах целевого режима поверх реально размываемого
   экрана. Читается как распад, стоит ноль зависимостей.

   Производительность и доступность:
   • один requestAnimationFrame-цикл, канвас масштабируется под DPR;
   • слой pointer-events:none + aria-hidden (чисто декоративный);
   • при prefers-reduced-motion компонент вообще не рисуется —
     lib/dev-mode.tsx в этом случае меняет режим мгновенно.
   ================================================================ */

import { useEffect, useRef } from "react"
import { TRANSITION_MS, useDevMode, type OsgardMode } from "@/lib/dev-mode"

type Particle = {
  /** Целевая (сеточная) позиция. */
  gridX: number
  gridY: number
  /** Направление разлёта. */
  driftX: number
  driftY: number
  size: number
  hue: string
  /** Индивидуальная задержка — распад идёт волной, а не одним кадром. */
  delay: number
}

/** Палитры под режимы: в мир уходим золотом, в студию — серебром/бирюзой. */
const PALETTE: Record<OsgardMode, string[]> = {
  dev: ["#E2E8F0", "#CBD5E1", "#94A3B8", "#7DD3FC", "#D4AF37"],
  world: ["#D4AF37", "#C9A84C", "#E5E4E2", "#2D7DD2", "#6A5ACD"],
}

/** Шаг сетки в CSS-пикселях. Крупнее = меньше частиц = легче для слабых машин. */
const CELL = 26

function buildParticles(width: number, height: number, mode: OsgardMode): Particle[] {
  const palette = PALETTE[mode]
  const cols = Math.ceil(width / CELL)
  const rows = Math.ceil(height / CELL)
  const cx = width / 2
  const cy = height / 2
  const particles: Particle[] = []

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const gridX = c * CELL
      const gridY = r * CELL
      // Разлёт — радиально от центра: так распад читается как взрыв
      // системы, а не как равномерный сдвиг картинки.
      const dx = gridX - cx
      const dy = gridY - cy
      const dist = Math.hypot(dx, dy) || 1
      particles.push({
        gridX,
        gridY,
        driftX: (dx / dist) * (90 + Math.random() * 150),
        driftY: (dy / dist) * (90 + Math.random() * 150),
        size: 1 + Math.random() * 1.6,
        hue: palette[Math.floor(Math.random() * palette.length)],
        // Волна от центра к краям + небольшой случайный разброс.
        delay: Math.min(0.42, (dist / Math.max(cx, cy)) * 0.3 + Math.random() * 0.12),
      })
    }
  }
  return particles
}

/** easeOutCubic — быстрый старт, мягкое торможение (разлёт). */
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
/** easeInOutCubic — плавный вход и выход (сборка). */
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

export function MatrixTransition() {
  const { transitioning, mode } = useDevMode()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Цель перехода = режим, ПРОТИВОПОЛОЖНЫЙ текущему на момент старта:
  // сам mode переключится только в середине анимации.
  const targetRef = useRef<OsgardMode>("dev")

  // Режим, актуальный на момент СТАРТА перехода. Держим в ref, потому что
  // mode меняется в середине анимации — если бы эффект зависел от него
  // напрямую, он перезапустился бы на полпути: анимация дёрнулась бы с
  // нуля, а палитра перескочила на противоположную.
  const modeAtStart = useRef<OsgardMode>(mode)
  if (!transitioning) modeAtStart.current = mode

  useEffect(() => {
    if (!transitioning) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    targetRef.current = modeAtStart.current === "world" ? "dev" : "world"

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = window.innerWidth
    const height = window.innerHeight
    canvas.width = Math.floor(width * dpr)
    canvas.height = Math.floor(height * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    ctx.scale(dpr, dpr)

    const particles = buildParticles(width, height, targetRef.current)
    const start = performance.now()
    let raf = 0

    const frame = (now: number) => {
      const elapsed = now - start
      const p = Math.min(1, elapsed / TRANSITION_MS)
      ctx.clearRect(0, 0, width, height)

      // Затемнение: нарастает к «слепой» середине и спадает к концу,
      // пряча момент подмены интерфейса.
      const veil = p < 0.5 ? easeOut(p / 0.5) : 1 - easeInOut((p - 0.5) / 0.5)
      ctx.fillStyle = `rgba(4, 4, 7, ${veil * 0.97})`
      ctx.fillRect(0, 0, width, height)

      for (const particle of particles) {
        let offset: number
        let alpha: number

        if (p < 0.5) {
          // Фаза распада: точка уходит от своей ячейки наружу.
          const local = Math.max(0, Math.min(1, (p / 0.5 - particle.delay) / (1 - particle.delay)))
          offset = easeOut(local)
          alpha = 1 - local * 0.35
        } else {
          // Фаза сборки: возвращается из разлёта в строгую сетку.
          const local = Math.max(0, Math.min(1, ((p - 0.5) / 0.5 - particle.delay) / (1 - particle.delay)))
          offset = 1 - easeInOut(local)
          // К самому концу точки гаснут, открывая новый интерфейс.
          alpha = local > 0.75 ? (1 - local) / 0.25 : 1
        }

        if (alpha <= 0.01) continue
        const x = particle.gridX + particle.driftX * offset
        const y = particle.gridY + particle.driftY * offset

        ctx.globalAlpha = Math.max(0, Math.min(1, alpha))
        ctx.fillStyle = particle.hue
        // Свечение делает точки «световыми», а не плоскими квадратами.
        ctx.shadowColor = particle.hue
        ctx.shadowBlur = 6
        ctx.fillRect(x, y, particle.size, particle.size)
      }

      ctx.globalAlpha = 1
      ctx.shadowBlur = 0

      if (p < 1) {
        raf = requestAnimationFrame(frame)
      } else {
        ctx.clearRect(0, 0, width, height)
      }
    }

    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // Намеренно только [transitioning]: смена mode в середине перехода не
    // должна перезапускать анимацию (см. modeAtStart выше).
  }, [transitioning])

  if (!transitioning) return null

  return (
    <canvas
      ref={canvasRef}
      className="matrix-transition-canvas"
      aria-hidden="true"
      data-testid="matrix-transition"
    />
  )
}
