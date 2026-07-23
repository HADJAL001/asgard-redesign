import { Request, Response, NextFunction } from "express"
import { AuthService } from "../services/auth.service"
import { UserModel } from "../models/user.model"
import { captureError } from "../lib/sentry"

// AuthRequest использует глобальный тип req.user из express.d.ts
export type AuthRequest = Request

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Требуется авторизация", code: "NO_TOKEN" })
  }
  const token = header.slice("Bearer ".length)
  try {
    const payload = AuthService.verifyAccessToken(token)
    if (!payload || !payload.userId) {
      return res.status(401).json({ error: "Недействительный токен", code: "INVALID_TOKEN" })
    }
    if (UserModel.isBanned(payload.userId)) {
      return res.status(403).json({ error: "Аккаунт заблокирован", code: "ACCOUNT_BANNED" })
    }
    req.user = { userId: payload.userId }
    req.userId = payload.userId
    next()
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Токен истёк", code: "INVALID_TOKEN" })
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Недействительный токен", code: "INVALID_TOKEN" })
    }
    captureError("[authMiddleware] requireAuth error:", error)
    return res.status(500).json({ error: "Internal server error" })
  }
}

/** Optional auth: attaches user if token present & valid, but doesn't block request. */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length)
    try {
      const payload = AuthService.verifyAccessToken(token)
      if (payload && payload.userId) {
        req.user = { userId: payload.userId }
        req.userId = payload.userId
      }
    } catch {
      /* ignore invalid token for optional auth */
    }
  }
  next()
}

// Требует, чтобы у пользователя была привязана хотя бы одна соцсеть (см. UserModel.isLinked)
export function requireLinked(req: AuthRequest, res: Response, next: NextFunction) {
  const userId = req.userId ?? req.user?.userId
  if (!userId) {
    return res.status(401).json({ error: "Требуется авторизация", code: "NO_TOKEN" })
  }
  if (!UserModel.isLinked(userId)) {
    return res.status(403).json({ error: "Требуется привязка соцаккаунта", code: "LINK_REQUIRED" })
  }
  next()
}
