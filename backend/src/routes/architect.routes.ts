import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { getArchitectState, ARCHITECT_TIERS } from "../lib/architect-progression"
import { listUserBadges } from "../lib/user-badges"
import db from "../lib/db"

/* ================================================================
   OSGARD · «Мастерство Архитектора» — состояние прогрессии
   ----------------------------------------------------------------
   Только чтение. Отдаёт текущий тир пользователя, XP и прогресс к
   следующему тиру — для плашки в профиле. Начисление XP происходит
   аддитивно в существующих обработчиках (генерация/ковка/продажа)
   через lib/architect-progression.ts, здесь ничего не пишем.

   При отсутствии мигрированных колонок getArchitectState деградирует
   в нулевое состояние — новый юзер честно видит «Подмастерье, 0 XP».
   ================================================================ */

const router = Router()

/* ---------------- GET /architect/state ---------------- */
router.get("/state", requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const architect = getArchitectState(userId)
  const projectCount = (db.prepare(`SELECT COUNT(*) as count FROM projects WHERE user_id = ? AND status != 'failed'`).get(userId) as { count: number }).count
  const projectRanks = [1, 5, 10, 100].map((threshold, index) => ({ threshold, key: ["first_build", "maker", "architect", "legendary_builder"][index], achieved: projectCount >= threshold }))
  res.json({
    architect,
    projectCount,
    projectRanks,
    // Справочник тиров (ключ + порог) — чтобы фронт мог отрисовать всю лестницу.
    tiers: ARCHITECT_TIERS.map((t) => ({ key: t.key, name: t.name, minXp: t.minXp })),
  })
})

/* ---------------- GET /architect/badges ----------------
   Бейджи за стиль работы (🚀 Скорострел, 🧠 Философ, 🛡️ Чистюля, 🔥 На грани) —
   отдельная лестница от тира мастерства, см. lib/user-badges.ts. */
router.get("/badges", requireAuth, (req: AuthRequest, res) => {
  res.json({ badges: listUserBadges(req.user!.userId) })
})

export default router
