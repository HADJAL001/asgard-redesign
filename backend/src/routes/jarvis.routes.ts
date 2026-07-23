import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { UserModel } from "../models/user.model"
import {
  askJarvis,
  clearJarvisCache,
  clearJarvisCacheForUser,
  getJarvisCacheStats,
  getStoredJarvisMode,
  isAnyProviderConfigured,
} from "../services/jarvis.service"
import { ALL_MODES, MODE_ICONS, MODE_LABELS, isValidMode } from "../services/jarvis-personality.service"
import {
  VOICE_STYLE_ICONS,
  VOICE_STYLE_KEYS,
  VOICE_STYLE_LABELS,
  isElevenLabsConfigured,
  isValidVoiceStyle,
  synthesizeSpeech,
} from "../services/elevenlabs"
import { captureError } from "../lib/sentry"

const router = Router()

/* ================================================================
   POST /jarvis/ask
   Задать вопрос ДЖАРВИСУ.

   body: { question: string, mode?: JarvisMode }
   Если передан валидный mode — он сохраняется как новое предпочтение
   пользователя (upsert в jarvis_personality), иначе применяется ранее
   сохранённый режим (по умолчанию — "default").

   Маршрутизация (см. jarvis.service.ts):
     1. Кеш (in-memory, per-user, per-mode, TTL 15 мин)
     2. Локальные ответы (баланс/артефакты/проекты) — из БД, без AI
     3. DeepSeek / Grok / Claude — в зависимости от сложности вопроса
   ================================================================ */
router.post("/ask", requireAuth, async (req: AuthRequest, res) => {
  const { question, mode } = req.body || {}

  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "Поле 'question' обязательно и должно быть непустой строкой" })
  }

  if (mode !== undefined && !isValidMode(mode)) {
    return res.status(400).json({ error: `Поле 'mode' должно быть одним из: ${ALL_MODES.join(", ")}` })
  }

  try {
    const result = await askJarvis(req.user!.userId, question, mode)
    res.json({
      answer: result.answer,
      route: result.route,
      cached: result.cached,
      mode: result.mode,
      icon: result.icon,
      label: result.label,
      aiConfigured: isAnyProviderConfigured(),
      orchestratorChainId: result.orchestratorChainId ?? null,
    })
  } catch (err: any) {
    captureError("[jarvis/ask] error:", err)
    res.status(500).json({ error: err.message || "Не удалось получить ответ от ДЖАРВИСА" })
  }
})

/* ================================================================
   GET /jarvis/personality
   Возвращает сохранённый режим личности ДЖАРВИСА для текущего пользователя
   (для начальной гидратации фронта) + справочник всех режимов.
   ================================================================ */
router.get("/personality", requireAuth, (req: AuthRequest, res) => {
  const mode = getStoredJarvisMode(req.user!.userId)
  res.json({
    mode,
    icon: MODE_ICONS[mode],
    label: MODE_LABELS[mode],
    modes: ALL_MODES.map((m) => ({ mode: m, icon: MODE_ICONS[m], label: MODE_LABELS[m] })),
  })
})

/* ================================================================
   GET /jarvis/voice-styles
   Справочник голосовых стилей ElevenLabs (для выбора в UI «Голос»).
   ================================================================ */
router.get("/voice-styles", requireAuth, (_req: AuthRequest, res) => {
  res.json({
    configured: isElevenLabsConfigured(),
    styles: VOICE_STYLE_KEYS.map((style) => ({ style, icon: VOICE_STYLE_ICONS[style], label: VOICE_STYLE_LABELS[style] })),
  })
})

/* ================================================================
   POST /jarvis/speak
   Синтез речи через ElevenLabs.

   body: { text: string, style?: VoiceStyle } (по умолчанию — "calm")
   Возвращает audio/mpeg байты. Если ключ не задан или провайдер
   недоступен — 503, фронт делает fallback на браузерный TTS.
   ================================================================ */
router.post("/speak", requireAuth, async (req: AuthRequest, res) => {
  const { text, style = "calm" } = req.body || {}

  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Поле 'text' обязательно и должно быть непустой строкой" })
  }
  if (!isValidVoiceStyle(style)) {
    return res.status(400).json({ error: `Поле 'style' должно быть одним из: ${VOICE_STYLE_KEYS.join(", ")}` })
  }
  if (!isElevenLabsConfigured()) {
    return res.status(503).json({ error: "Голосовой синтез не настроен" })
  }

  try {
    const audio = await synthesizeSpeech(text.slice(0, 2000), style)
    if (!audio) {
      return res.status(502).json({ error: "Не удалось синтезировать речь" })
    }
    res.setHeader("Content-Type", "audio/mpeg")
    res.send(audio)
  } catch (err: any) {
    captureError("[jarvis/speak] error:", err)
    res.status(500).json({ error: err.message || "Не удалось синтезировать речь" })
  }
})

/* ================================================================
   DELETE /jarvis/cache
   Очистить кеш ДЖАРВИСА.

   query: ?scope=mine (по умолчанию) — очистить кеш только текущего пользователя
          ?scope=all  — очистить весь кеш (все пользователи)
   ================================================================ */
router.delete("/cache", requireAuth, (req: AuthRequest, res) => {
  const scope = (req.query.scope as string) || "mine"

  if (scope === "all") {
    if (!UserModel.isAdmin(req.user!.userId)) {
      return res.status(403).json({ error: "Forbidden" })
    }
    const removed = clearJarvisCache()
    return res.json({ success: true, scope: "all", removed })
  }

  const removed = clearJarvisCacheForUser(req.user!.userId)
  res.json({ success: true, scope: "mine", removed })
})

/* ================================================================
   GET /jarvis/cache/stats
   Статистика кеша (размер, TTL) — для отладки/мониторинга.
   ================================================================ */
router.get("/cache/stats", requireAuth, (_req: AuthRequest, res) => {
  res.json({ ...getJarvisCacheStats(), aiConfigured: isAnyProviderConfigured() })
})

export default router
