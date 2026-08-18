import db from "./db"
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
