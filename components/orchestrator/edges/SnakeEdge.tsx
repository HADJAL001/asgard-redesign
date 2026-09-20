"use client"

import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react"
import { COLORS } from "@/lib/economy"

/** Связь между узлами оркестратора, "ползущая" анимированным пунктиром в сторону следующего узла. */
export function SnakeEdge({
  id,
  sourceX,
  sourceY,
  sourcePosition,
  targetX,
  targetY,
  targetPosition,
  style,
  markerEnd,
  selected,
  data,
}: EdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      <style>{SNAKE_EDGE_CSS}</style>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`orch-snake-edge ${data?.active ? "orch-snake-edge-active" : ""}`}
        style={{
          ...style,
          stroke: selected || data?.active ? COLORS.accent : "#35516c",
          strokeWidth: selected || data?.active ? 3.5 : 2.5,
        }}
      />
    </>
  )
}

const SNAKE_EDGE_CSS = `
.orch-snake-edge { filter: drop-shadow(0 0 2px rgba(89,162,228,.32)); }
.orch-snake-edge-active { stroke-dasharray: 5 13; filter: drop-shadow(0 0 5px rgba(230,200,104,.85)); animation: orch-snake-flow .55s linear infinite; }
@keyframes orch-snake-flow {
  to { stroke-dashoffset: -11; }
}
`
