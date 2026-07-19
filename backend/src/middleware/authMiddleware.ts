import { Request, Response, NextFunction } from "express"
import { verifyToken } from "../lib/auth"

// AuthRequest использует глобальный тип req.user из express.d.ts
export type AuthRequest = Request

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Требуется авторизация" })
  }
  const token = header.slice("Bearer ".length)
  try {
    const payload = verifyToken(token)
    req.user = { userId: payload.userId, username: payload.username }
    next()
  } catch {
    return res.status(401).json({ error: "Недействительный или истёкший токен" })
  }
}

/** Optional auth: attaches user if token present & valid, but doesn't block request. */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length)
    try {
      const payload = verifyToken(token)
      req.user = { userId: payload.userId, username: payload.username }
    } catch {
      /* ignore invalid token for optional auth */
    }
  }
  next()
}
