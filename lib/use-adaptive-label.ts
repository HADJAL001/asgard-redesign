"use client"

import { useEffect, useState } from "react"

/**
 * Текстовая подпись рядом с иконкой видна первые maxUses показов навигации,
 * затем гаснет — иконка остаётся, но подпись больше не занимает место у
 * пользователей, которые уже знают, что она значит. Счётчик показов живёт
 * в localStorage, отдельно на ключ.
 */
export function useAdaptiveLabel(key: string, maxUses = 5): boolean {
  const [showLabel, setShowLabel] = useState(false)

  useEffect(() => {
    const storageKey = `osgard_adaptive_label_${key}`
    try {
      const raw = localStorage.getItem(storageKey)
      const count = raw ? Number(raw) || 0 : 0
      if (count < maxUses) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowLabel(true)
        localStorage.setItem(storageKey, String(count + 1))
      }
    } catch {
      // localStorage недоступен (приватный режим и т.п.) — подпись остаётся скрытой
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return showLabel
}
