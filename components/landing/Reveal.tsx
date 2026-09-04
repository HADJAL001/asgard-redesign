"use client"

import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react"

interface RevealProps extends HTMLAttributes<HTMLDivElement> {
  delay?: number
}

/** Scroll-triggered fade+rise wrapper; no-ops instantly under prefers-reduced-motion. */
export function Reveal({ delay = 0, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return
      setVisible(true)
      observer.disconnect()
    }, { rootMargin: "0px 0px -80px" })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { style, className, ...htmlProps } = rest
  const revealStyle: CSSProperties = {
    ...style,
    opacity: visible ? 1 : 0,
    transform: visible ? "translateY(0)" : "translateY(28px)",
    transition: `opacity 600ms cubic-bezier(.2,.8,.2,1) ${delay}s, transform 600ms cubic-bezier(.2,.8,.2,1) ${delay}s`,
  }

  return (
    <div ref={ref} style={revealStyle} className={className} {...htmlProps}>
      {children as ReactNode}
    </div>
  )
}
