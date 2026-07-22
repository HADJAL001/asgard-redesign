"use client"

/* ================================================================
   OSGARD · useVoice — React-обвязка над lib/voice.service.ts
   ----------------------------------------------------------------
   Даёт isSpeaking/isListening в состояние компонента поверх
   низкоуровневого Web Speech API. Используется JarvisChat.tsx
   и app/walli-room/useWalliVoice.ts.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react"
import * as voiceService from "@/lib/voice.service"
import type { ListenOptions, SpeakOptions } from "@/lib/voice.service"

export function useVoice() {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const sttSupported = useRef(voiceService.isSttSupported()).current

  useEffect(() => {
    voiceService.preloadVoices()
    return () => {
      voiceService.stopSpeaking()
      voiceService.stopListening()
    }
  }, [])

  const speak = useCallback((text: string, options: Omit<SpeakOptions, "onStart" | "onEnd"> = {}) => {
    voiceService.speak(text, {
      ...options,
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    })
  }, [])

  const stopSpeaking = useCallback(() => {
    voiceService.stopSpeaking()
    setIsSpeaking(false)
  }, [])

  const startListening = useCallback((options: Omit<ListenOptions, "onStart" | "onEnd"> = {}) => {
    voiceService.startListening({
      ...options,
      onStart: () => setIsListening(true),
      onEnd: () => setIsListening(false),
    })
  }, [])

  const stopListening = useCallback(() => {
    voiceService.stopListening()
    setIsListening(false)
  }, [])

  return { isSpeaking, isListening, sttSupported, speak, stopSpeaking, startListening, stopListening }
}
