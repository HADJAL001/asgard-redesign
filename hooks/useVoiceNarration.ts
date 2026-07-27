"use client"

/* ================================================================
   OSGARD · useVoiceNarration — голосовая озвучка результата ковки
   ----------------------------------------------------------------
   Тумблер (по умолчанию OFF, lib/feedback/voice-narration-preference.ts)
   + narrate(name, rarityLabel) поверх lib/voice.service.ts (speak,
   браузерный Web Speech API). Язык озвучки берётся из текущей
   локали приложения (lib/i18n), не из lang перевода в отрыве от UI.
   ================================================================ */

import { useCallback, useSyncExternalStore } from "react"
import { speak } from "@/lib/voice.service"
import { useTranslation } from "@/lib/i18n/use-translation"
import {
  getVoiceNarrationEnabled,
  setVoiceNarrationEnabled,
  subscribeVoiceNarrationEnabled,
} from "@/lib/feedback/voice-narration-preference"

const SPEECH_LANG_BY_LOCALE: Record<string, string> = {
  ru: "ru-RU",
  en: "en-US",
  kz: "kk-KZ",
}

export function isVoiceNarrationSupported(): boolean {
  return typeof window !== "undefined" && !!window.speechSynthesis
}

export function useVoiceNarration() {
  const { t, locale } = useTranslation()

  const enabled = useSyncExternalStore(
    subscribeVoiceNarrationEnabled,
    getVoiceNarrationEnabled,
    () => false,
  )

  const setEnabled = useCallback((next: boolean) => {
    setVoiceNarrationEnabled(next)
  }, [])

  const narrate = useCallback(
    (name: string, rarity: string) => {
      if (!enabled) return
      if (!isVoiceNarrationSupported()) return
      const rarityLabel = t(`narration.rarity.${rarity}`)
      const text = t("narration.resultTemplate", { name, rarity: rarityLabel })
      speak(text, { lang: SPEECH_LANG_BY_LOCALE[locale] ?? "ru-RU" })
    },
    [enabled, t, locale],
  )

  return {
    enabled,
    setEnabled,
    narrate,
    supported: isVoiceNarrationSupported(),
  }
}
