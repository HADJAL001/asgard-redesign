import dotenv from "dotenv"
import { createHash } from "crypto"
import { captureError } from "../lib/sentry"
import { cacheService } from "./cache.service"

dotenv.config()

/* ================================================================
   OSGARD · ElevenLabs TTS
   ----------------------------------------------------------------
   Премиальная озвучка ДЖАРВИС/ВАЛЛИ через ElevenLabs (eleven_multilingual_v2,
   поддержка русской речи). Без ключа — сервис недоступен, фронт делает
   fallback на браузерный speechSynthesis (см. lib/voice.service.ts).

   Аудио кешируется по хешу (текст+стиль) через cacheService (Redis, с
   fallback на in-memory) — повторные фразы (частые ответы ДЖАРВИС/ВАЛЛИ)
   не тратят повторно платные кредиты ElevenLabs и переживают рестарт бэкенда.
   ================================================================ */

const TTS_CACHE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 дней — озвучка одного и того же текста+стиля не меняется

function ttsCacheKey(text: string, style: VoiceStyle): string {
  return `elevenlabs:tts:${createHash("sha256").update(`${style}:${text}`).digest("hex")}`
}

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || ""
const ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"
const ELEVENLABS_MODEL = "eleven_multilingual_v2"

export type VoiceStyle = "announcer" | "cinematic" | "rap" | "calm" | "energetic"

interface VoiceStyleConfig {
  voiceId: string
  stability: number
  similarityBoost: number
  style: number
}

/* Предустановленные публичные voice ID ElevenLabs (premade voices), подобранные
   под характер каждого стиля; voice_settings настроены индивидуально. */
const VOICE_STYLES: Record<VoiceStyle, VoiceStyleConfig> = {
  announcer: { voiceId: "onwK4e9ZLuTAKqWW03F9" /* Daniel */, stability: 0.65, similarityBoost: 0.75, style: 0.2 },
  cinematic: { voiceId: "pNInz6obpgDQGcFmaJgB" /* Adam */, stability: 0.75, similarityBoost: 0.8, style: 0.35 },
  rap: { voiceId: "yoZ06aMxZJJ28mfd3POQ" /* Sam */, stability: 0.35, similarityBoost: 0.7, style: 0.7 },
  calm: { voiceId: "EXAVITQu4vr4xnSDxMaL" /* Sarah */, stability: 0.8, similarityBoost: 0.75, style: 0.1 },
  energetic: { voiceId: "IKne3meq5aSn9XLyUdCD" /* Charlie */, stability: 0.4, similarityBoost: 0.7, style: 0.6 },
}

export const VOICE_STYLE_KEYS = Object.keys(VOICE_STYLES) as VoiceStyle[]

export const VOICE_STYLE_LABELS: Record<VoiceStyle, string> = {
  announcer: "Диктор",
  cinematic: "Кино",
  rap: "Реп",
  calm: "Спокойный",
  energetic: "Энергичный",
}

export const VOICE_STYLE_ICONS: Record<VoiceStyle, string> = {
  announcer: "🎙️",
  cinematic: "🎬",
  rap: "🎤",
  calm: "🧘",
  energetic: "⚡",
}

export function isValidVoiceStyle(style: unknown): style is VoiceStyle {
  return typeof style === "string" && style in VOICE_STYLES
}

export function isElevenLabsConfigured(): boolean {
  return !!ELEVENLABS_API_KEY
}

/** Синтезирует речь через ElevenLabs, возвращает MP3-байты или null при отсутствии ключа/ошибке провайдера. */
export async function synthesizeSpeech(text: string, style: VoiceStyle): Promise<Buffer | null> {
  if (!ELEVENLABS_API_KEY) return null

  const cacheKey = ttsCacheKey(text, style)
  const cachedBase64 = await cacheService.get(cacheKey)
  if (typeof cachedBase64 === "string") {
    return Buffer.from(cachedBase64, "base64")
  }

  const cfg = VOICE_STYLES[style]

  try {
    const res = await fetch(`${ELEVENLABS_API_URL}/${cfg.voiceId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": ELEVENLABS_API_KEY,
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability: cfg.stability,
          similarity_boost: cfg.similarityBoost,
          style: cfg.style,
        },
      }),
    })

    if (!res.ok) {
      console.error(`[elevenlabs] TTS error: ${res.status} ${res.statusText}`)
      return null
    }

    const arrayBuffer = await res.arrayBuffer()
    const audio = Buffer.from(arrayBuffer)
    await cacheService.set(cacheKey, audio.toString("base64"), TTS_CACHE_TTL_SECONDS)
    return audio
  } catch (err) {
    captureError("[elevenlabs] TTS call failed:", err)
    return null
  }
}
