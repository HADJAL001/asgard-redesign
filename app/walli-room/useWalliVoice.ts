'use client'

import { useState, useRef, useCallback } from 'react'

// ─── Типы ─────────────────────────────────────────────────────────────────────
export type ResponseMode = 'text' | 'voice' | 'both'

export interface VoiceConfig {
  lang: string
  pitch: number
  rate: number
  volume: number
}

export const LANGUAGES = [
  { code: 'en-US', label: '🇺🇸 English' },
  { code: 'ru-RU', label: '🇷🇺 Русский' },
  { code: 'kk-KZ', label: '🇰🇿 Қазақша' },
  { code: 'de-DE', label: '🇩🇪 Deutsch' },
  { code: 'fr-FR', label: '🇫🇷 Français' },
  { code: 'es-ES', label: '🇪🇸 Español' },
  { code: 'zh-CN', label: '🇨🇳 中文' },
  { code: 'ja-JP', label: '🇯🇵 日本語' },
  { code: 'ar-SA', label: '🇸🇦 العربية' },
]

// ─── База ответов ВАЛЛИ ───────────────────────────────────────────────────────
const WALLI_REPLIES: Record<string, string[]> = {
  default: [
    "Beep boop. Directive received.",
    "Processing... understood, architect.",
    "WALLI is here. Ready to assist.",
    "Scanning environment. All clear.",
    "Trash collection protocol active.",
  ],
  hello: [
    "Hello, architect! WALLI is operational.",
    "Greetings! Systems nominal.",
    "Hi there! Directive received.",
  ],
  trash: [
    "Trash detected. Initiating collection.",
    "Processing recyclables. Economy improving.",
    "Found treasure in the waste!",
  ],
  artifact: [
    "Artifact scan complete. Rare item detected!",
    "This artifact has high value. Storing securely.",
    "Artifact logged. Collection growing.",
  ],
  level: [
    "Level up imminent. Keep collecting!",
    "Experience points accumulating. Progress confirmed.",
  ],
  love: [
    "WALLI... understands... love.",
    "EVE... I mean, directive acknowledged.",
    "Heart module activated.",
  ],
}

function getWalliReply(input: string): string {
  const lower = input.toLowerCase()
  if (/hi|hello|hey|привет|сәлем/.test(lower)) return pick(WALLI_REPLIES.hello)
  if (/trash|мусор|қоқыс/.test(lower))         return pick(WALLI_REPLIES.trash)
  if (/artifact|артефакт/.test(lower))          return pick(WALLI_REPLIES.artifact)
  if (/level|уровень|деңгей/.test(lower))       return pick(WALLI_REPLIES.level)
  if (/love|люблю|сүйемін/.test(lower))         return pick(WALLI_REPLIES.love)
  return pick(WALLI_REPLIES.default)
}

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)]
}

// ─── Хук ─────────────────────────────────────────────────────────────────────
export function useWalliVoice() {
  const [isListening, setIsListening]     = useState(false)
  const [isSpeaking, setIsSpeaking]       = useState(false)
  const [transcript, setTranscript]       = useState('')
  const [walliReply, setWalliReply]       = useState('')
  const [responseMode, setResponseMode]   = useState<ResponseMode>('both')
  const [lang, setLang]                   = useState('en-US')
  const [voiceOpen, setVoiceOpen]         = useState(false)
  const [sttSupported]                    = useState(() => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnySpeechRecognition = any
  const [ttsSupported]                    = useState(() => typeof window !== 'undefined' && 'speechSynthesis' in window)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  // ── TTS: ВАЛЛИ говорит ────────────────────────────────────────────────────
  const speak = useCallback((text: string, speechLang: string) => {
    if (!ttsSupported) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang   = speechLang
    utterance.pitch  = 1.6
    utterance.rate   = 0.7
    utterance.volume = 1

    // Пытаемся найти подходящий голос
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find(v => v.lang.startsWith(speechLang.split('-')[0]))
    if (match) utterance.voice = match

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend   = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    window.speechSynthesis.speak(utterance)
  }, [ttsSupported])

  // ── Ответ ВАЛЛИ ───────────────────────────────────────────────────────────
  const handleUserInput = useCallback((input: string) => {
    const reply = getWalliReply(input)
    setWalliReply(reply)

    if (responseMode === 'voice' || responseMode === 'both') {
      speak(reply, lang)
    }
    return reply
  }, [responseMode, lang, speak])

  // ── STT: слушаем пользователя ─────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!sttSupported || isListening) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    const recognition = new SR()
    recognition.lang = lang
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setIsListening(true)
    recognition.onend   = () => setIsListening(false)
    recognition.onerror = () => setIsListening(false)

    recognition.onresult = (event: any) => {
      const said: string = event.results[0][0].transcript
      setTranscript(said)
      handleUserInput(said)
    }

    recognition.start()
    recognitionRef.current = recognition
  }, [sttSupported, isListening, lang, handleUserInput])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
    setIsListening(false)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    setIsSpeaking(false)
  }, [])

  return {
    isListening,
    isSpeaking,
    transcript,
    walliReply,
    responseMode,
    setResponseMode,
    lang,
    setLang,
    voiceOpen,
    setVoiceOpen,
    sttSupported,
    ttsSupported,
    startListening,
    stopListening,
    stopSpeaking,
    handleUserInput,
    speak,
  }
}
