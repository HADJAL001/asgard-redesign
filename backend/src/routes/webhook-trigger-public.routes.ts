import { Router } from "express"
import { getWebhookTriggerByToken, recordWebhookTrigger } from "../services/orchestrator-webhook.service"
import { getChain, runChainForUser } from "../services/orchestrator.service"
import { rateLimit } from "../middleware/rateLimiter"
import { asyncHandler } from "../utils/async-handler"

/* ================================================================
   OSGARD · Webhook Trigger — публичный inbound роут
   ----------------------------------------------------------------
   POST /wh/:token — вызывается внешним сервисом (без auth). token —
   единственный секрет. Тело запроса приходит как raw Buffer (роут
   смонтирован в server.ts через express.raw() ДО express.json()),
   поэтому парсим JSON вручную; невалидный/пустой body — не ошибка,
   просто передаём "{}" дальше по цепочке (см. решение: узел
   webhook_trigger — чистый passthrough).

   Списание TimeCoin — через тот же runChainForUser(), что и ручной
   запуск (POST /chains/:id/run) и команда ДЖАРВИСА — единая
   транзакционная логика биллинга, без отдельного тарифа для webhook.
   ================================================================ */

const router = Router()

router.post(
  "/:token",
  rateLimit(60_000, 30, (req) => `wh:${req.params.token}`),
  asyncHandler(async (req, res) => {
    const trigger = getWebhookTriggerByToken(req.params.token)
    if (!trigger || trigger.enabled !== 1) {
      return res.status(404).json({ error: "Триггер не найден" })
    }

    const chain = getChain(trigger.user_id, trigger.chain_id)
    if (!chain) {
      return res.status(404).json({ error: "Цепочка не найдена" })
    }

    let payload: unknown = {}
    if (Buffer.isBuffer(req.body) && req.body.length > 0) {
      try {
        payload = JSON.parse(req.body.toString("utf8"))
      } catch {
        payload = req.body.toString("utf8")
      }
    }

    const result = runChainForUser(trigger.user_id, chain, JSON.stringify(payload))
    if ("error" in result) {
      return res.status(402).json({ error: "insufficient_balance" })
    }

    recordWebhookTrigger(trigger.id)
    res.status(202).json({ executionId: result.executionId })
  }),
)

export default router
