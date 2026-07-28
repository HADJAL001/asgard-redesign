"use client"

/* ================================================================
   OSGARD · DevStatusBar — состояние проекта одной строкой.
   ----------------------------------------------------------------
   Заменяет в студии три конкурирующих блока Мастерской: баннер «что
   делать дальше», ленту из пяти карточек конвейера и полосу
   инженерного вердикта. На скриншоте от основателя они давали больше
   десяти сигналов ДО того, как человек видел свой код, причём
   противоречивых: бейдж «Готово» рядом с «Нужно починить».

   Здесь ровно три вещи, слева направо:
     • пять точек — где мы в конвейере (форма, а не текст);
     • одна фраза — что происходит и что делать;
     • одна кнопка — это самое действие.

   Подробности (какие проверки прошли, что починено, что осталось)
   никуда не делись — они раскрываются по «Подробнее», а не лежат на
   экране постоянно. Премиальность здесь именно в этом: дорого выглядит
   не то, где много всего, а то, где на виду одно главное.
   ================================================================ */

import { type ComponentType } from "react"
import { Loader2, ChevronDown } from "lucide-react"

export type DevStepState = "idle" | "active" | "done" | "error"

export type DevStep = {
  key: string
  label: string
  hint: string
  state: DevStepState
  Icon: ComponentType<{ size?: number; strokeWidth?: number; style?: React.CSSProperties }>
}

const DOT_COLOR: Record<DevStepState, string> = {
  idle: "rgb(226 232 240 / 22%)",
  active: "#7DD3FC",
  done: "#86EFAC",
  error: "#FBBF24",
}

export function DevStatusBar({
  steps,
  headline,
  tone,
  actionLabel,
  onAction,
  detailsOpen,
  onToggleDetails,
  hasDetails,
}: {
  steps: DevStep[]
  /** Одна фраза о текущем положении дел — уже разрешённое противоречие. */
  headline: string
  /** Словарь тот же, что у nextAction в Мастерской: "action" = есть что нажать. */
  tone: "action" | "progress" | "done" | "error"
  actionLabel?: string
  onAction?: () => void
  detailsOpen: boolean
  onToggleDetails: () => void
  hasDetails: boolean
}) {
  const toneColor =
    tone === "error" ? "#FBBF24" : tone === "done" ? "#86EFAC" : tone === "progress" ? "#7DD3FC" : "#E2E8F0"

  return (
    <div className="dev-statusbar">
      {/* ── Пять точек: положение в конвейере читается формой, без чтения ── */}
      <ol className="dev-statusbar__track" aria-label="Ход сборки приложения">
        {steps.map((s, i) => (
          <li key={s.key} className="dev-statusbar__node">
            <span
              className={`dev-statusbar__dot${s.state === "active" ? " dev-statusbar__dot--active" : ""}`}
              style={{ background: DOT_COLOR[s.state] }}
              /* Подпись стадии остаётся доступной: на глаз — точка,
                 для скринридера и наведения — полноценный текст. */
              title={`${s.label}${s.hint ? ` — ${s.hint}` : ""}`}
              aria-label={`${s.label}: ${s.hint || s.state}`}
            />
            {i < steps.length - 1 ? <span aria-hidden="true" className="dev-statusbar__link" /> : null}
          </li>
        ))}
      </ol>

      <p className="dev-statusbar__headline" style={{ color: toneColor }}>
        {tone === "progress" ? (
          <Loader2 size={14} className="animate-spin" style={{ flexShrink: 0 }} aria-hidden="true" />
        ) : null}
        {headline}
      </p>

      <div className="dev-statusbar__actions">
        {hasDetails ? (
          <button
            type="button"
            onClick={onToggleDetails}
            aria-expanded={detailsOpen}
            className="dev-btn dev-btn--ghost"
            style={{ padding: "8px 12px" }}
          >
            Подробнее
            <ChevronDown
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
              style={{ transform: detailsOpen ? "rotate(180deg)" : undefined, transition: "transform .2s ease" }}
            />
          </button>
        ) : null}

        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="dev-btn dev-btn--gold">
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  )
}
