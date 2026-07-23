import db from "./db"
import { SolanaService } from "../services/solana.service"
import { captureError } from "./sentry"

/* ================================================================
   OSGARD · Emission Guard
   ----------------------------------------------------------------
   Часть источников начисления ∞ (реферальный бонус, демо-бонус,
   промокоды, стейкинг-проценты, бонус за отзыв, эмиссия при покупке
   на внутреннем TC-market) не обеспечены реальными TC в казначействе
   Solana — это "печать" новых ∞ из воздуха.

   emitUnbacked() — единая точка контроля перед КАЖДЫМ таким
   начислением: сверяет, что после начисления `amount` общий объём ∞
   в обращении всё ещё не превысит баланс казначейства (т.е. резерв
   остаётся способен покрыть все ∞ 1:1), и если да — выполняет сами
   SQL-мутации начисления внутри SQLite BEGIN IMMEDIATE.

   Все источники эмиссии делят одно и то же SQLite-соединение
   (см. lib/db.ts) — эксклюзивная блокировка BEGIN IMMEDIATE поэтому
   сериализует их МЕЖДУ СОБОЙ, а не только вызовы одного роута:
   конкурентный вызов из другого источника эмиссии обязан дождаться
   COMMIT текущего и увидит уже учтённый в SUM(wallets.timecoin)
   результат. Без этого два независимых источника, каждый по
   отдельности проверивший резерв ДО начисления, могли одновременно
   пройти проверку и суммарно превысить резерв (TOCTOU).

   ВАЖНО: это ограничивает только БУДУЩЕЕ начисление. Уже зачисленные
   пользователям балансы эта проверка никогда не уменьшает и не трогает.

   Fail-closed: если баланс казначейства невозможно проверить (Solana
   не сконфигурирован, сеть недоступна и т.п.), начисление ЗАПРЕЩАЕТСЯ —
   риск превышения резерва хуже, чем временно недоступный бонус.
   ================================================================ */

const solanaService = new SolanaService()

/** Сетевая часть: получает баланс казны с fail-closed обработкой ошибок.
 *  Вызывается ДО открытия транзакции (внутри неё нельзя делать await). */
export async function fetchTreasuryTcForEmission(): Promise<number | null> {
  try {
    return await solanaService.getTreasuryBalance()
  } catch (err) {
    captureError("[emission-guard] reserve check failed, blocking unbacked emission:", err)
    return null
  }
}

/** Синхронная часть проверки. ОБЯЗАТЕЛЬНО вызывать внутри уже открытой
 *  BEGIN IMMEDIATE транзакции — иначе проверка не защищает от TOCTOU. */
export function canEmitUnbackedSync(amount: number, treasuryTc: number): boolean {
  if (!(amount > 0)) return true
  const row = db.prepare(`SELECT COALESCE(SUM(timecoin), 0) as total FROM wallets`).get() as { total: number }
  return row.total + amount <= treasuryTc
}

/**
 * Для самодостаточных случаев: получает баланс казны, открывает
 * BEGIN IMMEDIATE, проверяет резерв и, если он покрывает `amount`,
 * синхронно выполняет `mutate` (сами SQL-мутации начисления) в той же
 * транзакции, иначе откатывает её без вызова `mutate`.
 *
 * `mutate` ДОЛЖЕН быть полностью синхронным (без await) — иначе
 * event loop может выполнить другой JS-код внутри открытой транзакции.
 *
 * Если начисление нужно объединить с УЖЕ существующей транзакцией
 * вызывающего кода (нельзя открыть вложенный BEGIN IMMEDIATE) —
 * используйте fetchTreasuryTcForEmission()/canEmitUnbackedSync()
 * напрямую внутри этой транзакции.
 */
export async function emitUnbacked<T>(
  amount: number,
  mutate: () => T,
): Promise<{ ok: true; result: T } | { ok: false }> {
  if (!(amount > 0)) {
    return { ok: true, result: mutate() }
  }

  const treasuryTc = await fetchTreasuryTcForEmission()
  if (treasuryTc === null) return { ok: false }

  db.exec("BEGIN IMMEDIATE")
  try {
    if (!canEmitUnbackedSync(amount, treasuryTc)) {
      db.exec("ROLLBACK")
      return { ok: false }
    }
    const result = mutate()
    db.exec("COMMIT")
    return { ok: true, result }
  } catch (err) {
    db.exec("ROLLBACK")
    throw err
  }
}
