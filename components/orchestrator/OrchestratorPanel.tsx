"use client"

import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE, DRAG_DATA_FORMAT } from "./node-types"
import type { OrchestratorNodeType } from "@/lib/orchestrator/types"

export function OrchestratorPanel() {
  const { t } = useTranslation()

  function handleDragStart(event: React.DragEvent, nodeType: OrchestratorNodeType) {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, nodeType)
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <aside
      className="flex w-[220px] shrink-0 flex-col gap-2 rounded-xl p-3"
      style={{ backgroundColor: COLORS.card, border: `1px solid ${COLORS.border}` }}
    >
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: COLORS.label }}>
        {t("orchestrator.paletteTitle")}
      </p>

      {ORCHESTRATOR_PALETTE.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => handleDragStart(e, item.type)}
          className="cursor-grab select-none rounded-lg p-3 transition-colors active:cursor-grabbing"
          style={{ border: `1px solid ${COLORS.border}` }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = item.color)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
        >
          <div className="flex items-center gap-2">
            <item.Icon size={22} strokeWidth={1.75} style={{ color: item.color }} aria-hidden="true" />
            <span className="text-[13px] font-medium" style={{ color: COLORS.text }}>
              {t(item.labelKey)}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-snug" style={{ color: COLORS.label }}>
            {t(item.descriptionKey)}
          </p>
        </div>
      ))}
    </aside>
  )
}
