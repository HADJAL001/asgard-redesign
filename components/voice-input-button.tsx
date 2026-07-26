"use client"

/* ================================================================
   OSGARD · VoiceInputButton — микрофонная кнопка голосового ввода.
   Визуальный язык 1:1 с mobile/components/VoiceInputButton.tsx
   (два расходящихся кольца + чип переключения языка + текст ошибки).
   Отличия от мобилки:
   - нет индикатора уровня громкости (Web Speech API не отдаёт
     volume-события — см. lib/hooks/useVoice.ts);
   - кольца реально разнесены по времени через animation-delay —
     на мобилке delay передавался в useWaveStyle, но не использовался
     в анимации (визуальный баг), здесь исправлено.
   ================================================================ */

import { Mic } from "lucide-react"
import { COLORS } from "@/lib/economy"
import type { VoiceLanguage } from "@/lib/hooks/useVoice"

const LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  "ru-RU": "RU",
  "en-US": "EN",
  "kk-KZ": "KZ",
}

type VoiceInputButtonProps = {
  isListening: boolean
  onPress: () => void
  error?: string | null
  language?: VoiceLanguage
  onCycleLanguage?: () => void
  reduceMotion?: boolean
}

export function VoiceInputButton({
  isListening,
  onPress,
  error,
  language,
  onCycleLanguage,
  reduceMotion = false,
}: VoiceInputButtonProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      {language && onCycleLanguage ? (
        <button
          type="button"
          onClick={onCycleLanguage}
          disabled={isListening}
          className="rounded-full border px-2 py-0.5 text-[10px] font-semibold"
          style={{ borderColor: COLORS.border, background: COLORS.card, color: "rgba(255,255,255,0.5)" }}
        >
          {LANGUAGE_LABELS[language]}
        </button>
      ) : null}

      <div className="relative flex h-14 w-14 items-center justify-center">
        {isListening && !reduceMotion ? (
          <>
            <span className="voice-wave" style={{ borderColor: COLORS.accent, animationDelay: "0ms" }} />
            <span className="voice-wave" style={{ borderColor: COLORS.accent, animationDelay: "600ms" }} />
          </>
        ) : null}
        <button
          type="button"
          onClick={onPress}
          aria-pressed={isListening}
          aria-label={isListening ? "Остановить голосовой ввод" : "Начать голосовой ввод"}
          className="flex h-12 w-12 items-center justify-center rounded-full border transition-colors"
          style={{
            borderColor: isListening ? COLORS.accent : COLORS.border,
            background: isListening ? `${COLORS.accent}33` : COLORS.card,
          }}
        >
          <Mic size={20} style={{ color: isListening ? COLORS.accent : "#8A8A9A" }} aria-hidden="true" />
        </button>
      </div>

      {error ? (
        <span className="mt-1 max-w-[160px] text-center text-xs" style={{ color: COLORS.red }}>
          {error}
        </span>
      ) : null}

      <style jsx>{`
        .voice-wave {
          position: absolute;
          height: 56px;
          width: 56px;
          border-radius: 9999px;
          border-width: 2px;
          border-style: solid;
          opacity: 0.5;
          animation: voice-wave-pulse 1.2s ease-out infinite;
        }
        @keyframes voice-wave-pulse {
          0% {
            transform: scale(1);
            opacity: 0.5;
          }
          100% {
            transform: scale(1.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
