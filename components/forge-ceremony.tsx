"use client"

/* ================================================================
   ForgeCeremony — премиальный экран ожидания генерации проекта.
   ----------------------------------------------------------------
   Показывается вместо плоского баннера, пока currentProject.status
   === "generating". Данные берёт из уже подключённого потока
   useProjectGenerationStream (передаётся пропом, сам поток не
   поднимает). Визуально — «кузница»: дышащий ореол + сигил с
   иконкой текущей стадии + падающие искры (переиспользуем готовые
   классы .forge-materialize/.forge-halo/.forge-mote из globals.css,
   у них уже есть полный prefers-reduced-motion оверрайд).
   ================================================================ */

import {
  Sparkles,
  Palette,
  Boxes,
  Wand2,
  ShieldCheck,
  Hammer,
  Wrench,
  FileCode2,
  CheckCircle2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { COLORS } from "@/lib/economy"
import type { GenerationStage, GenerationStageEvent } from "@/hooks/useProjectGenerationStream"

type StreamState = {
  stages: GenerationStageEvent[]
  latest: GenerationStageEvent | null
  progress: number
  done: boolean
}

const STAGE_ICON: Record<GenerationStage, LucideIcon> = {
  analyzing: Sparkles,
  designing: Palette,
  template: Boxes,
  ai: Wand2,
  validating: ShieldCheck,
  building: Hammer,
  repairing: Wrench,
  writing: FileCode2,
  ready: CheckCircle2,
  failed: ShieldAlert,
}

export function ForgeCeremony({ stream }: { stream: StreamState }) {
  const { t } = useTranslation()

  const stage = stream.latest?.stage
  const CoreIcon = (stage && STAGE_ICON[stage]) || Sparkles
  const label = stage ? t(`ceremony.${stage}`) : t("ceremony.starting")
  const defects = stream.latest?.defects ?? 0
  const showDefects = (stage === "building" || stage === "repairing") && defects > 0

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 rounded-xl px-4 py-6"
      style={{ backgroundColor: "rgba(0,212,255,0.06)", border: `1px solid ${COLORS.accent}` }}
    >
      <div className="forge-materialize relative flex flex-col items-center">
        <span
          className="forge-halo"
          aria-hidden="true"
          style={{ background: `radial-gradient(circle, ${COLORS.accent}59 0%, transparent 68%)` }}
        />
        <span
          className="relative flex size-16 items-center justify-center rounded-2xl"
          style={{
            border: `1px solid ${COLORS.accent}`,
            background: `radial-gradient(circle at 40% 30%, ${COLORS.accent}26, rgba(6,7,12,0.85) 70%)`,
            boxShadow: `0 0 24px 3px ${COLORS.accent}59, inset 0 0 18px ${COLORS.accent}26`,
          }}
        >
          <CoreIcon size={28} strokeWidth={1.5} style={{ color: COLORS.accent }} aria-hidden="true" />
        </span>
        {Array.from({ length: 8 }).map((_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="forge-mote pointer-events-none absolute rounded-full"
            style={
              {
                width: i % 3 === 0 ? 3 : 2,
                height: i % 3 === 0 ? 3 : 2,
                top: 0,
                left: `${10 + i * 10}%`,
                background: COLORS.accent,
                boxShadow: `0 0 6px ${COLORS.accent}`,
                animationDelay: `${(i % 5) * 0.34}s`,
                "--mote-dx": `${(i % 2 === 0 ? 1 : -1) * (6 + (i % 4) * 5)}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <p className="mt-4 text-center text-[13px]" style={{ color: COLORS.text }}>
        {label}
      </p>

      {showDefects && (
        <p className="mt-1 text-center text-[12px]" style={{ color: COLORS.amber }}>
          {t("ceremony.defectsFound", { count: defects })}
        </p>
      )}

      <div
        className="mx-auto mt-3 h-1.5 w-full max-w-sm overflow-hidden rounded-full"
        style={{ backgroundColor: "rgba(0,212,255,0.12)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.round((stream.progress || 0.05) * 100)}%`,
            backgroundColor: COLORS.accent,
          }}
        />
      </div>

      {stream.stages.length > 0 && (
        <ul className="mx-auto mt-4 max-w-sm space-y-1.5">
          {stream.stages.map((s) => {
            const isCurrent = stream.latest?.stage === s.stage && !stream.done
            const Icon = STAGE_ICON[s.stage] ?? Sparkles
            return (
              <li key={s.stage} className="flex items-center gap-2 text-[12px]" style={{ color: COLORS.label }}>
                {isCurrent ? (
                  <Icon size={13} className="animate-pulse" style={{ color: COLORS.accent, flexShrink: 0 }} />
                ) : (
                  <CheckCircle2 size={13} style={{ color: COLORS.green, flexShrink: 0 }} />
                )}
                <span>
                  {t(`ceremony.${s.stage}`)}
                  {typeof s.fileCount === "number" ? ` · ${s.fileCount}` : ""}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
