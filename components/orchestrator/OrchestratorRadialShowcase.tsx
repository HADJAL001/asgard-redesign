"use client"

/* ================================================================
   OrchestratorRadialShowcase — декоративная схема для пустого
   состояния Оркестратора: центральный хаб-цепочка и узлы-сателлиты
   вокруг, соединённые пунктирными лучами (см. .orch-radial-* в
   globals.css). Подписи сателлитов — реальные типы узлов из
   ORCHESTRATOR_PALETTE, а не абстрактные примеры, чтобы новый
   пользователь сразу видел, из чего строится цепочка.
   ================================================================ */

import { GitBranch } from "lucide-react"
import { useTranslation } from "@/lib/i18n/use-translation"
import { ORCHESTRATOR_PALETTE } from "./node-types"

const SATELLITE_ANGLES = [-90, -18, 54, 126, 198] as const

export function OrchestratorRadialShowcase() {
  const { t } = useTranslation()
  const satellites = ORCHESTRATOR_PALETTE.slice(0, 5)

  return (
    <div className="orch-radial" aria-hidden="true">
      {satellites.map((item, i) => {
        const angle = SATELLITE_ANGLES[i % SATELLITE_ANGLES.length]
        const rad = (angle * Math.PI) / 180
        const radius = 108
        const x = Math.cos(rad) * radius
        const y = Math.sin(rad) * radius
        const Icon = item.Icon
        return (
          <div key={item.type} className="orch-radial-branch" style={{ "--branch-angle": `${angle}deg` } as React.CSSProperties}>
            <span className="orch-radial-line" />
            <span
              className="orch-radial-node"
              style={{ transform: `translate(${x}px, ${y}px)`, animationDelay: `${i * 0.35}s` }}
            >
              <Icon size={16} />
            </span>
            <span
              className="orch-radial-label"
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {t(item.labelKey)}
            </span>
          </div>
        )
      })}
      <span className="orch-radial-hub">
        <GitBranch size={22} strokeWidth={1.5} />
      </span>
    </div>
  )
}
