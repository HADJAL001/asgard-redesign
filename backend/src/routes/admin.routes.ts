import { Router } from "express"
import { AdminController } from "../controllers/admin.controller"
import { requireAdmin } from "../middleware/admin.middleware"
import { adminAuditMiddleware } from "../lib/admin-audit"

const router = Router()

router.use(requireAdmin)
// Автоматический аудит всех админ-запросов (предохранитель поверх ручных логов).
router.use(adminAuditMiddleware)

router.get("/stats", AdminController.stats)
router.get("/users", AdminController.listUsers)
router.patch("/users/:id/role", AdminController.setRole)
router.patch("/users/:id/ban", AdminController.setBanned)
router.patch("/users/:id/grant", AdminController.grantTokens)
router.get("/logs", AdminController.listLogs)
router.get("/analytics/funnel", AdminController.funnel)
router.get("/analytics/retention", AdminController.retention)
router.get("/analytics/paywall-funnel", AdminController.paywallFunnel)
router.get("/analytics/growth", AdminController.growth)
router.get("/analytics/integrity", AdminController.integrity)
router.get("/analytics/security", AdminController.security)
router.get("/analytics/guest-funnel", AdminController.guestFunnel)

export default router
