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

import type { ComponentType } from "react"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"
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
}) {
  const activeIndex = steps.findIndex((s) => s.state === "active")
  const doneCount = steps.filter((s) => s.state === "done").length

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
          style={{ backgroundColor: "rgba(0,212,255,0.12)" }}
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
