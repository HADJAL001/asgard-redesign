"use client"

import { motion, useMotionValue, useSpring } from "framer-motion"
import { useCallback } from "react"

export function BackgroundSpotlight() {
  const x = useSpring(useMotionValue(50), { stiffness: 90, damping: 28 })
  const y = useSpring(useMotionValue(35), { stiffness: 90, damping: 28 })
  const onMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    x.set(((event.clientX - rect.left) / rect.width) * 100)
    y.set(((event.clientY - rect.top) / rect.height) * 100)
  }, [x, y])

  return <motion.div aria-hidden="true" className="orch-spotlight" onMouseMove={onMove} style={{ left: `${x}%`, top: `${y}%` }} />
}
