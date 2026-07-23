import { Router, Response, NextFunction } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { AddonProduct, hasActiveAddon } from "../lib/addons"
import { getAddonProgress, awardAddonXp } from "../lib/addonProgression"
import { asyncHandler } from "../utils/async-handler"

/* ================================================================
   OSGARD COURSES ROUTES — обучение по ДЖАРВИС/ВАЛЛИ Premium

   Каталог курсов (courses) гейтится Premium-подпиской продукта и,
   для некоторых курсов, достигнутым тиром 'elite' (required_tier,
   см. migration 058). Прогресс — course_progress.
   ================================================================ */

const router = Router()

function productAddonKey(product: string): "jarvis_premium" | "walli_premium" | null {
  if (product === "jarvis") return "jarvis_premium"
  if (product === "walli") return "walli_premium"
  return null
}

function requireProductAddon(req: AuthRequest, res: Response, next: NextFunction) {
  const product = req.params.product
  const addonKey = productAddonKey(product)
  if (!addonKey) {
    return res.status(400).json({ error: "Некорректный продукт. Допустимые значения: jarvis, walli" })
  }
  if (!req.user) {
    return res.status(401).json({ error: "Требуется авторизация" })
  }
  if (!hasActiveAddon(req.user.userId, addonKey)) {
    return res.status(403).json({ error: `Требуется активная подписка: ${addonKey}.`, addonKey })
  }
  next()
}

type CourseRow = {
  id: number
  product: AddonProduct
  course_key: string
  title: string
  description: string | null
  required_tier: "premium" | "elite"
  order_index: number
  xp_reward: number
}

type CourseProgressRow = {
  course_id: number
  status: "in_progress" | "completed"
  progress_pct: number
  started_at: number
  completed_at: number | null
}

/* ================================================================
   GET /addons/courses/:product
   Возвращает каталог курсов продукта с прогрессом текущего
   пользователя и флагом locked для курсов required_tier='elite',
   если пользователь ещё не достиг tier='elite'.
   ================================================================ */
router.get("/:product", requireAuth, requireProductAddon, (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const product = req.params.product as AddonProduct

  const courses = db
    .prepare(`SELECT * FROM courses WHERE product = ? ORDER BY order_index ASC`)
    .all(product) as CourseRow[]

  const progressRows = db
    .prepare(
      `SELECT cp.* FROM course_progress cp JOIN courses c ON c.id = cp.course_id WHERE cp.user_id = ? AND c.product = ?`,
    )
    .all(userId, product) as CourseProgressRow[]
  const progressByCourse = new Map(progressRows.map((p) => [p.course_id, p]))

  const userTier = getAddonProgress(userId, product)?.tier ?? "premium"

  res.json({
    product,
    tier: userTier,
    courses: courses.map((c) => {
      const locked = c.required_tier === "elite" && userTier !== "elite"
      const progress = progressByCourse.get(c.id)
      return {
        courseKey: c.course_key,
        title: c.title,
        description: c.description,
        requiredTier: c.required_tier,
        xpReward: c.xp_reward,
        locked,
        status: progress?.status ?? "not_started",
        progressPct: progress?.progress_pct ?? 0,
      }
    }),
  })
})

/* ================================================================
   POST /addons/courses/:product/:courseKey/progress
   body: { progressPct: number, status?: 'in_progress' | 'completed' }
   ================================================================ */
router.post("/:product/:courseKey/progress", requireAuth, requireProductAddon, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId
  const product = req.params.product as AddonProduct
  const { courseKey } = req.params
  const { progressPct, status } = req.body || {}

  if (typeof progressPct !== "number" || progressPct < 0 || progressPct > 100) {
    return res.status(400).json({ error: "progressPct должен быть числом от 0 до 100." })
  }

  const course = db
    .prepare(`SELECT * FROM courses WHERE product = ? AND course_key = ?`)
    .get(product, courseKey) as CourseRow | undefined
  if (!course) {
    return res.status(404).json({ error: "Курс не найден." })
  }

  if (course.required_tier === "elite") {
    const userTier = getAddonProgress(userId, product)?.tier ?? "premium"
    if (userTier !== "elite") {
      return res.status(403).json({ error: "Этот курс доступен только пользователям с тиром 'elite'." })
    }
  }

  const resolvedStatus: "in_progress" | "completed" =
    status === "completed" || progressPct >= 100 ? "completed" : "in_progress"
  const now = Date.now()

  const existing = db
    .prepare(`SELECT * FROM course_progress WHERE user_id = ? AND course_id = ?`)
    .get(userId, course.id) as CourseProgressRow | undefined

  const justCompleted = resolvedStatus === "completed" && existing?.status !== "completed"

  if (!existing) {
    db.prepare(
      `INSERT INTO course_progress (user_id, course_id, status, progress_pct, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, course.id, resolvedStatus, progressPct, now, resolvedStatus === "completed" ? now : null)
  } else {
    db.prepare(
      `UPDATE course_progress SET status = ?, progress_pct = ?, completed_at = ? WHERE user_id = ? AND course_id = ?`,
    ).run(
      resolvedStatus,
      progressPct,
      resolvedStatus === "completed" ? (existing.completed_at ?? now) : null,
      userId,
      course.id,
    )
  }

  /* XP за курс начисляется один раз — при первом переходе в 'completed'.
     Повторные PATCH-запросы (например с тем же progressPct=100) не должны
     накручивать опыт бесконечно, т.к. awardAddonXp сам по себе не идемпотентен. */
  let progressResult = null
  if (justCompleted && course.xp_reward > 0) {
    progressResult = awardAddonXp(userId, product, `course_completed:${courseKey}`, course.xp_reward)
  }

  res.json({
    courseKey,
    status: resolvedStatus,
    progressPct,
    xpAwarded: justCompleted ? course.xp_reward : 0,
    progress: progressResult,
  })
}))

export default router
