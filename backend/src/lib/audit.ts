import db from "./db"
import { captureError } from "./sentry"

/* ================================================================
   OSGARD · Audit Log
   ----------------------------------------------------------------
   Тонкая обёртка над audit_log (см. migrations/038_audit_log.ts).
   Никогда не бросает исключение наружу: сбой записи аудита не должен
   ронять или откатывать саму финансовую операцию, которую он логирует —
   при ошибке просто уходит в Sentry/консоль.
   ================================================================ */

export type AuditAction = "debit" | "credit" | "rejected"

export function logAudit(
  userId: number | null,
  action: AuditAction,
  amount: number,
  reason: string,
  meta?: Record<string, unknown>,
): void {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, amount, reason, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(userId, action, amount, reason, meta ? JSON.stringify(meta) : null, Date.now())
  } catch (err) {
    captureError("[audit] failed to write audit_log:", err)
  }
}
