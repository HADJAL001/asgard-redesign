/* ================================================================
   OSGARD · ДЖАРВИС Voice Style (фронтенд-зеркало backend/src/services/elevenlabs.ts)
   ----------------------------------------------------------------
   Отдельная настройка от JarvisMode (личность) — выбор голосового
   стиля ElevenLabs для премиум-озвучки (см. lib/voice.service.ts
   speakPremium). Хранится только локально (как ReplyMode), сервер
   не запоминает выбор пользователя — стиль передаётся с каждым
   запросом на /jarvis/speak.
   ================================================================ */

import apiClient from "@/lib/api-client"

export type VoiceStyle = "announcer" | "cinematic" | "rap" | "calm" | "energetic"

export const VOICE_STYLE_ICONS: Record<VoiceStyle, string> = {
  announcer: "🎙️",
  cinematic: "🎬",
  rap: "🎤",
  calm: "🧘",
  energetic: "⚡",
}

export const VOICE_STYLE_LABELS: Record<VoiceStyle, string> = {
  announcer: "Диктор",
  cinematic: "Кино",
  rap: "Реп",
  calm: "Спокойный",
  energetic: "Энергичный",
}

export const ALL_VOICE_STYLES: VoiceStyle[] = ["calm", "announcer", "cinematic", "energetic", "rap"]

const VOICE_STYLE_KEY = "jarvis_voice_style"

export function isValidVoiceStyle(value: unknown): value is VoiceStyle {
  return typeof value === "string" && (ALL_VOICE_STYLES as string[]).includes(value)
}

export function loadVoiceStyleFromCache(): VoiceStyle {
  if (typeof window === "undefined") return "calm"
  try {
    const saved = localStorage.getItem(VOICE_STYLE_KEY)
    if (isValidVoiceStyle(saved)) return saved
  } catch {
    /* ignore */
  }
  return "calm"
}

export function saveVoiceStyleToCache(style: VoiceStyle) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(VOICE_STYLE_KEY, style)
  } catch {
    /* ignore */
  }
}

export type VoiceStylesResponse = {
  configured: boolean
  styles: { style: VoiceStyle; icon: string; label: string }[]
}

/** true, если на бэкенде задан ELEVENLABS_API_KEY (иначе /jarvis/speak всегда 503 — не имеет смысла показывать выбор стиля). */
export async function fetchVoiceStylesFromServer(): Promise<VoiceStylesResponse | null> {
  try {
    return await apiClient.get<VoiceStylesResponse>("/jarvis/voice-styles")
  } catch {
    return null
  }
}
