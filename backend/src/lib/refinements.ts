import db from "./db"
import { logAudit } from "./audit"
import type { RefinementKind } from "./refinement-kinds"

/* ================================================================
   refinements — ядро механики «Доработок» (домен Claude B).
   ----------------------------------------------------------------
   Доработка = AI-итерация уже существующего проекта. Экономика:
   первые FREE_REFINEMENTS_GRANT доработок бесплатны (грант на аккаунт),
   дальше — REFINEMENT_CREDIT_COST кредитов за штуку.

   Чистая БД-логика (без Express/JWT), тестируемая против in-memory БД
   (стиль lib/guest-service.ts / lib/artifact-fusion.ts). HTTP-обвязка
   (auth, списание, регенерация файлов) — в routes/projects.routes.ts.
   Остаток вычисляется как грант − COUNT(бесплатных строк) — общие
   таблицы не мутируются. Все db.prepare — lazy (внутри функций).
   ================================================================ */

/** Сколько доработок бесплатно на аккаунт. Паритет с FREE_REFINEMENTS_ON_SIGNUP
 *  во фронте (components/refinements-view.tsx) — держим согласованным. */
export const FREE_REFINEMENTS_GRANT = 3

/** Цена доработки в кредитах после исчерпания бесплатного гранта. */
export const REFINEMENT_CREDIT_COST = 20

/** Сколько бесплатных доработок пользователь уже израсходовал (cost_credits = 0). */
export function usedFreeRefinements(userId: number): number {
  const row = db
    // A failed run delivered no refinement and must not consume the user's grant.
    .prepare(
      `SELECT COUNT(*) AS n FROM project_refinements
       WHERE user_id = ? AND cost_credits = 0 AND status IN ('generating', 'ready')`,
    )
    .get(userId) as { n: number }
  return row?.n ?? 0
}

/** Остаток бесплатных доработок (никогда < 0). */
export function refinementsRemaining(userId: number): number {
  return Math.max(0, FREE_REFINEMENTS_GRANT - usedFreeRefinements(userId))
}

export interface RefinementRow {
  id: number
  userId: number
  projectId: number
  prompt: string
  kind: RefinementKind
  status: string
  costCredits: number
  createdAt: number
}

/** Записывает строку леджера доработки. Возвращает её id. */
export function recordRefinement(params: {
  userId: number
  projectId: number
  prompt: string
  kind: RefinementKind
  costCredits: number
}): number {
  const info = db
    .prepare(
      `INSERT INTO project_refinements (user_id, project_id, prompt, kind, status, cost_credits, created_at)
       VALUES (?, ?, ?, ?, 'generating', ?, ?)`,
    )
    .run(params.userId, params.projectId, params.prompt, params.kind, params.costCredits, Date.now())
  return Number(info.lastInsertRowid)
}

/** Обновляет статус строки доработки (generating → ready | failed). */
export function setRefinementStatus(refinementId: number, status: "ready" | "failed"): void {
  db.prepare(`UPDATE project_refinements SET status = ? WHERE id = ?`).run(status, refinementId)
}

export type FailedRefinementSettlement = {
  userId: number
  projectId: number
  refundedCredits: number
}

/**
 * Marks a terminally failed refinement and refunds a paid attempt exactly once.
 * The status transition is the idempotency guard: retries see `failed` and do
 * not credit the wallet again. When the durable worker already owns a broader
 * SQLite transaction, reuse it instead of opening a nested transaction.
 */
export function failRefinementWithRefund(refinementId: number): FailedRefinementSettlement | null {
  const settle = (): FailedRefinementSettlement | null => {
    const row = db
      .prepare(
        `SELECT user_id AS userId, project_id AS projectId, cost_credits AS costCredits
         FROM project_refinements WHERE id = ? AND status = 'generating'`,
      )
      .get(refinementId) as { userId: number; projectId: number; costCredits: number } | undefined
    if (!row) return null

    const transitioned = db
      .prepare(`UPDATE project_refinements SET status = 'failed' WHERE id = ? AND status = 'generating'`)
      .run(refinementId)
    if (transitioned.changes !== 1) return null

    const refundedCredits = Math.max(0, row.costCredits)
    if (refundedCredits > 0) {
      const wallet = db
        .prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`)
        .run(refundedCredits, Date.now(), row.userId)
      if (wallet.changes !== 1) throw new Error(`Wallet not found for failed refinement ${refinementId}`)
      logAudit(row.userId, "credit", refundedCredits, "project_refinement_refund", {
        projectId: row.projectId,
        refinementId,
      })
    }

    return { userId: row.userId, projectId: row.projectId, refundedCredits }
  }

  return db.inTransaction ? settle() : db.transaction(settle)()
}

/** Лента доработок проекта (свежие сверху) — для UI-истории. */
export function listProjectRefinements(projectId: number, limit = 20): RefinementRow[] {
  return db
    .prepare(
      `SELECT id, user_id AS userId, project_id AS projectId, prompt, kind, status,
              cost_credits AS costCredits, created_at AS createdAt
       FROM project_refinements WHERE project_id = ? ORDER BY id DESC LIMIT ?`,
    )
    .all(projectId, limit) as RefinementRow[]
}
