/* ================================================================
   OSGARD · Voice Service
   ----------------------------------------------------------------
   Единая низкоуровневая обёртка над Web Speech API (TTS + STT),
   без React-состояния. Заменяет две разрозненные реализации,
   ранее жившие отдельно в components/JarvisChat.tsx и
   app/walli-room/useWalliVoice.ts — используйте hooks/useVoice.ts
   для React-обвязки (isSpeaking/isListening).

   speakPremium() — премиум-озвучка через ElevenLabs (backend /jarvis/speak),
   отдельно от speak() (браузерный speechSynthesis, используется как fallback
   при отсутствии ELEVENLABS_API_KEY или сетевой ошибке).
   ================================================================ */

import { API_BASE_URL } from "@/lib/api-client"
import type { VoiceStyle } from "@/lib/jarvis-voice-client"

export type SpeakOptions = {
  /** Язык озвучки, напр. "ru-RU". По умолчанию "ru-RU". */
  lang?: string
  rate?: number
  pitch?: number
  /** Подсказка для подбора голоса ("en" — британский акцент и т.п.), см. resolveVoiceProfile в lib/jarvis-equipment.ts. */
  langHint?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (event: SpeechSynthesisErrorEvent) => void
}

export function speak(text: string, options: SpeakOptions = {}) {
  if (typeof window === "undefined") return
  const synth = window.speechSynthesis
  if (!synth) return

  synth.cancel() // прерываем предыдущую озвучку, если она ещё идёт

  const utterance = new SpeechSynthesisUtterance(text)
  const lang = options.lang ?? "ru-RU"
  utterance.lang = lang
  utterance.rate = options.rate ?? 1
  utterance.pitch = options.pitch ?? 1

  // Пытаемся выбрать голос по подсказке (langHint) или по языку озвучки,
  // иначе — любой русскоязычный голос как разумный дефолт.
  const voices = synth.getVoices()
  const preferredLang = options.langHint === "en" ? "en" : lang.split("-")[0]
  const preferredVoice = voices.find((v) => v.lang?.toLowerCase().startsWith(preferredLang))
  const ruVoice = voices.find((v) => v.lang?.toLowerCase().startsWith("ru"))
  if (preferredVoice) utterance.voice = preferredVoice
  else if (ruVoice) utterance.voice = ruVoice

  if (options.onStart) utterance.onstart = options.onStart
  if (options.onEnd) utterance.onend = options.onEnd
  if (options.onError) utterance.onerror = options.onError

  synth.speak(utterance)
}

export function stopSpeaking() {
  if (typeof window === "undefined") return
  window.speechSynthesis?.cancel()
  stopPremiumSpeaking()
}

let activePremiumAudio: HTMLAudioElement | null = null

export type SpeakPremiumOptions = {
  onStart?: () => void
  onEnd?: () => void
}

/** Останавливает текущее премиум-аудио (ElevenLabs), если оно воспроизводится. */
export function stopPremiumSpeaking() {
  if (activePremiumAudio) {
    activePremiumAudio.pause()
    activePremiumAudio = null
  }
}

/**
 * Озвучка через ElevenLabs (POST /jarvis/speak). Возвращает true, если удалось
 * воспроизвести премиум-голос, иначе false — вызывающий код должен сам сделать
 * fallback на speak() (нет ключа на бэкенде, сеть недоступна и т.п.).
 */
export async function speakPremium(
  text: string,
  style: VoiceStyle,
  options: SpeakPremiumOptions = {}
): Promise<boolean> {
  if (typeof window === "undefined") return false
  stopPremiumSpeaking()

  try {
    const res = await fetch(`${API_BASE_URL}/jarvis/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ text, style }),
    })
    if (!res.ok) return false

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    activePremiumAudio = audio

    audio.onplay = () => options.onStart?.()
    audio.onended = () => {
      URL.revokeObjectURL(url)
      if (activePremiumAudio === audio) activePremiumAudio = null
      options.onEnd?.()
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      if (activePremiumAudio === audio) activePremiumAudio = null
      options.onEnd?.()
    }

    await audio.play()
    return true
  } catch {
    return false
  }
}

/** Прогружает список голосов заранее (некоторые браузеры грузят их асинхронно). */
export function preloadVoices() {
  if (typeof window === "undefined") return
  window.speechSynthesis?.getVoices()
}

export function isSttSupported(): boolean {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
}

export type ListenOptions = {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
  onStart?: () => void
  onEnd?: () => void
  onError?: (event: any) => void
  onResult?: (transcript: string) => void
}

let activeRecognition: any = null

export function startListening(options: ListenOptions = {}) {
  if (typeof window === "undefined") return
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SpeechRecognition) {
    options.onError?.(new Error("Speech recognition not supported"))
    return
  }

  stopListening()

  const recognition = new SpeechRecognition()
  recognition.lang = options.lang ?? "ru-RU"
  recognition.continuous = options.continuous ?? false
  recognition.interimResults = options.interimResults ?? false

  recognition.onstart = () => options.onStart?.()
  recognition.onend = () => options.onEnd?.()
  recognition.onerror = (e: any) => options.onError?.(e)
  recognition.onresult = (event: any) => {
    const text = event.results[0][0].transcript
    options.onResult?.(text)
  }

  activeRecognition = recognition
  recognition.start()
}

export function stopListening() {
  if (activeRecognition) {
    try {
      activeRecognition.abort()
    } catch {
      /* ignore */
    }
    activeRecognition = null
  }
}
