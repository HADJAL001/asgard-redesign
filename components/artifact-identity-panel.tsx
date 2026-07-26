"use client"

/* ================================================================
   ArtifactIdentityPanel — переиспользуемый рендер идентичности/лора
   и «Честности ковки» артефакта (archetype/material/originMyth +
   craftScore/craftBreakdown). Раньше это было видно ТОЛЬКО в момент
   ковки (forge-view.tsx); один и тот же рендер теперь используется:
   - в результате ковки (forge-view.tsx, полный craftBreakdown с
     разбивкой факторов — доступен только сразу после POST /forge),
   - в «Последние созданные» (forge-view.tsx, compact, без сети —
     identity выводится из уже загруженных originMyth/visualTheme),
   - в коллекции (artifacts-view.tsx, полный, через GET /:id/provenance).
   ================================================================ */

import { COLORS } from "@/lib/economy"
import type { ArtifactIdentity, CraftBreakdown } from "@/lib/store/osgard-store"
import { useTranslation } from "@/lib/i18n/use-translation"

export function ArtifactIdentityPanel({
  identity,
  craftScore,
  craftBreakdown,
  compact = false,
  accentColor,
}: {
  identity: ArtifactIdentity
  /** Честность ковки 0..1, когда нет полного разбора по факторам (коллекция/список). */
  craftScore?: number | null
  /** Полный разбор по факторам — доступен только сразу после ковки (POST /forge). */
  craftBreakdown?: CraftBreakdown | null
  /** Компактный режим — одна строка archetype · material для строк списка, без карточки честности. */
  compact?: boolean
  accentColor?: string
}) {
  const { t } = useTranslation()
  const accent = accentColor || identity.palette?.accent || COLORS.accent
  const score = craftBreakdown ? craftBreakdown.craftScore : craftScore

  if (compact) {
    return (
      <span className="inline-flex min-w-0 items-baseline gap-1.5 text-[11px]" title={identity.originMyth}>
        <span className="truncate" style={{ color: accent }}>
          {identity.archetype} · {identity.material}
        </span>
      </span>
    )
  }

  return (
    <div className="w-full">
      <div className="w-full text-center">
        <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: COLORS.label }}>
          {t("forge.identity.title")}
        </p>
        <p className="mt-1.5 text-[13px]" style={{ color: accent }}>
          {identity.archetype} · {identity.material}
        </p>
        <p className="mt-2 text-[13px] italic" style={{ fontFamily: "var(--font-serif)", color: "rgba(255,255,255,0.75)" }}>
          «{identity.originMyth}»
        </p>
      </div>

      {typeof score === "number" && (
        <div className="eg-inset mt-5 w-full rounded-lg px-4 py-4 text-[13px]">
          <p className="text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
            {t("forge.verdict.intro")}
          </p>
          <div className="mt-2.5 flex items-center justify-between">
            <span style={{ color: COLORS.label }}>{t("forge.verdict.title")}</span>
            <span style={{ color: accent }}>{Math.round(score * 100)}%</span>
          </div>

          {craftBreakdown && (
            <div className="mt-3 space-y-2.5">
              {craftBreakdown.factors.map((f) => (
                <div key={f.key}>
                  <div className="flex items-center justify-between text-[12px]">
                    <span style={{ color: "rgba(255,255,255,0.75)" }}>{f.label}</span>
                    <span style={{ color: COLORS.label }}>{f.detail}</span>
                  </div>
                  <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${f.maxPoints > 0 ? Math.min(100, (f.points / f.maxPoints) * 100) : 0}%`,
                        background: "linear-gradient(90deg, #B8862E, #F1C40F, #FFE9A8)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
