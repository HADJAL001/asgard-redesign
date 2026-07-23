"use client"

import type { CSSProperties, ReactNode } from "react"
import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion"

interface RevealProps extends HTMLMotionProps<"div"> {
  delay?: number
}

/** Scroll-triggered fade+rise wrapper; no-ops instantly under prefers-reduced-motion. */
export function Reveal({ delay = 0, children, ...rest }: RevealProps) {
  const reduce = useReducedMotion()

  if (reduce) {
    const { style, className } = rest
    return (
      <div style={style as CSSProperties | undefined} className={className}>
        {children as ReactNode}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
