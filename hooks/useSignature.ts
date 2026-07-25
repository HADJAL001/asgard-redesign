"use client"

/* ================================================================
   OSGARD · useSignature — единый сенсорный «жест» бренда
   ----------------------------------------------------------------
   Один вход для звука + тактильности на ключевых моментах:
   play('artifactBorn' | 'rarityUp' | 'streak' | 'legendary').

   Гейтинг:
   • Мастер-тумблер (по умолчанию OFF, lib/feedback/preferences.ts) —
     пока выключен, play() ничего не делает: у текущих пользователей
     нулевое изменение (prod-safe).
   • prefers-reduced-motion глушит именно ТАКТИЛЬНЫЙ импульс (это
     физическое движение устройства); тихий звук остаётся, т.к. это
     не «движение» интерфейса.
   ================================================================ */

import { useCallback, useSyncExternalStore } from "react"
import { useReducedMotion } from "framer-motion"
import { playCue, isSoundSupported, type SignatureCue } from "@/lib/feedback/sound"
import { vibrateCue, isVibrationSupported } from "@/lib/feedback/haptics"
import { getSignatureEnabled, setSignatureEnabled, subscribeSignatureEnabled } from "@/lib/feedback/preferences"

export type { SignatureCue } from "@/lib/feedback/sound"

export function useSignature() {
  const reduce = useReducedMotion()
  // Внешний стор (localStorage + CustomEvent) через штатный useSyncExternalStore:
  // клиентский снапшот — реальное значение, серверный — false (совпадает с SSR,
  // localStorage на сервере нет → гидратация без рассинхрона). Без setState-в-эффекте.
  const enabled = useSyncExternalStore(
    subscribeSignatureEnabled,
    getSignatureEnabled,
    () => false,
  )

  const setEnabled = useCallback((next: boolean) => {
    setSignatureEnabled(next) // запись + оповещение → useSyncExternalStore перечитает снапшот
  }, [])

  const play = useCallback(
    (cue: SignatureCue) => {
      if (!enabled) return
      playCue(cue)
      if (!reduce) vibrateCue(cue)
    },
    [enabled, reduce]
  )

  return {
    play,
    enabled,
    setEnabled,
    soundSupported: isSoundSupported(),
    vibrationSupported: isVibrationSupported(),
  }
}
