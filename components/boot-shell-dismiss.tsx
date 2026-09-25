"use client"

import { useEffect, useState } from "react"

export function BootShellDismiss() {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const fadeTimer = window.setTimeout(() => setVisible(false), 220)
    return () => window.clearTimeout(fadeTimer)
  }, [])

  if (!visible) return null

  return (
    <div id="osgard-boot-shell" className="osgard-boot-shell is-ready" aria-hidden="true">
      <div className="osgard-boot-shell__core">
        <span className="osgard-boot-shell__ring" />
        <span className="osgard-boot-shell__label">OSGARD / INITIALIZING COMMAND DECK</span>
      </div>
    </div>
  )
}
