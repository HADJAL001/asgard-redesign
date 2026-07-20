import { Response, NextFunction } from "express"
import { requireAuth, AuthRequest } from "./authMiddleware"
import { UserModel } from "../models/user.model"

/** Требует валидный JWT + role='admin' в БД (проверяется свежим запросом, не из токена). */
export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (!UserModel.isAdmin(req.user!.userId)) {
      return res.status(403).json({ error: "Forbidden" })
    }
    next()
  })
}
