import { Request, Response, NextFunction } from "express"
import db from "./db"
import { AuthRequest } from "../middleware/authMiddleware"
import { captureError } from "./sentry"

/* ================================================================
   OSGARD · Аудит действий администратора (admin_logs)
   ----------------------------------------------------------------
   Единая точка записи журнала админ-действий. Даёт две вещи:

   1. recordAdminAction(req, ...) — ручная запись с богатым meta для
      конкретных мутаций (смена роли/бана/начисление). Дополнительно
      фиксирует IP и User-Agent источника.

   2. adminAuditMiddleware — автоматический «предохранитель»: логирует
      ЛЮБОЙ запрос к админ-роутам (в т.ч. read-only доступ к PII и любые
      новые мутирующие ручки, которые забыли обложить ручным логом).
      Дедуп: если контроллер уже сделал ручную запись, авто-запись
      пропускается (флаг req.__adminAudited).

   Отделено от финансового audit_log (lib/audit.ts) — там дебет/кредит ∞,
   здесь действия администраторов над пользователями и системой.
   ================================================================ */

// Расширяем request флагом дедупликации (не конфликтует с express-типами).
type AuditedRequest = AuthRequest & { __adminAudited?: boolean }

/* Клиентский IP. На Railway приложение стоит за прокси, поэтому req.ip без
   trust proxy вернул бы адрес прокси. Берём первый (левый) адрес из
   X-Forwarded-For — это исходный клиент. Фолбэк — req.ip/сокет. */
export function getClientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"]
  if (typeof xff === "string" && xff.length > 0) {
    return xff.split(",")[0].trim()
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(",")[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || null
}

export function getUserAgent(req: Request): string | null {
  const ua = req.headers["user-agent"]
  return typeof ua === "string" ? ua.slice(0, 500) : null
}

function writeRow(params: {
  adminId: number
  action: string
  targetUserId: number | null
  meta: Record<string, any> | null
  ip: string | null
  userAgent: string | null
  status: number | null
}) {
  db.prepare(
    `INSERT INTO admin_logs (admin_id, action, target_user_id, meta, ip, user_agent, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.adminId,
    params.action,
    params.targetUserId,
    params.meta ? JSON.stringify(params.meta) : null,
    params.ip,
    params.userAgent,
    params.status,
    Date.now(),
  )
}

/** Ручная запись действия администратора с IP/UA. Помечает запрос как
 *  проаудированный, чтобы авто-предохранитель не задвоил запись. */
export function recordAdminAction(
  req: AuthRequest,
  action: string,
  targetUserId: number | null,
  meta?: Record<string, any>,
): void {
  try {
    const adminId = req.user?.userId
    if (!adminId) return
    writeRow({
      adminId,
      action,
      targetUserId,
      meta: meta ?? null,
      ip: getClientIp(req),
      userAgent: getUserAgent(req),
      status: null,
    })
    ;(req as AuditedRequest).__adminAudited = true
  } catch (error) {
    captureError("Admin audit (manual) write error:", error)
  }
}

/* Нормализуем маршрут в стабильное имя действия: числовые сегменты (id)
   заменяем на :id, чтобы /admin/users/42/ban → users/:id/ban. */
function routeAction(req: Request): string {
  const base = (req.baseUrl || "").replace(/^\/+|\/+$/g, "")
  const path = (req.path || "").replace(/^\/+|\/+$/g, "")
  const norm = path
    .split("/")
    .map((seg) => (/^\d+$/.test(seg) ? ":id" : seg))
    .join("/")
  return `${req.method} ${[base, norm].filter(Boolean).join("/")}`
}

/** Автоматический аудит всех админ-запросов. Пишет запись по завершении
 *  ответа, если контроллер не сделал ручную (богатую) запись сам. */
export function adminAuditMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  res.on("finish", () => {
    try {
      if ((req as AuditedRequest).__adminAudited) return
      const adminId = req.user?.userId
      if (!adminId) return

      // Пытаемся вытащить целевого пользователя из /:id в пути.
      const idParam = (req.params && (req.params as any).id) || null
      const targetUserId = idParam && /^\d+$/.test(String(idParam)) ? Number(idParam) : null

      // meta — краткая сводка запроса (query для GET; для мутаций тело мог бы
      // содержать секреты, поэтому body целиком НЕ пишем).
      const meta: Record<string, any> = {}
      if (req.query && Object.keys(req.query).length > 0) meta.query = req.query

      writeRow({
        adminId,
        action: routeAction(req),
        targetUserId,
        meta: Object.keys(meta).length > 0 ? meta : null,
        ip: getClientIp(req),
        userAgent: getUserAgent(req),
        status: res.statusCode,
      })
    } catch (error) {
      captureError("Admin audit (auto) write error:", error)
    }
  })
  next()
}
