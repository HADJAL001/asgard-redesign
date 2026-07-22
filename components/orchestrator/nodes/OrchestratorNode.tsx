"use client"

import { memo } from "react"
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react"
import { Loader2, CheckCircle2, XCircle } from "lucide-react"
import { COLORS } from "@/lib/economy"
import { ORCHESTRATOR_PALETTE } from "../node-types"
import type { OrchestratorNodeData, OrchestratorNodeRunStatus } from "@/lib/orchestrator/types"

/** displayNodes в OrchestratorEditor подмешивает статус/выход текущего запуска поверх сохранённых данных узла. */
type OrchestratorNodeRuntimeData = OrchestratorNodeData & {
  status?: OrchestratorNodeRunStatus
  output?: string
}

function statusColor(status?: OrchestratorNodeRunStatus) {
  if (status === "running") return COLORS.accent
  if (status === "done") return COLORS.green
  if (status === "error") return COLORS.red
  return COLORS.border
}

export const OrchestratorNode = memo(function OrchestratorNode({
  data,
  selected,
}: NodeProps<Node<OrchestratorNodeRuntimeData>>) {
  const palette = ORCHESTRATOR_PALETTE.find((p) => p.type === data.type)
  const Icon = palette?.Icon

  return (
    <div
      className="min-w-[180px] rounded-xl px-4 py-3 shadow-lg"
      style={{
        backgroundColor: COLORS.card,
        border: `1.5px solid ${selected ? COLORS.accent : statusColor(data.status)}`,
      }}
    >
      <Handle type="target" position={Position.Left} />

      <div className="flex items-center gap-2">
        {Icon && <Icon size={15} strokeWidth={1.75} style={{ color: palette?.color }} aria-hidden="true" />}
        <span className="text-[13px] font-medium" style={{ color: COLORS.text }}>
          {data.label}
        </span>
        {data.status === "running" && <Loader2 size={13} className="ml-auto animate-spin" style={{ color: COLORS.accent }} />}
        {data.status === "done" && <CheckCircle2 size={13} className="ml-auto" style={{ color: COLORS.green }} />}
        {data.status === "error" && <XCircle size={13} className="ml-auto" style={{ color: COLORS.red }} />}
      </div>

      {data.type === "prompt_template" ? (
        <p className="mt-1 truncate text-[11px]" style={{ color: COLORS.label }}>
          {data.template || "{{input}}"}
        </p>
      ) : (
        <p className="mt-1 truncate text-[11px]" style={{ color: COLORS.label }}>
          t={data.temperature ?? 0.7}
        </p>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  )
})
