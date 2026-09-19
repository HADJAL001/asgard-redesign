import { Router } from "express"
import { AdminController } from "../controllers/admin.controller"
import { requireAdmin } from "../middleware/admin.middleware"
import { adminAuditMiddleware } from "../lib/admin-audit"
import { logAudit } from "../lib/audit"
import { getAlphaRelease, publishAlphaRelease } from "../lib/secret-room-alpha"

const router = Router()

router.use(requireAdmin)
// Автоматический аудит всех админ-запросов (предохранитель поверх ручных логов).
router.use(adminAuditMiddleware)

router.get("/stats", AdminController.stats)
router.get("/users", AdminController.listUsers)
router.patch("/users/:id/role", AdminController.setRole)
router.patch("/users/:id/ban", AdminController.setBanned)
router.patch("/users/:id/grant", AdminController.grantTokens)
router.post("/users/:id/promo-credits", AdminController.grantPromoCredits)
router.post("/test-artifacts", AdminController.createTestArtifact)
router.get("/logs", AdminController.listLogs)
router.get("/analytics/funnel", AdminController.funnel)
router.get("/analytics/retention", AdminController.retention)
router.get("/analytics/paywall-funnel", AdminController.paywallFunnel)
router.get("/analytics/growth", AdminController.growth)
router.get("/analytics/integrity", AdminController.integrity)
router.get("/analytics/security", AdminController.security)
router.get("/analytics/guest-funnel", AdminController.guestFunnel)
router.get("/analytics/guest-hygiene", AdminController.guestHygiene)
router.get("/analytics/generation-budget", AdminController.generationBudget)
router.get("/secret-room/alpha-release", (_req, res) => {
  res.json({ release: getAlphaRelease() })
})
router.post("/secret-room/alpha-release", (req, res) => {
  const version = typeof req.body?.version === "string" ? req.body.version : ""
  const notes = typeof req.body?.notes === "string" ? req.body.notes : ""
  try {
    const release = publishAlphaRelease(version, notes)
    logAudit(req.user!.userId, "credit", 0, "secret_room_alpha_release_published", { version: release.version })
    res.status(201).json({ release })
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Invalid alpha release" })
  }
})

export default router
