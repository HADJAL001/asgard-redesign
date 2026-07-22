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
        className="orch-snake-edge"
        style={{
          ...style,
          stroke: selected ? COLORS.accent : "#00D4FF",
          strokeWidth: selected ? 2.5 : 2,
        }}
      />
    </>
  )
}

const SNAKE_EDGE_CSS = `
.orch-snake-edge {
  stroke-dasharray: 6 5;
  animation: orch-snake-flow 0.7s linear infinite;
}
@keyframes orch-snake-flow {
  to { stroke-dashoffset: -11; }
}
`
