import { Router } from "express"
import { AdminController } from "../controllers/admin.controller"
import { requireAdmin } from "../middleware/admin.middleware"

const router = Router()

router.use(requireAdmin)

router.get("/stats", AdminController.stats)
router.get("/users", AdminController.listUsers)
router.patch("/users/:id/role", AdminController.setRole)
router.patch("/users/:id/ban", AdminController.setBanned)

export default router
