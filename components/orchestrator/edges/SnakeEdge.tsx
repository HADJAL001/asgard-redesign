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
      <defs>
        <linearGradient id={`orch-edge-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5ed8ff" />
          <stop offset="55%" stopColor="#9be7ff" />
          <stop offset="100%" stopColor="#e6c77e" />
        </linearGradient>
      </defs>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        className={`orch-snake-edge ${data?.active ? "orch-snake-edge-active" : ""}`}
        style={{
          ...style,
          stroke: `url(#orch-edge-${id})`,
          strokeWidth: selected || data?.active ? 3.2 : 2.2,
        }}
      />
    </>
  )
}

const SNAKE_EDGE_CSS = `
.orch-snake-edge { opacity:.72; filter: drop-shadow(0 0 3px rgba(94,216,255,.26)); transition:opacity .2s ease,stroke-width .2s ease; }
.orch-snake-edge-active { opacity:1; stroke-dasharray: 7 12; filter: drop-shadow(0 0 7px rgba(94,216,255,.72)); animation: orch-snake-flow .55s linear infinite; }
@keyframes orch-snake-flow {
  to { stroke-dashoffset: -11; }
}
`
