import { Router } from "express"
import { listRarestArtifacts, countRarestArtifacts, getRarestArtifactById } from "../lib/rarest-hall"
import { rateLimit } from "../middleware/rateLimiter"

/* ================================================================
   OSGARD · Публичный «Зал редчайших»  (/rarest)
   ----------------------------------------------------------------
   Ранжирует артефакты по craftScore (честность ковки), а не по
   доходу — см. lib/rarest-hall.ts. Без авторизации, только чтение.

     • GET /rarest      — топ по craftScore, новейшие вперёд при равенстве
     • GET /rarest/:id  — один артефакт зала (404, если craft_score NULL)

   Монтируется рядом с /certified — публичная read-only секция роутов.
   ================================================================ */

const router = Router()

router.get("/", rateLimit(60_000, 60), (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 60))
  const offset = Math.max(0, Number(req.query.offset) || 0)

  const artifacts = listRarestArtifacts(limit, offset)
  const total = countRarestArtifacts()

  res.json({ artifacts, total, limit, offset })
})

router.get("/:id", rateLimit(60_000, 60), (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ found: false, error: "Некорректный id" })
  }

  const artifact = getRarestArtifactById(id)
  if (!artifact) {
    return res.status(404).json({ found: false, message: "Артефакт не найден в зале редчайших." })
  }

  res.json({ found: true, artifact })
})

export default router
