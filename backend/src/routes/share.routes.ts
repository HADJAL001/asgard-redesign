import { Router, Request, Response } from "express"
import db from "../lib/db"
import { track, GrowthEvent } from "../lib/analytics"

/* ================================================================
   OSGARD · Публичные share-эндпоинты (БЕЗ авторизации)
   ----------------------------------------------------------------
   Нужны для виральной петли: когда юзер делится ссылкой на свой
   артефакт, соцкраулеры (Twitter/Facebook/Telegram) и Next-роут
   opengraph-image рендерят красивую карточку. Краулеры ходят без
   cookie, поэтому эндпоинт открытый — но отдаёт ТОЛЬКО безопасные,
   неперсональные поля: без owner_id/email, лишь публичное имя мастера.
   Отдельный файл (не artifacts.routes.ts), чтобы не конфликтовать с
   параллельной разработкой Кузницы.
   ================================================================ */

const router = Router()

/* GET /share/artifacts/:id — публичный минимальный вид артефакта. */
router.get("/artifacts/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid artifact id" })
  }

  const row = db
    .prepare(
      `SELECT a.id, a.name, a.type, a.rarity, a.power, a.defense, a.magic, a.speed,
              COALESCE(NULLIF(u.display_name, ''), u.username) AS owner
       FROM artifacts a
       JOIN users u ON u.id = a.owner_id
       WHERE a.id = ?`,
    )
    .get(id) as
    | {
        id: number
        name: string
        type: string
        rarity: string
        power: number
        defense: number
        magic: number
        speed: number
        owner: string
      }
    | undefined

  if (!row) return res.status(404).json({ error: "Artifact not found" })

  // Аналитика роста: вирусный охват — публичную карточку кто-то открыл
  // (переход по расшаренной ссылке / краул соцсети). Гостевое событие.
  track(GrowthEvent.ShareView, { meta: { artifactId: id } })

  // Краулеры и OG-роут могут кешировать — карточка меняется редко.
  res.set("Cache-Control", "public, max-age=300")
  res.json(row)
})

/* GET /share/deployed/:id — публичная витрина задеплоенного проекта
   (Output Trail): для футер-плашки "⚡ Built with OSGARD" и OG-карточки
   на /deploy-showcase/:id. Отдаёт только неперсональные поля. */
router.get("/deployed/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Invalid project id" })
  }

  const row = db
    .prepare(
      `SELECT p.id, p.name, p.description, p.live_url AS liveUrl, p.created_at AS createdAt,
              COALESCE(NULLIF(u.display_name, ''), u.username) AS owner,
              (SELECT MAX(finished_at) - MIN(started_at)
                 FROM generation_usage_runs
                WHERE project_id = p.id AND status = 'completed') AS durationMs
       FROM projects p
       JOIN users u ON u.id = p.user_id
       WHERE p.id = ? AND p.deploy_status = 'deployed' AND p.live_url IS NOT NULL`,
    )
    .get(id) as
    | {
        id: number
        name: string
        description: string | null
        liveUrl: string
        createdAt: number
        owner: string
        durationMs: number | null
      }
    | undefined

  if (!row) return res.status(404).json({ error: "Project not found or not deployed" })

  track(GrowthEvent.ShareView, { meta: { deployedProjectId: id } })

  res.set("Cache-Control", "public, max-age=300")
  res.json(row)
})

export default router
