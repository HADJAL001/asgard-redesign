"use client"

/* ================================================================
   OSGARD · RoamingAvatar — бродячий аватар ДЖАРВИСА с push-to-talk
   ----------------------------------------------------------------
   Периодически (каждые ~20-40 сек) плавно перемещается в случайную
   безопасную точку экрана, избегая навбара сверху и зоны FAB
   ДЖАРВИС/чат-панели снизу-справа. Долгое нажатие (press-and-hold)
   включает распознавание речи (hooks/useVoice) — результат уходит
   в /jarvis/ask, ответ озвучивается через speakPremium (ElevenLabs,
   с автоматическим fallback на браузерный TTS).

   Монтируется глобально в AppShell рядом с JarvisFloatingWidget.
   ================================================================ */

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Mic } from "lucide-react"
import { AvatarOrb } from "@/components/ui/AvatarOrb"
import { useAuth } from "@/lib/auth-store"
import { useVoice } from "@/hooks/useVoice"
import apiClient from "@/lib/api-client"
import { loadVoiceStyleFromCache } from "@/lib/jarvis-voice-client"

const AVATAR_SIZE = 64
const NAVBAR_SAFE_TOP = 84
/** Зона FAB ДЖАРВИС + возможной открытой чат-панели (снизу-справа) — туда аватар не встаёт. */
const FAB_SAFE_ZONE = { right: 320, bottom: 200 }
const MOVE_MIN_MS = 20000
const MOVE_MAX_MS = 40000
const REPLY_VISIBLE_MS = 7000

type JarvisAskResponse = { answer: string; route?: string }

function randomPosition() {
  if (typeof window === "undefined") return { x: 24, y: 200 }
  const w = window.innerWidth
  const h = window.innerHeight
  let x = 12
  let y = NAVBAR_SAFE_TOP
  for (let attempt = 0; attempt < 8; attempt++) {
    x = Math.random() * Math.max(0, w - AVATAR_SIZE - 24) + 12
    y = Math.random() * Math.max(0, h - AVATAR_SIZE - NAVBAR_SAFE_TOP - 24) + NAVBAR_SAFE_TOP
    const inFabZone = x > w - FAB_SAFE_ZONE.right && y > h - FAB_SAFE_ZONE.bottom
    if (!inFabZone) break
  }
  return { x, y }
}

export function RoamingAvatar() {
  const { isAuthenticated } = useAuth()
  const { isSpeaking, isListening, sttSupported, startListening, stopListening, speakPremium } = useVoice()
  const [pos, setPos] = useState(() => randomPosition())
  const [reply, setReply] = useState("")
  const replyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAuthenticated) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const delay = MOVE_MIN_MS + Math.random() * (MOVE_MAX_MS - MOVE_MIN_MS)
      timer = setTimeout(() => {
        setPos(randomPosition())
        schedule()
      }, delay)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [isAuthenticated])

  const handleAsk = useCallback(
    async (text: string) => {
      try {
        const res = await apiClient.post<JarvisAskResponse>("/jarvis/ask", { question: text })
        setReply(res.answer)
        if (replyTimerRef.current) clearTimeout(replyTimerRef.current)
        replyTimerRef.current = setTimeout(() => setReply(""), REPLY_VISIBLE_MS)
        speakPremium(res.answer, loadVoiceStyleFromCache(), { lang: "ru-RU" })
      } catch {
        /* тихо игнорируем — бродячий аватар не должен ломать интерфейс при ошибке сети */
      }
    },
    [speakPremium]
  )

  const handlePressStart = useCallback(() => {
    if (!sttSupported) return
    startListening({ lang: "ru-RU", onResult: handleAsk })
  }, [sttSupported, startListening, handleAsk])

  const handlePressEnd = useCallback(() => {
    stopListening()
  }, [stopListening])

  useEffect(() => {
    return () => {
      if (replyTimerRef.current) clearTimeout(replyTimerRef.current)
    }
  }, [])

  if (!isAuthenticated) return null

  const variant = isListening ? "listening" : isSpeaking ? "speaking" : "idle"

  return (
    <motion.div
      style={{ position: "fixed", top: 0, left: 0, zIndex: 9997 }}
      initial={false}
      animate={{ x: pos.x, y: pos.y }}
      transition={{ type: "spring", stiffness: 40, damping: 16 }}
    >
      <div
        role="button"
        aria-label="Удерживайте, чтобы поговорить с ДЖАРВИСОМ"
        title={sttSupported ? "Удерживайте, чтобы поговорить с ДЖАРВИСОМ" : "Голосовой ввод не поддерживается этим браузером"}
        onPointerDown={handlePressStart}
        onPointerUp={handlePressEnd}
        onPointerLeave={handlePressEnd}
        style={{ position: "relative", cursor: sttSupported ? "pointer" : "default", touchAction: "none" }}
      >
        <AvatarOrb size={AVATAR_SIZE} variant={variant} />
        {sttSupported && (
          <span
            style={{
              position: "absolute",
              right: -2,
              bottom: -2,
              width: 22,
              height: 22,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: isListening ? "#FFC94A" : "#0A0A0F",
              border: "1.5px solid #00D4FF",
              boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
            }}
          >
            <Mic size={12} color={isListening ? "#0A0A0F" : "#00D4FF"} strokeWidth={2} aria-hidden="true" />
          </span>
        )}

        {reply && (
          <div
            style={{
              position: "absolute",
              top: AVATAR_SIZE + 10,
              left: "50%",
              transform: "translateX(-50%)",
              width: 220,
              background: "rgba(10,10,15,0.94)",
              border: "1px solid rgba(0,212,255,0.3)",
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 12,
              lineHeight: 1.4,
              color: "#cdeaff",
              whiteSpace: "normal",
              boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            }}
          >
            {reply}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default RoamingAvatar
