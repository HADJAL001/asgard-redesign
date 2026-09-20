"use client"

import { useState } from "react"
import { Boxes, BrainCircuit, PlugZap } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE, DRAG_DATA_FORMAT } from "./node-types"
import type { OrchestratorNodeType } from "@/lib/orchestrator/types"

interface OrchestratorPanelProps {
  /** Клик по карточке — альтернатива перетаскиванию: добавляет узел на канвас напрямую. */
  onSelectNode?: (nodeType: OrchestratorNodeType) => void
}

export function OrchestratorPanel({ onSelectNode }: OrchestratorPanelProps) {
  const { t } = useTranslation()
  const [category, setCategory] = useState<"ai" | "logic" | "integrations">("ai")
  const tabs = [
    { id: "ai" as const, label: "ИИ-модели", Icon: BrainCircuit },
    { id: "logic" as const, label: "Логика", Icon: Boxes },
    { id: "integrations" as const, label: "Интеграции", Icon: PlugZap },
  ]

  function handleDragStart(event: React.DragEvent, nodeType: OrchestratorNodeType) {
    event.dataTransfer.setData(DRAG_DATA_FORMAT, nodeType)
    event.dataTransfer.effectAllowed = "move"
  }

  return (
    <aside className="orch-palette flex w-[238px] shrink-0 flex-col gap-2 rounded-xl p-3">
      <style>{PANEL_CSS}</style>
      <p className="px-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: COLORS.label }}>
        {t("orchestrator.paletteTitle")}
      </p>
      <div className="grid grid-cols-3 gap-1 rounded-lg p-1" style={{ background: "rgba(4,11,24,.72)", border: "1px solid rgba(103,155,214,.16)" }}>
        {tabs.map(({ id, label, Icon }) => <button key={id} type="button" title={label} onClick={() => setCategory(id)} className="flex h-8 items-center justify-center rounded-md" style={{ color: category === id ? "#f5c451" : "#7890aa", background: category === id ? "rgba(230,200,104,.12)" : "transparent" }}><Icon size={15} /></button>)}
      </div>

      {ORCHESTRATOR_PALETTE.filter((item) => item.category === category).map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => handleDragStart(e, item.type)}
          onClick={() => onSelectNode?.(item.type)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault()
              onSelectNode?.(item.type)
            }
          }}
          className="orch-palette-item cursor-grab select-none rounded-lg p-3 active:cursor-grabbing"
          style={{ border: `1px solid ${item.color}35`, ["--node-color" as string]: item.color }}
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

const PANEL_CSS = `
.orch-palette { background: linear-gradient(160deg, rgba(14,27,45,.84), rgba(7,12,25,.88)); border: 1px solid rgba(107,157,211,.25); box-shadow: inset 0 1px rgba(255,255,255,.06), 0 18px 45px rgba(0,0,0,.2); }
.orch-palette-item { background: linear-gradient(135deg, rgba(255,255,255,.055), rgba(72,115,159,.025)); transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
.orch-palette-item:hover { transform: translateY(-2px) rotate(-1deg) scale(1.015); border-color: var(--node-color) !important; box-shadow: 0 0 18px color-mix(in srgb, var(--node-color) 28%, transparent); }
@media (prefers-reduced-motion: reduce) { .orch-palette-item { transition: none; } .orch-palette-item:hover { transform: none; } }
`
