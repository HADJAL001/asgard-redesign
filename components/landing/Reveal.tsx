"use client"

import { type CSSProperties, type HTMLAttributes, type ReactNode } from "react"

interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  delay?: number
}

/**
 * A semantic layout wrapper for landing sections.
 *
 * Important content must never depend on an IntersectionObserver to become
 * visible. Browser automation, reduced-JS sessions, and observer failures
 * would otherwise leave whole sections blank.
 */
export function Reveal({ delay = 0, children, ...rest }: RevealProps) {
  const { style, className, ...htmlProps } = rest
  const revealStyle: CSSProperties = {
    ...style,
    // Keep the API compatible with existing call sites while making content
    // visible in every rendering mode. Decorative motion belongs on local UI
    // controls, never behind the availability of a viewport observer.
    opacity: 1,
    transform: "translateY(0)",
    transitionDelay: delay ? `${delay}s` : undefined,
  }

  return (
    <div style={revealStyle} className={className} {...htmlProps}>
      {children as ReactNode}
    </div>
  )
}
