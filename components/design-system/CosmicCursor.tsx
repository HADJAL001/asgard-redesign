"use client"

import { useEffect, useRef, useState } from "react"

export function CosmicCursor() {
  const [enabled, setEnabled] = useState(false)
  const cursorRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
    const fine = window.matchMedia("(pointer: fine)")
    const update = () => setEnabled(fine.matches && !reduced.matches)
    const move = (event: PointerEvent) => {
      const cursor = cursorRef.current
      if (cursor) cursor.style.transform = `translate3d(${event.clientX}px,${event.clientY}px,0) translate(-50%,-50%)`
    }
    update()
    window.addEventListener("pointermove", move, { passive: true })
    fine.addEventListener?.("change", update)
    reduced.addEventListener?.("change", update)
    return () => { window.removeEventListener("pointermove", move); fine.removeEventListener?.("change", update); reduced.removeEventListener?.("change", update) }
  }, [])
  if (!enabled) return null
  return <span ref={cursorRef} className="ds-cosmic-cursor" aria-hidden="true" />
}
