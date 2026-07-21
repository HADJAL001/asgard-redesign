"use client"

/* ================================================================
   GlobalHotkeys — глобальные горячие клавиши OSGARD
   ----------------------------------------------------------------
   Ctrl/Cmd+K — быстрый переход (CommandPalette)
   Ctrl/Cmd+N — создать пост (гостю показывает paywall)
   Ctrl/Cmd+S — сохранить (шлёт событие osgard:hotkey-save для
                открытой в данный момент формы, например композера поста)
   Ctrl/Cmd+/ — справка по горячим клавишам
   ================================================================ */

export const HOTKEY_SAVE_EVENT = "osgard:hotkey-save"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "./auth-store"
import { useReadonlyMode } from "./readonly-mode"
import { CommandPalette } from "@/components/CommandPalette"
import { HotkeysHelpModal } from "@/components/HotkeysHelpModal"

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable
}

export function GlobalHotkeys() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const { triggerPaywall } = useReadonlyMode()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const key = e.key.toLowerCase()

      if (key === "k") {
        e.preventDefault()
        if (isTypingTarget(e.target)) (e.target as HTMLElement).blur()
        setPaletteOpen(true)
        return
      }

      if (key === "n") {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        if (isAuthenticated) {
          router.push("/community?new=1")
        } else {
          triggerPaywall("Создать пост")
        }
        return
      }

      if (key === "s") {
        e.preventDefault()
        window.dispatchEvent(new CustomEvent(HOTKEY_SAVE_EVENT))
        return
      }

      if (key === "/") {
        if (isTypingTarget(e.target)) return
        e.preventDefault()
        setHelpOpen(true)
      }
    }

    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isAuthenticated, router, triggerPaywall])

  return (
    <>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <HotkeysHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </>
  )
}
