"use client"

import { useRef, useState } from "react"
import { Share2, Loader2 } from "lucide-react"

const CLIP_DURATION_MS = 1800
const CANVAS_SIZE = 540

function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3)
}

function easeOutBack(x: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-zа-яё0-9]+/gi, "-")
      .replace(/(^-|-$)/g, "") || "artifact"
  )
}

type Props = {
  name: string
  rarityLabel: string
  rarityColor: string
  raritySymbol: string
}

/** Короткий (~1.8с) canvas-2D клип реведла ковки для шаринга — не переиспользует
    DOM/CSS-анимацию оверлея (дорого кадр за кадром через html2canvas), рисует
    свой минимальный ролик: свечение редкости → символ → название. */
export function ForgeRevealClipExport({ name, rarityLabel, rarityColor, raritySymbol }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function drawFrame(ctx: CanvasRenderingContext2D, t: number) {
    const size = CANVAS_SIZE
    const p = Math.min(1, t / CLIP_DURATION_MS)
    ctx.clearRect(0, 0, size, size)
    ctx.fillStyle = "#0A0A0F"
    ctx.fillRect(0, 0, size, size)

    const glowP = Math.min(1, p / 0.6)
    const glowR = size * 0.15 + size * 0.28 * easeOutCubic(glowP)
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, glowR)
    grad.addColorStop(0, `${rarityColor}99`)
    grad.addColorStop(1, "transparent")
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, glowR, 0, Math.PI * 2)
    ctx.fill()

    const symP = Math.min(1, Math.max(0, (p - 0.15) / 0.5))
    if (symP > 0) {
      const scale = 0.6 + 0.4 * easeOutBack(symP)
      ctx.save()
      ctx.globalAlpha = symP
      ctx.translate(size / 2, size / 2 - 20)
      ctx.scale(scale, scale)
      ctx.font = `${Math.round(size * 0.22)}px sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"
      ctx.fillStyle = rarityColor
      ctx.shadowColor = rarityColor
      ctx.shadowBlur = 30
      ctx.fillText(raritySymbol, 0, 0)
      ctx.restore()
    }

    const labelP = Math.min(1, Math.max(0, (p - 0.35) / 0.4))
    if (labelP > 0) {
      ctx.save()
      ctx.globalAlpha = labelP
      ctx.font = `600 ${Math.round(size * 0.045)}px sans-serif`
      ctx.textAlign = "center"
      ctx.fillStyle = rarityColor
      ctx.fillText(rarityLabel.toUpperCase(), size / 2, size / 2 + 90)
      ctx.restore()
    }

    const nameP = Math.min(1, Math.max(0, (p - 0.5) / 0.4))
    if (nameP > 0) {
      ctx.save()
      ctx.globalAlpha = nameP
      ctx.font = `${Math.round(size * 0.04)}px sans-serif`
      ctx.textAlign = "center"
      ctx.fillStyle = "#ffffff"
      ctx.fillText(name, size / 2, size / 2 + 128)
      ctx.restore()
    }
  }

  async function shareOrDownload(blob: Blob, filename: string, mime: string) {
    const file = new File([blob], filename, { type: mime })
    const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean }
    if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name })
        return
      } catch {
        // Пользователь отменил шеринг или он не сработал — падаем в скачивание.
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }

  async function handleExport(e: React.MouseEvent) {
    e.stopPropagation()
    if (busy) return
    setBusy(true)
    setError(null)

    const canvas = canvasRef.current
    const ctx2d = canvas?.getContext("2d")
    if (!canvas || !ctx2d) {
      setBusy(false)
      return
    }
    const ctx: CanvasRenderingContext2D = ctx2d

    const canRecord = typeof MediaRecorder !== "undefined" && typeof canvas.captureStream === "function"

    if (!canRecord) {
      drawFrame(ctx, CLIP_DURATION_MS)
      canvas.toBlob(async (blob) => {
        if (blob) await shareOrDownload(blob, `${slugify(name)}.png`, "image/png")
        else setError("Не удалось создать изображение")
        setBusy(false)
      }, "image/png")
      return
    }

    try {
      const stream = canvas.captureStream(30)
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm"
      const recorder = new MediaRecorder(stream, { mimeType })
      const chunks: BlobPart[] = []
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data)
      }
      const stopped = new Promise<void>((resolve) => {
        recorder.onstop = () => resolve()
      })

      recorder.start()
      const start = performance.now()
      await new Promise<void>((resolve) => {
        function tick(now: number) {
          const t = now - start
          drawFrame(ctx, t)
          if (t < CLIP_DURATION_MS) requestAnimationFrame(tick)
          else resolve()
        }
        requestAnimationFrame(tick)
      })
      recorder.stop()
      await stopped

      const blob = new Blob(chunks, { type: mimeType })
      await shareOrDownload(blob, `${slugify(name)}.webm`, mimeType)
    } catch {
      setError("Не удалось создать клип")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        aria-hidden="true"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
      <button
        type="button"
        onClick={handleExport}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors disabled:opacity-50"
        style={{ border: `1px solid ${rarityColor}66`, color: rarityColor, background: `${rarityColor}14` }}
      >
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Share2 size={14} aria-hidden="true" />}
        {busy ? "Готовим клип…" : "Поделиться"}
      </button>
      {error && (
        <p className="text-[11px]" style={{ color: "#F87171" }}>
          {error}
        </p>
      )}
    </div>
  )
}
