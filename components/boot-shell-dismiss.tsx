"use client"

import { useEffect } from "react"

export function BootShellDismiss() {
  useEffect(() => {
    const shell = document.getElementById("osgard-boot-shell")
    if (!shell) return
    shell.classList.add("is-ready")
    window.setTimeout(() => shell.remove(), 220)
  }, [])

  return null
}
