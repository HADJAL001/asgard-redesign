import { Router } from "express"
import { AdminController } from "../controllers/admin.controller"
import { requireAdmin } from "../middleware/admin.middleware"

const router = Router()

router.use(requireAdmin)

router.get("/stats", AdminController.stats)
router.get("/users", AdminController.listUsers)
router.patch("/users/:id/role", AdminController.setRole)
router.patch("/users/:id/ban", AdminController.setBanned)
router.patch("/users/:id/grant", AdminController.grantTokens)
router.get("/logs", AdminController.listLogs)
router.get("/analytics/funnel", AdminController.funnel)
router.get("/analytics/retention", AdminController.retention)
router.get("/analytics/paywall-funnel", AdminController.paywallFunnel)

export default router
