"use client"

/* ================================================================
   GenerationStory — рождение приложения человеческим языком.

   Прямая претензия основателя к экрану мастерской: «пусть будет видно
   только как генерируется проект, потому что обычный человек это не
   поймёт эту панель». На экране одновременно жили список файлов, Monaco
   с исходником `app/page.tsx`, счётчик токенов и перечень инженерных
   проверок — то есть четыре инструмента разработчика и ни одного ответа
   на вопрос «что сейчас происходит с моим приложением».

   Здесь ровно один ответ. Крупная фраза о текущем шаге, вертикальная
   лента из пяти шагов и полоса прогресса. Ни токенов, ни имён файлов, ни
   слова «компилятор»: всё это осталось в мастерской, но за кнопкой
   «Показать код» и за «Подробнее».

   Состояния берутся из тех же `steps`, что и конвейер мастерской, то
   есть из РЕАЛЬНЫХ сигналов (SSE-стадии генерации, вердикт контура,
   состояние WebContainer, deployStatus). Собственных догадок о прогрессе
   компонент не делает — иначе он показывал бы бодрую картинку поверх
   упавшей сборки.
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import type { ComponentType } from "react"
import { CheckCircle2, Loader2, Timer, XCircle } from "lucide-react"
import { COLORS } from "@/lib/economy"

export type StoryStepState = "idle" | "active" | "done" | "error"

export type StoryStep = {
  key: string
  label: string
  hint: string
  state: StoryStepState
  Icon: ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
}

export function GenerationStory({
  steps,
  headline,
  progress,
  projectName,
  failed,
  actionLabel,
  onAction,
  codePreview,
  startedAt,
}: {
  steps: StoryStep[]
  /** Одна фраза о том, что происходит прямо сейчас. */
  headline: string
  /** 0…1 из живого потока генерации. `null` — генерация не идёт, полосы нет. */
  progress: number | null
  projectName: string
  failed?: boolean
  actionLabel?: string
  onAction?: () => void
  codePreview?: { path: string; content: string } | null
  startedAt?: number | null
}) {
  const activeIndex = steps.findIndex((s) => s.state === "active")
  const doneCount = steps.filter((s) => s.state === "done").length
  const lastSoundIndex = useRef(-1)
  const [typedCode, setTypedCode] = useState("")
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startedAt || failed || progress === null || progress <= 0 || progress >= 1) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [failed, progress, startedAt])

  const etaMs = startedAt && progress && progress > 0 && progress < 1
    ? Math.max(0, Math.round((now - startedAt) * ((1 - progress) / progress)))
    : null
  const etaSeconds = etaMs === null ? null : Math.max(1, Math.round(etaMs / 1000))
  const etaText = etaSeconds === null ? null : etaSeconds < 60 ? `~${etaSeconds} sec left` : `~${Math.ceil(etaSeconds / 60)} min left`

  useEffect(() => {
    const target = codePreview?.content ?? ""
    if (!target) {
      const clearTimer = window.setTimeout(() => setTypedCode(""), 0)
      return () => window.clearTimeout(clearTimer)
    }
    let offset = 0
    const timer = window.setInterval(() => {
      offset = Math.min(target.length, offset + 24)
      setTypedCode(target.slice(0, offset))
      if (offset >= target.length) window.clearInterval(timer)
    }, 22)
    return () => window.clearInterval(timer)
  }, [codePreview?.content])

  useEffect(() => {
    if (activeIndex < 0 || activeIndex === lastSoundIndex.current || typeof window === "undefined") return
    lastSoundIndex.current = activeIndex
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioContextCtor) return
    const context = new AudioContextCtor()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = "sine"
    oscillator.frequency.value = 440 + activeIndex * 55
    gain.gain.setValueAtTime(0.0001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.13)
    oscillator.addEventListener("ended", () => void context.close(), { once: true })
  }, [activeIndex])

  return (
    <div className="eg-surface flex flex-col items-center gap-6 rounded-2xl px-6 py-10 text-center md:py-14">
      <div className="flex flex-col items-center gap-3">
        <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>
          {projectName}
        </p>
        <div className="flex items-center gap-3">
          {failed ? (
            <XCircle size={22} style={{ color: COLORS.red, flexShrink: 0 }} />
          ) : activeIndex >= 0 ? (
            <Loader2 size={22} className="animate-spin" style={{ color: COLORS.accent, flexShrink: 0 }} />
          ) : (
            <CheckCircle2 size={22} style={{ color: COLORS.green, flexShrink: 0 }} />
          )}
          <h2 className="max-w-[560px] text-[19px] font-medium md:text-[22px]">{headline}</h2>
        </div>
      </div>

      {/* Полоса прогресса — только пока генерация реально идёт.
          Полоса «на всякий случай» после её окончания создавала бы
          впечатление незакончённой работы там, где всё готово. */}
      {progress !== null && (
        <div
          className="h-1.5 w-full max-w-[320px] overflow-hidden rounded-full"
          style={{ backgroundColor: "rgba(215, 174, 87,0.12)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{
              width: `${Math.round(Math.min(1, Math.max(0.04, progress)) * 100)}%`,
              backgroundColor: failed ? COLORS.red : COLORS.accent,
            }}
          />
        </div>
      )}

      {etaText && !failed && (
        <p className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: COLORS.label }} role="status" aria-live="polite">
          <Timer size={13} aria-hidden="true" />
          {etaText} · approximate
        </p>
      )}

      {codePreview && typedCode && (
        <div className="w-full max-w-[560px] overflow-hidden rounded-lg border text-left" style={{ borderColor: "rgba(125,211,252,.22)", background: "rgba(2,6,23,.7)" }}>
          <p className="border-b px-3 py-2 font-mono text-[11px]" style={{ borderColor: "rgba(125,211,252,.14)", color: "#7DD3FC" }}>{codePreview.path}</p>
          <pre className="max-h-36 overflow-hidden p-3 text-[11px] leading-relaxed" style={{ color: "#d7e8f5" }}>{typedCode}<span style={{ color: COLORS.accent }}>|</span></pre>
        </div>
      )}

      {/* Лента шагов. Вертикально и крупно, а не пятью карточками в ряд:
          человек читает её как рассказ сверху вниз, а не как приборную
          панель. Подпись показываем только у текущего шага — у остальных
          она либо ещё ничего не значит, либо уже неинтересна. */}
      <ol className="flex w-full max-w-[420px] flex-col gap-px text-left">
        {steps.map((step, i) => {
          const isActive = step.state === "active"
          const color =
            step.state === "error"
              ? COLORS.red
              : step.state === "done"
                ? COLORS.green
                : isActive
                  ? COLORS.accent
                  : COLORS.label
          return (
            <li key={step.key} className="flex items-start gap-3 px-1 py-2.5">
              <span className="flex flex-col items-center" style={{ flexShrink: 0 }}>
                {isActive ? (
                  <Loader2 size={16} className="animate-spin" style={{ color }} />
                ) : step.state === "done" ? (
                  <CheckCircle2 size={16} style={{ color }} />
                ) : step.state === "error" ? (
                  <XCircle size={16} style={{ color }} />
                ) : (
                  <step.Icon size={16} strokeWidth={1.6} style={{ color, opacity: 0.55 }} />
                )}
                {i < steps.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="mt-1 w-px flex-1"
                    style={{ minHeight: 14, backgroundColor: COLORS.border }}
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className="block text-[13.5px]"
                  style={{
                    color: step.state === "idle" ? COLORS.label : COLORS.text,
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {step.label}
                </span>
                {isActive && step.hint && (
                  <span className="mt-0.5 block text-[12px]" style={{ color: COLORS.label }}>
                    {step.hint}
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      <p className="text-[11.5px]" style={{ color: COLORS.label }}>
        {doneCount} / {steps.length}
      </p>

      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="btn-premium-gold rounded-lg px-5 py-2.5 text-[13px] font-medium"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
