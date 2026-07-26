import db from "./db"
import { runEconomyOp, EconomyError } from "./economy-tx"
import { logAudit } from "./audit"

/* ================================================================
   OSGARD · Экономика доработок проекта (метеринг «итеративной правки»)
   ----------------------------------------------------------------
   Спека A(2) воронки: первый проект — бесплатно (в т.ч. гостю), а
   ДОРАБОТКИ (повторный AI-прогон существующего проекта с уточнением)
   живут за стеной регистрации. Реальный аккаунт получает
   FREE_REFINEMENTS_ON_SIGNUP бесплатных доработок, дальше — за кредиты
   по цене standard-генерации (доработка = та же полная AI-регенерация).

   Три источника правды об остатке (users.refinements_remaining, миграция 089):
     • NULL   — грант ещё не «материализован» в БД. Эффективный остаток
                для реального аккаунта = FREE_REFINEMENTS_ON_SIGNUP.
                Материализуется при ПЕРВОЙ трате (ленивый декремент от FREE),
                чтения не пишут в БД (GET остаётся чистым).
     • число  — сколько бесплатных доработок осталось.
     • гость  — грант НЕ выдаётся: getRefinementsRemaining → null (стена).

   Метеринг траты идёт через runEconomyOp: одна транзакция (грант ИЛИ
   кредиты + запись в леджер project_refinements) + идемпотентность по
   Idempotency-Key (двойной клик/ретрай не спишет дважды). Реальную
   регенерацию файлов запускает вызывающий (lib/project-generation →
   refineProject) ПОСЛЕ успешной траты; при провале async-джоба трата
   честно возвращается (refundRefinement) — за неудачу не платят.
   ================================================================ */

/** Сколько бесплатных доработок получает реальный аккаунт (паритет с фронтовым
 *  FREE_REFINEMENTS_ON_SIGNUP в components/refinements-view.tsx). */
export const FREE_REFINEMENTS_ON_SIGNUP = 3

/** Цена платной доработки в кредитах после исчерпания бесплатных. Паритет со
 *  standard-глубиной генерации (GENERATION_DEPTHS.standard.credits) — доработка
 *  выполняет ровно ту же полную AI-регенерацию приложения. */
export const REFINEMENT_CREDIT_COST = 20

const ECONOMY_SCOPE = "project_refine"

type UserRefinementRow = { is_guest: number | null; refinements_remaining: number | null }

function readUserRefinementRow(userId: number): UserRefinementRow | undefined {
  return db
    .prepare(`SELECT is_guest, refinements_remaining FROM users WHERE id = ?`)
    .get(userId) as UserRefinementRow | undefined
}

/**
 * Эффективный остаток бесплатных доработок пользователя для витрины (/guest/status,
 * refinements-view). Чистое чтение — В БД НЕ ПИШЕТ.
 *   • null  — гость или несуществующий пользователь (доработки за стеной регистрации);
 *   • число — реальный аккаунт: refinements_remaining, а если он ещё NULL
 *             (грант не материализован) — FREE_REFINEMENTS_ON_SIGNUP.
 */
export function getRefinementsRemaining(userId: number): number | null {
  const row = readUserRefinementRow(userId)
  if (!row) return null
  if (row.is_guest) return null // стена регистрации — гость доработки не получает
  if (row.refinements_remaining === null) return FREE_REFINEMENTS_ON_SIGNUP
  return Math.max(0, row.refinements_remaining)
}

export interface RefinementCharge {
  /** id строки в project_refinements — для возврата траты при провале джоба. */
  refinementId: number
  /** Чем оплачено: 'grant' (бесплатная доработка) или 'credits' (списание). */
  paidWith: "grant" | "credits"
  /** Сколько кредитов списано (0 для 'grant'). */
  creditsCost: number
  /** Остаток бесплатных доработок ПОСЛЕ этой траты. */
  remaining: number
  /** true → повтор по Idempotency-Key: деньги/грант НЕ трогались, вернули прошлый результат. */
  replayed: boolean
}

/**
 * Атомарно и идемпотентно «оплачивает» одну доработку проекта: сперва тратит
 * бесплатный грант, при его исчерпании — списывает REFINEMENT_CREDIT_COST кредитов;
 * если и кредитов нет — бросает EconomyError(402). Гостю — EconomyError(403)
 * (стена регистрации). Пишет строку в project_refinements (леджер + защита от
 * двойной траты) в той же транзакции.
 *
 * НЕ запускает саму регенерацию — это делает вызывающий после успешной оплаты.
 * Idempotency-Key делает повторную доставку (двойной клик) ровно-однократной.
 */
export function consumeRefinement(params: {
  userId: number
  projectId: number
  hint?: string | null
  idemKey?: string | null
}): RefinementCharge {
  const { userId, projectId } = params
  const hint = typeof params.hint === "string" && params.hint.trim() ? params.hint.trim() : null

  const { result, replayed } = runEconomyOp<Omit<RefinementCharge, "replayed">>({
    userId,
    scope: ECONOMY_SCOPE,
    idemKey: params.idemKey,
    mutate: () => {
      const row = readUserRefinementRow(userId)
      if (!row) throw new EconomyError("Пользователь не найден", 404, { code: "USER_NOT_FOUND" })
      if (row.is_guest) {
        throw new EconomyError(
          "Доработки доступны после регистрации. Зарегистрируйтесь, чтобы дорабатывать проект.",
          403,
          { code: "GUEST_REFINEMENT_WALL" },
        )
      }

      // Ленивая материализация гранта: NULL трактуем как полный FREE-остаток.
      const currentFree = row.refinements_remaining === null ? FREE_REFINEMENTS_ON_SIGNUP : row.refinements_remaining
      const now = Date.now()

      if (currentFree > 0) {
        // Оплата бесплатным грантом: декремент остатка.
        const nextFree = currentFree - 1
        db.prepare(`UPDATE users SET refinements_remaining = ? WHERE id = ?`).run(nextFree, userId)
        const info = db
          .prepare(
            `INSERT INTO project_refinements (user_id, project_id, hint, paid_with, credits_cost, created_at)
             VALUES (?, ?, ?, 'grant', 0, ?)`,
          )
          .run(userId, projectId, hint, now)
        return {
          refinementId: Number(info.lastInsertRowid),
          paidWith: "grant" as const,
          creditsCost: 0,
          remaining: nextFree,
        }
      }

      // Бесплатные исчерпаны → списываем кредиты.
      const wallet = db.prepare(`SELECT credits FROM wallets WHERE user_id = ?`).get(userId) as
        | { credits: number }
        | undefined
      if (!wallet) throw new EconomyError("Кошелёк не найден", 402, { code: "NO_WALLET" })
      if (wallet.credits < REFINEMENT_CREDIT_COST) {
        throw new EconomyError(
          `Бесплатные доработки исчерпаны. Нужно ${REFINEMENT_CREDIT_COST} кредитов, доступно ${wallet.credits}.`,
          402,
          {
            code: "INSUFFICIENT_CREDITS",
            required: REFINEMENT_CREDIT_COST,
            available: wallet.credits,
          },
        )
      }

      db.prepare(`UPDATE wallets SET credits = credits - ?, updated_at = ? WHERE user_id = ?`).run(
        REFINEMENT_CREDIT_COST,
        now,
        userId,
      )
      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, 'project_refinement', ?, 'OSGARD', ?, 'credits', 'done')`,
      ).run(userId, `Доработка проекта #${projectId}`, REFINEMENT_CREDIT_COST)

      const info = db
        .prepare(
          `INSERT INTO project_refinements (user_id, project_id, hint, paid_with, credits_cost, created_at)
           VALUES (?, ?, ?, 'credits', ?, ?)`,
        )
        .run(userId, projectId, hint, REFINEMENT_CREDIT_COST, now)

      return {
        refinementId: Number(info.lastInsertRowid),
        paidWith: "credits" as const,
        creditsCost: REFINEMENT_CREDIT_COST,
        remaining: 0,
      }
    },
  })

  if (!replayed) {
    logAudit(userId, "debit", result.creditsCost, "project_refinement", {
      projectId,
      paidWith: result.paidWith,
    })
  }

  return { ...result, replayed }
}

/**
 * Возвращает трату доработки, если реальная работа не состоялась (async-джоб
 * регенерации упал). Восстанавливает грант ИЛИ кредиты по записи леджера и
 * удаляет строку project_refinements. Идемпотентно: повторный вызов с тем же
 * (уже удалённым) id — no-op. За неудачную доработку пользователь не платит.
 */
export function refundRefinement(refinementId: number): void {
  const reverse = db.transaction(() => {
    const row = db
      .prepare(
        `SELECT id, user_id, project_id, paid_with, credits_cost FROM project_refinements WHERE id = ?`,
      )
      .get(refinementId) as
      | { id: number; user_id: number; project_id: number; paid_with: "grant" | "credits"; credits_cost: number }
      | undefined
    if (!row) return // уже возвращено/не существует — no-op

    if (row.paid_with === "grant") {
      // Возврат бесплатной доработки: инкремент остатка (NULL → FREE как базу).
      db.prepare(
        `UPDATE users
            SET refinements_remaining = COALESCE(refinements_remaining, ?) + 1
          WHERE id = ?`,
      ).run(FREE_REFINEMENTS_ON_SIGNUP, row.user_id)
    } else if (row.credits_cost > 0) {
      // Возврат кредитов + компенсирующая транзакция для честного баланса.
      db.prepare(`UPDATE wallets SET credits = credits + ?, updated_at = ? WHERE user_id = ?`).run(
        row.credits_cost,
        Date.now(),
        row.user_id,
      )
      db.prepare(
        `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
         VALUES (?, 'project_refinement_refund', ?, 'OSGARD', ?, 'credits', 'done')`,
      ).run(row.user_id, `Возврат за несостоявшуюся доработку проекта #${row.project_id}`, row.credits_cost)
      logAudit(row.user_id, "credit", row.credits_cost, "project_refinement_refund", {
        projectId: row.project_id,
      })
    }

    db.prepare(`DELETE FROM project_refinements WHERE id = ?`).run(refinementId)
  })

  reverse()
}
