"use client"

/* ================================================================
   OSGARD · ВАЛЛИ Chat Widget
   ----------------------------------------------------------------
   Чат с ИИ-ассистентом ВАЛЛИ.

   Режимы ответа (переключаются кнопками или выпадающим списком):
     - "text"  💬  — только текст в чате, без озвучки
     - "voice" 🔊  — только голос (Web Speech API), текст ответа скрыт
     - "both"  💬🔊 — текст + голос одновременно

   Настройка режима сохраняется в localStorage (ключ "jarvis_reply_mode"),
   поэтому после перезагрузки страницы выбор пользователя сохраняется.

   Озвучка реализована через браузерный Web Speech API
   (window.speechSynthesis) — без обращения к серверу.
   ================================================================ */

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Send, Volume2, VolumeX, MessageSquare, Loader2, Bot, User, Square, Mic, MicOff, GitBranch } from "lucide-react"
import apiClient from "@/lib/api-client"
import { useTranslation } from "@/lib/i18n/use-translation"
import JarvisAvatar from "@/components/JarvisAvatar"
import { useVoice } from "@/hooks/useVoice"
import {
  type JarvisEquipment,
  EMPTY_EQUIPMENT,
  loadEquipmentFromCache,
  fetchEquipmentFromServer,
  subscribeToEquipmentChanges,
  resolveVoiceProfile,
} from "@/lib/jarvis-equipment"
import {
  type JarvisMode,
  ALL_MODES,
  MODE_ICONS,
  MODE_LABELS,
  loadPersonalityModeFromCache,
  savePersonalityModeToCache,
  fetchPersonalityFromServer,
} from "@/lib/jarvis-personality-client"
import {
  type VoiceStyle,
  ALL_VOICE_STYLES,
  VOICE_STYLE_ICONS,
  VOICE_STYLE_LABELS,
  loadVoiceStyleFromCache,
  saveVoiceStyleToCache,
  fetchVoiceStylesFromServer,
} from "@/lib/jarvis-voice-client"

/* ----------------------------------------------------------------
   Типы
   ---------------------------------------------------------------- */

type ReplyMode = "text" | "voice" | "both"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  route?: string
  personalityIcon?: string
}

const REPLY_MODE_KEY = "jarvis_reply_mode"

const REPLY_MODE_META: Record<ReplyMode, { label: string; icon: string }> = {
  text: { label: "Только текст", icon: "💬" },
  voice: { label: "Только голос", icon: "🔊" },
  both: { label: "Текст + Голос", icon: "💬🔊" },
}

/* ----------------------------------------------------------------
   Хелперы для localStorage
   ---------------------------------------------------------------- */

function loadReplyMode(): ReplyMode {
  if (typeof window === "undefined") return "both"
  try {
    const saved = localStorage.getItem(REPLY_MODE_KEY)
    if (saved === "text" || saved === "voice" || saved === "both") return saved
  } catch {
    /* ignore */
  }
  return "both"
}

function saveReplyMode(mode: ReplyMode) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(REPLY_MODE_KEY, mode)
  } catch {
    /* ignore */
  }
}

/* ----------------------------------------------------------------
   Компонент
   ---------------------------------------------------------------- */

export function ВАЛЛИChat() {
  const { t } = useTranslation()
  const router = useRouter()
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Привет! Я ВАЛЛИ. Спроси меня о балансе, артефактах, проектах или цепочках оркестратора — или задай любой другой вопрос.",
    },
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [replyMode, setReplyMode] = useState<ReplyMode>("both")
  const { isSpeaking: speaking, speakPremium, stopSpeaking, isListening, startListening, stopListening, sttSupported } = useVoice()
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  /* Режим личности ВАЛЛИ (обычный/цитаты/вредный/поэт/новости) — влияет на стиль ответов. */
  const [personalityMode, setPersonalityMode] = useState<JarvisMode>("default")
  const [personalityMenuOpen, setPersonalityMenuOpen] = useState(false)
  /* Голосовой стиль ElevenLabs (диктор/кино/реп/спокойный/энергичный) — отдельно от JarvisMode. */
  const [voiceStyle, setVoiceStyle] = useState<VoiceStyle>("calm")
  const [voiceStyleMenuOpen, setVoiceStyleMenuOpen] = useState(false)
  const [premiumVoiceConfigured, setPremiumVoiceConfigured] = useState(false)
  /* Текущая экипировка ВАЛЛИА (skin/voice/accessory) — влияет на 3D-аватар и голос TTS. */
  const [equipment, setEquipment] = useState<JarvisEquipment>(EMPTY_EQUIPMENT)

  const scrollRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const personalityMenuRef = useRef<HTMLDivElement>(null)
  const voiceStyleMenuRef = useRef<HTMLDivElement>(null)

  /* Восстановление режима ответа из localStorage при монтировании */
  useEffect(() => {
    setReplyMode(loadReplyMode())
  }, [])

  /* Режим личности: мгновенно из кэша, затем сверяемся с сервером (GET /jarvis/personality). */
  useEffect(() => {
    setPersonalityMode(loadPersonalityModeFromCache())
    fetchPersonalityFromServer().then((mode) => {
      if (mode) setPersonalityMode(mode)
    })
  }, [])

  /* Голосовой стиль: локальный кэш + проверка, настроен ли ElevenLabs на бэкенде (GET /jarvis/voice-styles). */
  useEffect(() => {
    setVoiceStyle(loadVoiceStyleFromCache())
    fetchVoiceStylesFromServer().then((res) => {
      if (res) setPremiumVoiceConfigured(res.configured)
    })
  }, [])

  /* ----------------------------------------------------------------
     Экипировка ВАЛЛИА:
     1. Мгновенно показываем то, что уже лежит в localStorage-кэше
        (без ожидания сети) — чтобы аватар не "мигал" пустым при заходе.
     2. Параллельно синхронизируемся с бэкендом (GET /jarvis/my-accessories),
        чтобы подтянуть актуальное состояние (например, если аксессуар
        был куплен/надет с другого устройства).
     3. Подписываемся на событие "jarvis-equipment-changed" — как только
        пользователь наденет новый аксессуар в /jarvis/shop (даже в
        соседней вкладке), аватар в чате перерисуется без перезагрузки.
     ---------------------------------------------------------------- */
  useEffect(() => {
    setEquipment(loadEquipmentFromCache())
    fetchEquipmentFromServer().then(setEquipment)

    const unsubscribe = subscribeToEquipmentChanges((next) => setEquipment(next))
    return unsubscribe
  }, [])


  /* Автоскролл вниз при новых сообщениях */
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, loading])

  /* Закрытие выпадающих меню (режим ответа + личность + голос) по клику снаружи */
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setModeMenuOpen(false)
      }
      if (personalityMenuRef.current && !personalityMenuRef.current.contains(e.target as Node)) {
        setPersonalityMenuOpen(false)
      }
      if (voiceStyleMenuRef.current && !voiceStyleMenuRef.current.contains(e.target as Node)) {
        setVoiceStyleMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  function handleSetPersonalityMode(mode: JarvisMode) {
    setPersonalityMode(mode)
    savePersonalityModeToCache(mode)
    setPersonalityMenuOpen(false)
  }

  function handleSetVoiceStyle(style: VoiceStyle) {
    setVoiceStyle(style)
    saveVoiceStyleToCache(style)
    setVoiceStyleMenuOpen(false)
  }

  function handleSetReplyMode(mode: ReplyMode) {
    setReplyMode(mode)
    saveReplyMode(mode)
    setModeMenuOpen(false)
    if (mode === "text") stopSpeaking()
  }

  /** Переключатель голоса: voice-only <-> text-only, both сохраняет второй канал. */
  function toggleVoice() {
    if (replyMode === "voice") {
      handleSetReplyMode("text")
    } else if (replyMode === "text") {
      handleSetReplyMode("both")
    } else {
      // both -> отключаем голос, оставляем только текст
      handleSetReplyMode("text")
      stopSpeaking()
    }
  }

  /** Переключатель текста: text-only <-> voice-only, both сохраняет второй канал. */
  function toggleText() {
    if (replyMode === "text") {
      handleSetReplyMode("voice")
    } else if (replyMode === "voice") {
      handleSetReplyMode("both")
    } else {
      // both -> отключаем текст, оставляем только голос
      handleSetReplyMode("voice")
    }
  }

  const voiceEnabled = replyMode === "voice" || replyMode === "both"
  const textEnabled = replyMode === "text" || replyMode === "both"

  /** Голосовой ввод — запускает STT и вставляет распознанный текст в поле ввода */
  function handleMicToggle() {
    if (isListening) {
      stopListening()
      return
    }
    startListening({
      onResult: (text: string) => {
        setInput(text)
        stopListening()
      },
      lang: "ru-RU",
    })
  }

  async function handleSend(overrideText?: string) {
    const question = (overrideText ?? input).trim()
    if (!question || loading) return

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: question }
    setMessages((prev) => [...prev, userMsg])
    if (!overrideText) setInput("")
    setLoading(true)

    try {
      const res = await apiClient.post<{
        answer: string
        route: string
        mode?: JarvisMode
        icon?: string
        orchestratorChainId?: number | null
      }>("/jarvis/ask", { question, mode: personalityMode })

      if (res.mode) {
        setPersonalityMode(res.mode)
        savePersonalityModeToCache(res.mode)
      }

      const assistantMsg: ChatMessage = {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: res.answer,
        route: res.route,
        personalityIcon: res.icon,
      }
      setMessages((prev) => [...prev, assistantMsg])

      // Озвучиваем ответ, если включён голосовой канал: премиум-голос ElevenLabs,
      // при отсутствии ключа/ошибке — автоматический fallback на браузерный TTS.
      if (replyMode === "voice" || replyMode === "both") {
        const profile = resolveVoiceProfile(equipment.voice)
        speakPremium(res.answer, voiceStyle, { rate: profile.rate, pitch: profile.pitch, langHint: profile.langHint })
      }

      // Если ВАЛЛИ рекомендует запустить цепочку — автоматически переходим через 1.5 сек
      if (res.orchestratorChainId) {
        setTimeout(() => {
          router.push(`/orchestrator/${res.orchestratorChainId}?run=1`)
        }, 1500)
      }

    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: err?.message || "Не удалось получить ответ от ВАЛЛИА. Попробуйте позже.",
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="jarvis-chat">
      {/* 3D-аватар — мгновенно отражает текущую экипировку (skin/accessory) */}
      <JarvisAvatar equipment={equipment} speaking={speaking} height={180} />

      <div className="jarvis-header">
        <div className="jarvis-title">
          <Bot size={18} aria-hidden="true" />
          <span>{t("walli.advisorLabel")}</span>
          {(equipment.skin || equipment.accessory || equipment.voice) && (
            <span className="jarvis-equip-badge" title="Аксессуары ВАЛЛИ активны">
              ✨
            </span>
          )}
        </div>


        <div className="jarvis-controls">
          {/* Кнопка-переключатель голоса */}
          <button
            type="button"
            className={`jarvis-toggle-btn ${voiceEnabled ? "on" : "off"}`}
            onClick={toggleVoice}
            title={voiceEnabled ? "Выключить голос" : "Включить голос"}
            aria-pressed={voiceEnabled}
          >
            {voiceEnabled ? <Volume2 size={16} aria-hidden="true" /> : <VolumeX size={16} aria-hidden="true" />}
          </button>

          {/* Кнопка-переключатель текста */}
          <button
            type="button"
            className={`jarvis-toggle-btn ${textEnabled ? "on" : "off"}`}
            onClick={toggleText}
            title={textEnabled ? "Скрыть текст ответов" : "Показывать текст ответов"}
            aria-pressed={textEnabled}
          >
            <MessageSquare size={16} aria-hidden="true" />
          </button>

          {/* Выпадающий список режимов */}
          <div className="jarvis-mode-select" ref={menuRef}>
            <button
              type="button"
              className="jarvis-mode-btn"
              onClick={() => setModeMenuOpen((v) => !v)}
              title="Режим ответа"
            >
              <span className="jarvis-mode-icon">{REPLY_MODE_META[replyMode].icon}</span>
              <span className="jarvis-mode-label">{REPLY_MODE_META[replyMode].label}</span>
            </button>

            {modeMenuOpen && (
              <div className="jarvis-mode-menu">
                {(Object.keys(REPLY_MODE_META) as ReplyMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`jarvis-mode-option ${replyMode === mode ? "active" : ""}`}
                    onClick={() => handleSetReplyMode(mode)}
                  >
                    <span className="jarvis-mode-icon">{REPLY_MODE_META[mode].icon}</span>
                    {REPLY_MODE_META[mode].label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Выпадающий список личности ВАЛЛИ (обычный/цитаты/вредный/поэт/новости) */}
          <div className="jarvis-mode-select" ref={personalityMenuRef}>
            <button
              type="button"
              className="jarvis-mode-btn"
              onClick={() => setPersonalityMenuOpen((v) => !v)}
              title="Личность ВАЛЛИ"
            >
              <span className="jarvis-mode-icon">{MODE_ICONS[personalityMode]}</span>
              <span className="jarvis-mode-label">{MODE_LABELS[personalityMode]}</span>
            </button>

            {personalityMenuOpen && (
              <div className="jarvis-mode-menu">
                {ALL_MODES.map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`jarvis-mode-option ${personalityMode === mode ? "active" : ""}`}
                    onClick={() => handleSetPersonalityMode(mode)}
                  >
                    <span className="jarvis-mode-icon">{MODE_ICONS[mode]}</span>
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Выпадающий список голосового стиля озвучки (диктор/кино/реп/спокойный/энергичный) */}
          <div className="jarvis-mode-select" ref={voiceStyleMenuRef}>
            <button
              type="button"
              className="jarvis-mode-btn"
              onClick={() => setVoiceStyleMenuOpen((v) => !v)}
              title={premiumVoiceConfigured ? "Голос ВАЛЛИ" : "Голос ВАЛЛИ (браузерный TTS — премиум-голос не настроен)"}
            >
              <span className="jarvis-mode-icon">{VOICE_STYLE_ICONS[voiceStyle]}</span>
              <span className="jarvis-mode-label">{VOICE_STYLE_LABELS[voiceStyle]}</span>
            </button>

            {voiceStyleMenuOpen && (
              <div className="jarvis-mode-menu">
                {ALL_VOICE_STYLES.map((style) => (
                  <button
                    key={style}
                    type="button"
                    className={`jarvis-mode-option ${voiceStyle === style ? "active" : ""}`}
                    onClick={() => handleSetVoiceStyle(style)}
                  >
                    <span className="jarvis-mode-icon">{VOICE_STYLE_ICONS[style]}</span>
                    {VOICE_STYLE_LABELS[style]}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Индикатор озвучки + кнопка остановки */}
          {speaking && (
            <button
              type="button"
              className="jarvis-stop-speak"
              onClick={() => stopSpeaking()}
              title="Остановить озвучку"
            >
              <Square size={12} aria-hidden="true" />
              <span className="jarvis-speak-pulse" />
            </button>
          )}
        </div>
      </div>

      <div className="jarvis-messages" ref={scrollRef}>
        {messages.map((m) => {
          // В режиме "Только голос" скрываем текст ответов ассистента (кроме приветственного,
          // чтобы пользователь не остался с абсолютно пустым чатом при первом визите).
          const hideAssistantText = replyMode === "voice" && m.role === "assistant" && m.id !== "welcome"

          return (
            <div key={m.id} className={`jarvis-msg ${m.role}`}>
              <div className="jarvis-msg-avatar">
                {m.role === "user" ? <User size={14} aria-hidden="true" /> : <Bot size={14} aria-hidden="true" />}
              </div>
              <div className="jarvis-msg-bubble">
                {hideAssistantText ? (
                  <span className="jarvis-msg-voice-only">
                    <Volume2 size={13} aria-hidden="true" /> Ответ озвучен голосом
                  </span>
                ) : (
                  <span className="jarvis-msg-text">{m.content}</span>
                )}
                {!hideAssistantText && (m.route || m.personalityIcon) && (
                  <span className="jarvis-msg-route">
                    {m.personalityIcon ? `${m.personalityIcon} ` : ""}
                    {m.route}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="jarvis-msg assistant">
            <div className="jarvis-msg-avatar">
              <Bot size={14} aria-hidden="true" />
            </div>
            <div className="jarvis-msg-bubble jarvis-msg-loading">
              <Loader2 size={14} className="jarvis-spin" aria-hidden="true" />
              Думаю...
            </div>
          </div>
        )}
      </div>

      <div className="jarvis-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Слушаю…" : "Спросите ВАЛЛИА..."}
          disabled={loading}
        />
        {sttSupported && (
          <button
            type="button"
            onClick={handleMicToggle}
            className={isListening ? "jarvis-mic-btn listening" : "jarvis-mic-btn"}
            title={isListening ? "Остановить запись" : "Голосовой ввод"}
            aria-pressed={isListening}
          >
            {isListening ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSend()}
          disabled={!input.trim() || loading}
          title="Отправить"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </div>

      <style>{JARVIS_CHAT_CSS}</style>
    </div>
  )
}

export default ВАЛЛИChat

/* ================================================================
   Стили
   ================================================================ */
const JARVIS_CHAT_CSS = `
.jarvis-chat {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 420px;
  height: 740px;

  background: #0D1017;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 0 60px rgba(0,212,255,0.08);
  font-family: inherit;
}

.jarvis-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
  flex-wrap: wrap;
}
.jarvis-title {
  display: flex; align-items: center; gap: 8px;
  color: #00D4FF; font-weight: 700; font-size: 14px; letter-spacing: 0.5px;
}
.jarvis-equip-badge { font-size: 12px; filter: drop-shadow(0 0 4px rgba(0,212,255,0.6)); }


.jarvis-controls { display: flex; align-items: center; gap: 6px; position: relative; }

.jarvis-toggle-btn {
  display: flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; border-radius: 8px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  cursor: pointer; transition: all 0.2s ease;
}
.jarvis-toggle-btn.on { color: #00D4FF; border-color: rgba(0,212,255,0.35); background: rgba(0,212,255,0.08); }
.jarvis-toggle-btn.off { color: #5A6678; }
.jarvis-toggle-btn:hover { border-color: rgba(0,212,255,0.4); }

.jarvis-mode-select { position: relative; }
.jarvis-mode-btn {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  color: #B0C0D8; font-size: 11px; padding: 6px 10px; border-radius: 8px; cursor: pointer;
  white-space: nowrap; transition: border-color 0.2s ease;
}
.jarvis-mode-btn:hover { border-color: rgba(0,212,255,0.4); }
.jarvis-mode-icon { font-size: 13px; line-height: 1; }

.jarvis-mode-menu {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: #12151D; border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 6px; min-width: 170px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4); z-index: 20;
  display: flex; flex-direction: column; gap: 2px;
}
.jarvis-mode-option {
  display: flex; align-items: center; gap: 8px;
  background: transparent; border: none; color: #B0C0D8;
  font-size: 12px; padding: 8px 10px; border-radius: 6px; cursor: pointer;
  text-align: left; transition: background 0.15s ease;
}
.jarvis-mode-option:hover { background: rgba(255,255,255,0.06); }
.jarvis-mode-option.active { color: #00D4FF; background: rgba(0,212,255,0.08); }

.jarvis-stop-speak {
  display: flex; align-items: center; gap: 6px;
  background: rgba(0,212,255,0.1); border: 1px solid rgba(0,212,255,0.35);
  color: #00D4FF; font-size: 10px; padding: 6px 8px; border-radius: 8px; cursor: pointer;
}
.jarvis-speak-pulse {
  width: 6px; height: 6px; border-radius: 50%; background: #00D4FF;
  animation: jarvis-pulse 1s infinite ease-in-out;
}
@keyframes jarvis-pulse {
  0%, 100% { opacity: 0.3; transform: scale(0.8); }
  50% { opacity: 1; transform: scale(1.2); }
}

.jarvis-messages {
  flex: 1; overflow-y: auto; padding: 16px;
  display: flex; flex-direction: column; gap: 12px;
}

.jarvis-msg { display: flex; gap: 8px; align-items: flex-start; max-width: 90%; }
.jarvis-msg.user { align-self: flex-end; flex-direction: row-reverse; }
.jarvis-msg.assistant { align-self: flex-start; }

.jarvis-msg-avatar {
  width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  color: #00D4FF;
}
.jarvis-msg.user .jarvis-msg-avatar { color: #B478FF; }

.jarvis-msg-bubble {
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 10px 12px; font-size: 13px; line-height: 1.5; color: #E4EAF2;
  white-space: pre-wrap; word-break: break-word;
}
.jarvis-msg.user .jarvis-msg-bubble { background: rgba(0,212,255,0.08); border-color: rgba(0,212,255,0.2); }

.jarvis-msg-voice-only {
  display: flex; align-items: center; gap: 6px; color: #8A94A8; font-style: italic; font-size: 12px;
}

.jarvis-msg-route {
  display: inline-block; margin-top: 6px; font-size: 9px; letter-spacing: 0.05em;
  color: #5A6678; text-transform: uppercase;
}

.jarvis-msg-loading { display: flex; align-items: center; gap: 8px; color: #8A94A8; }
.jarvis-spin { animation: jarvis-spin 1s linear infinite; }
@keyframes jarvis-spin { to { transform: rotate(360deg); } }

.jarvis-input-row {
  display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.02);
}
.jarvis-input-row input {
  flex: 1; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #fff; outline: none;
  transition: border-color 0.2s ease;
}
.jarvis-input-row input:focus { border-color: #00D4FF; }
.jarvis-input-row input:disabled { opacity: 0.6; }

.jarvis-input-row button {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 10px;
  background: linear-gradient(135deg, #00D4FF, #0090C8); border: none;
  color: #001018; cursor: pointer; transition: all 0.2s ease; flex-shrink: 0;
}
.jarvis-input-row button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,212,255,0.3); }
.jarvis-input-row button:disabled { opacity: 0.4; cursor: not-allowed; }

.jarvis-mic-btn {
  display: flex; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1);
  color: #8A94A8; cursor: pointer; transition: all 0.2s ease; flex-shrink: 0;
}
.jarvis-mic-btn:hover { border-color: rgba(0,212,255,0.4); color: #00D4FF; }
.jarvis-mic-btn.listening {
  background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.4);
  color: #F87171; animation: jarvis-pulse 1s infinite ease-in-out;
}

@media (max-width: 480px) {
  .jarvis-chat { max-width: 100%; height: 620px; border-radius: 0; }
  .jarvis-mode-label { display: none; }
}
`


