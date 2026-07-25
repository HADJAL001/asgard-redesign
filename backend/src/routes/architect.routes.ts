import { Router } from "express"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { getArchitectState, ARCHITECT_TIERS } from "../lib/architect-progression"

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
  const architect = getArchitectState(req.user!.userId)
  res.json({
    architect,
    // Справочник тиров (ключ + порог) — чтобы фронт мог отрисовать всю лестницу.
    tiers: ARCHITECT_TIERS.map((t) => ({ key: t.key, name: t.name, minXp: t.minXp })),
  })
})

export default router
