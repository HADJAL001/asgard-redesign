"use client"

/* ================================================================
   ProjectDesignPanel — витрина дизайн-системы сгенерированного проекта
   ----------------------------------------------------------------
   Показывает то, чего у проектов раньше не существовало вовсе: их
   собственную дизайн-систему. До миграции 090 генератор отдавал
   приложению пустой `tailwind.config.ts` (`theme: { extend: {} }`) и
   `globals.css` из трёх строк — палитры, шкалы и ритма просто не было,
   поэтому каждый сгенерированный файл изобретал оформление заново.

   Здесь три честных блока:
   • Палитра — реальные цвета приложения, каждый с ЗАМЕРЕННЫМ контрастом
     (не обещание «доступно», а число, посчитанное по WCAG).
   • Типографика и ритм — шрифты, шкала, шаг сетки, радиусы.
   • Балл интерфейса с разбором — что именно стоило очков, со ссылкой
     на конкретный файл и строку. Балл производен от разбора, поэтому
     цифра и объяснение не могут разойтись (см. backend/src/lib/design-qa.ts).

   Данные: GET /projects/:id/design (только владельцу). Legacy-проекты
   честно отвечают designed:false — им дизайн-система задним числом НЕ
   приписывается.
   ================================================================ */

import { useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, Palette, Type } from "lucide-react"
import { apiClient } from "@/lib/api-client"
import { COLORS } from "@/lib/economy"

type DesignBrief = {
  archetype: string
  mood: string
  scheme: "light" | "dark"
  palette: Record<string, string>
  typography: { display: string; body: string; mono: string; scale: number; base: number }
  spacingBase: number
  radius: { sm: number; md: number; lg: number; pill: number }
  density: string
  voice: string
  layout: string[]
  contrast: { inkOnCanvas: number; mutedOnCanvas: number; primaryInkOnPrimary: number; inkOnSurface: number }
}

type DesignFactor = { key: string; label: string; detail: string; points: number; maxPoints: number }
type DesignIssue = { rule: string; severity: "error" | "warn"; file: string; line?: number; message: string }

type DesignResponse = {
  designed: boolean
  brief: DesignBrief | null
  score: number | null
  report: { factors: DesignFactor[]; issues: DesignIssue[]; analyzedFiles: number } | null
}

/** Человекочитаемые названия архетипов — тот же словарь, что в backend/src/lib/design-system.ts. */
const ARCHETYPE_LABEL: Record<string, string> = {
  arcane: "Тайное знание",
  console: "Приборная панель",
  boutique: "Витрина",
  editorial: "Издание",
  cockpit: "Кабина пилота",
  playful: "Игровой",
  commons: "Сообщество",
  gallery: "Галерея",
  studio: "Студия",
}

/** Подписи токенов палитры — чтобы образец цвета что-то значил, а не был квадратиком. */
const SWATCH_LABEL: Record<string, string> = {
  canvas: "Фон страницы",
  surface: "Поверхность",
  surfaceAlt: "Вторичная поверхность",
  border: "Рамки",
  ink: "Основной текст",
  muted: "Вторичный текст",
  primary: "Главное действие",
  accent: "Акцент",
  success: "Успех",
  warning: "Предупреждение",
  danger: "Ошибка",
}

const SWATCH_ORDER = ["canvas", "surface", "surfaceAlt", "border", "ink", "muted", "primary", "accent", "success", "warning", "danger"]

/** Цвет балла: зелёный — норма, жёлтый — есть над чем работать, красный — плохо. */
function scoreColor(score: number): string {
  if (score >= 85) return "#2ECC71"
  if (score >= 65) return "#F1C40F"
  return "#E74C3C"
}

/** Контраст: 4.5 — норма WCAG AA для обычного текста, 3 — для крупного и UI. */
function contrastVerdict(ratio: number, min: number): { ok: boolean; text: string } {
  return ratio >= min
    ? { ok: true, text: `${ratio}:1 — норма WCAG AA` }
    : { ok: false, text: `${ratio}:1 — ниже нормы ${min}:1` }
}

/** Состояние загрузки одним объектом с привязкой к projectId: так эффект НЕ вызывает
 *  setState синхронно в своём теле (каскадные рендеры, react-hooks/set-state-in-effect),
 *  а поздний ответ по прошлому проекту отбрасывается по несовпадению forId. */
type PanelState =
  | { status: "loading"; forId: number }
  | { status: "error"; forId: number; message: string }
  | { status: "ready"; forId: number; data: DesignResponse }

export function ProjectDesignPanel({ projectId }: { projectId: number }) {
  const [state, setState] = useState<PanelState>({ status: "loading", forId: projectId })

  useEffect(() => {
    let cancelled = false

    apiClient
      .get<DesignResponse>(`/projects/${projectId}/design`)
      .then((res) => {
        if (!cancelled) setState({ status: "ready", forId: projectId, data: res })
      })
      .catch((err: any) => {
        if (!cancelled) {
          setState({ status: "error", forId: projectId, message: err?.message || "Не удалось загрузить дизайн-систему" })
        }
      })

    return () => {
      cancelled = true
    }
  }, [projectId])

  // Проект сменился — показываем загрузку, пока не пришёл ответ по НОВОМУ id.
  const loading = state.status === "loading" || state.forId !== projectId
  const error = state.status === "error" && state.forId === projectId ? state.message : null
  const data = state.status === "ready" && state.forId === projectId ? state.data : null

  if (loading) {
    return (
      <div className="mt-6 flex items-center justify-center gap-3 rounded-2xl px-6 py-16" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <Loader2 size={18} className="animate-spin" style={{ color: COLORS.accent }} />
        <p className="text-[13px]" style={{ color: COLORS.label }}>Загружаю дизайн-систему…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <AlertTriangle size={28} strokeWidth={1.25} style={{ color: "#E74C3C" }} />
        <p className="text-[13px]" style={{ color: COLORS.label }}>{error}</p>
      </div>
    )
  }

  // Legacy-проект: дизайн-системы у него не было, и приписывать её задним числом нечестно.
  if (!data?.designed || !data.brief) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl px-6 py-16 text-center" style={{ backgroundColor: COLORS.card, border: `1px dashed ${COLORS.border}` }}>
        <Palette size={30} strokeWidth={1.25} style={{ color: COLORS.label }} />
        <p className="max-w-[460px] text-[14px]" style={{ color: COLORS.label }}>
          Для этого проекта дизайн-система не записана — он сгенерирован до её появления.
          Запустите доработку, чтобы приложение получило палитру, типографику и ритм.
        </p>
      </div>
    )
  }

  const brief = data.brief
  const report = data.report
  const score = data.score

  return (
    <div className="mt-6 flex flex-col gap-4">
      {/* Характер продукта */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Архетип</p>
            <p className="mt-1.5 text-[18px] font-medium">{ARCHETYPE_LABEL[brief.archetype] ?? brief.archetype}</p>
            <p className="mt-1 text-[13px]" style={{ color: COLORS.label }}>{brief.mood}</p>
          </div>

          {typeof score === "number" && (
            <div className="text-right">
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Балл интерфейса</p>
              <p className="mt-1 text-[28px] font-medium leading-none" style={{ color: scoreColor(score) }}>{score}<span className="text-[15px]" style={{ color: COLORS.label }}>/100</span></p>
            </div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[12px]" style={{ color: COLORS.label }}>
          <span>Схема: {brief.scheme === "dark" ? "тёмная" : "светлая"}</span>
          <span>Плотность: {brief.density}</span>
          <span>Шаг сетки: {brief.spacingBase}px</span>
          <span>Скругление: {brief.radius.md}px</span>
        </div>

        {brief.voice && (
          <p className="mt-3 text-[12px] italic" style={{ color: COLORS.label }}>Тон текстов: {brief.voice}</p>
        )}
      </div>

      {/* Палитра с замеренным контрастом */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <Palette size={15} strokeWidth={1.75} style={{ color: COLORS.accent }} />
          <p className="text-[13px] font-medium">Палитра</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SWATCH_ORDER.filter((key) => brief.palette[key]).map((key) => (
            <div key={key} className="flex items-center gap-2.5">
              <span
                className="h-9 w-9 shrink-0 rounded-lg"
                style={{ backgroundColor: brief.palette[key], border: `1px solid ${COLORS.border}` }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-[12px]">{SWATCH_LABEL[key] ?? key}</p>
                <p className="font-mono text-[11px] uppercase" style={{ color: COLORS.label }}>{brief.palette[key]}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Замер, а не обещание: контраст посчитан по WCAG и показан как есть. */}
        <div className="mt-5 border-t pt-4" style={{ borderColor: COLORS.border }}>
          <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>Контраст (замер WCAG)</p>
          <div className="mt-2.5 flex flex-col gap-1.5">
            {[
              { label: "Основной текст на фоне", ...contrastVerdict(brief.contrast.inkOnCanvas, 4.5) },
              { label: "Текст на поверхности", ...contrastVerdict(brief.contrast.inkOnSurface, 4.5) },
              { label: "Вторичный текст", ...contrastVerdict(brief.contrast.mutedOnCanvas, 3) },
              { label: "Текст на кнопке", ...contrastVerdict(brief.contrast.primaryInkOnPrimary, 4.5) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-[12px]">
                <span style={{ color: COLORS.label }}>{row.label}</span>
                <span className="inline-flex items-center gap-1.5" style={{ color: row.ok ? "#2ECC71" : "#E74C3C" }}>
                  {row.ok ? <CheckCircle2 size={13} strokeWidth={2} /> : <AlertTriangle size={13} strokeWidth={2} />}
                  {row.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Типографика */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
        <div className="flex items-center gap-2">
          <Type size={15} strokeWidth={1.75} style={{ color: COLORS.accent }} />
          <p className="text-[13px] font-medium">Типографика</p>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[
            { label: "Заголовки", value: brief.typography.display },
            { label: "Основной текст", value: brief.typography.body },
            { label: "Моноширинный", value: brief.typography.mono },
          ].map((row) => (
            <div key={row.label}>
              <p className="text-[11px]" style={{ color: COLORS.label }}>{row.label}</p>
              <p className="mt-0.5 text-[14px]">{row.value}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-[12px]" style={{ color: COLORS.label }}>
          Модульная шкала ×{brief.typography.scale} от базового кегля {brief.typography.base}px
        </p>
      </div>

      {/* Разбор балла */}
      {report && report.factors.length > 0 && (
        <div className="rounded-2xl p-5" style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}>
          <p className="text-[13px] font-medium">Из чего сложился балл</p>
          <p className="mt-1 text-[12px]" style={{ color: COLORS.label }}>Проанализировано файлов интерфейса: {report.analyzedFiles}</p>

          <div className="mt-4 flex flex-col gap-3">
            {report.factors.map((f) => (
              <div key={f.key}>
                <div className="flex items-baseline justify-between gap-3 text-[12px]">
                  <span>{f.label}</span>
                  <span style={{ color: COLORS.label }}>{f.points}/{f.maxPoints}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: COLORS.border }}>
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.round((f.points / f.maxPoints) * 100)}%`,
                      backgroundColor: f.points === f.maxPoints ? "#2ECC71" : scoreColor((f.points / f.maxPoints) * 100),
                    }}
                  />
                </div>
                <p className="mt-1 text-[11px]" style={{ color: COLORS.label }}>{f.detail}</p>
              </div>
            ))}
          </div>

          {report.issues.length > 0 && (
            <div className="mt-5 border-t pt-4" style={{ borderColor: COLORS.border }}>
              <p className="text-[11px] uppercase tracking-[0.18em]" style={{ color: COLORS.label }}>
                Замечания ({report.issues.length})
              </p>
              <ul className="mt-2.5 flex flex-col gap-2">
                {report.issues.slice(0, 12).map((issue, i) => (
                  <li key={`${issue.rule}-${issue.file}-${i}`} className="flex items-start gap-2 text-[12px]">
                    <span
                      className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: issue.severity === "error" ? "#E74C3C" : "#F1C40F" }}
                      aria-hidden="true"
                    />
                    <span>
                      <span className="font-mono text-[11px]" style={{ color: COLORS.label }}>
                        {issue.file}
                        {issue.line ? `:${issue.line}` : ""}
                      </span>
                      <span className="ml-1.5">{issue.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {report.issues.length > 12 && (
                <p className="mt-2 text-[11px]" style={{ color: COLORS.label }}>
                  …и ещё {report.issues.length - 12}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
