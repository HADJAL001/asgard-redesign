"use client"

/* ================================================================
   OSGARD · useVoice — React-обвязка над lib/voice.service.ts (STT).
   Логика 1:1 по духу с mobile/hooks/useVoiceInput.ts: автостоп по
   тишине, жёсткий потолок записи, циклический выбор языка, русские
   тексты ошибок. Отличия от мобилки:
   - нет данных о громкости — Web Speech API не отдаёт volume-события,
     поэтому индикатор уровня на вебе не строим (components/voice-input-button.tsx);
   - lib/voice.service.ts всегда читает event.results[0][0], поэтому
     continuous-режим браузерного API не подходит напрямую — вместо
     этого перезапускаем recognition после каждой финальной фразы
     (onEnd), пока не истечёт SILENCE_AUTOSTOP_MS с последней фразы
     или MAX_RECORDING_MS с начала записи.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react"
import { isSttSupported, startListening, stopListening } from "@/lib/voice.service"

const LANGUAGE_CYCLE = ["ru-RU", "en-US", "kk-KZ"] as const
export type VoiceLanguage = (typeof LANGUAGE_CYCLE)[number]

const SILENCE_AUTOSTOP_MS = 1500
const MAX_RECORDING_MS = 30000

const ERROR_MESSAGES: Record<string, string> = {
  "no-speech": "Речь не распознана, попробуйте ещё раз",
  "audio-capture": "Микрофон недоступен",
  "not-allowed": "Нет доступа к микрофону",
  network: "Ошибка сети при распознавании речи",
  aborted: "Запись прервана",
  "language-not-supported": "Язык не поддерживается",
  "service-not-allowed": "Распознавание речи запрещено браузером",
  default: "Не удалось распознать речь",
}

export function useVoice(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [language, setLanguage] = useState<VoiceLanguage>("ru-RU")
  const [supported, setSupported] = useState(true)

  const stoppedByUser = useRef(false)
  const startedAt = useRef(0)
  const lastResultAt = useRef(0)
  const onTranscriptRef = useRef(onTranscript)
  onTranscriptRef.current = onTranscript

  useEffect(() => {
    setSupported(isSttSupported())
  }, [])

  const runRecognition = useCallback(() => {
    startListening({
      lang: language,
      continuous: false,
      interimResults: false,
      onResult: (text) => {
        lastResultAt.current = Date.now()
        if (text.trim()) onTranscriptRef.current(text.trim())
      },
      onError: (event) => {
        const code = (event && event.error) || "default"
        if (code !== "no-speech" && code !== "aborted") {
          setError(ERROR_MESSAGES[code] ?? ERROR_MESSAGES.default)
        }
      },
      onEnd: () => {
        const now = Date.now()
        const silentFor = now - (lastResultAt.current || startedAt.current)
        const elapsed = now - startedAt.current
        if (!stoppedByUser.current && silentFor < SILENCE_AUTOSTOP_MS && elapsed < MAX_RECORDING_MS) {
          runRecognition()
        } else {
          setIsListening(false)
        }
      },
    })
  }, [language])

  const stop = useCallback(() => {
    stoppedByUser.current = true
    stopListening()
    setIsListening(false)
  }, [])

  const start = useCallback(() => {
    if (!supported) {
      setError(ERROR_MESSAGES.default)
      return
    }
    setError(null)
    stoppedByUser.current = false
    startedAt.current = Date.now()
    lastResultAt.current = 0
    setIsListening(true)
    runRecognition()
  }, [supported, runRecognition])

  const cycleLanguage = useCallback(() => {
    const idx = LANGUAGE_CYCLE.indexOf(language)
    setLanguage(LANGUAGE_CYCLE[(idx + 1) % LANGUAGE_CYCLE.length])
  }, [language])

  useEffect(() => {
    return () => {
      stoppedByUser.current = true
      stopListening()
    }
  }, [])

  return { isListening, error, language, supported, start, stop, cycleLanguage }
}
