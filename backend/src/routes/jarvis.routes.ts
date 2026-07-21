import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import {
  askJarvis,
  clearJarvisCache,
  clearJarvisCacheForUser,
  getJarvisCacheStats,
  getStoredJarvisMode,
  isAnyProviderConfigured,
} from "../services/jarvis.service"
import { ALL_MODES, MODE_ICONS, MODE_LABELS, isValidMode } from "../services/jarvis-personality.service"

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
    })
  } catch (err: any) {
    console.error("[jarvis/ask] error:", err)
    res.status(500).json({ error: err.message || "Не удалось получить ответ от ДЖАРВИСА" })
  }
})

/* ================================================================
   GET /jarvis/personality
   Возвращает сохранённый режим личности ВАЛЛИ для текущего пользователя
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
   DELETE /jarvis/cache
   Очистить кеш ДЖАРВИСА.

   query: ?scope=mine (по умолчанию) — очистить кеш только текущего пользователя
          ?scope=all  — очистить весь кеш (все пользователи)
   ================================================================ */
router.delete("/cache", requireAuth, (req: AuthRequest, res) => {
  const scope = (req.query.scope as string) || "mine"

  if (scope === "all") {
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
