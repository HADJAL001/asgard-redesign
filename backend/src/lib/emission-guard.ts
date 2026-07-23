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

   canEmitUnbacked() — единая точка контроля перед КАЖДЫМ таким
   начислением: сверяет, что после начисления `amount` общий объём ∞
   в обращении всё ещё не превысит баланс казначейства (т.е. резерв
   остаётся способен покрыть все ∞ 1:1). Если нет — начисление
   отклоняется.

   ВАЖНО: это ограничивает только БУДУЩЕЕ начисление. Уже зачисленные
   пользователям балансы эта проверка никогда не уменьшает и не трогает.

   Fail-closed: если баланс казначейства невозможно проверить (Solana
   не сконфигурирован, сеть недоступна и т.п.), начисление ЗАПРЕЩАЕТСЯ —
   риск превышения резерва хуже, чем временно недоступный бонус.
   ================================================================ */

const solanaService = new SolanaService()

export async function canEmitUnbacked(amount: number): Promise<boolean> {
  if (!(amount > 0)) return true

  try {
    const treasuryTc = await solanaService.getTreasuryBalance()
    const row = db.prepare(`SELECT COALESCE(SUM(timecoin), 0) as total FROM wallets`).get() as { total: number }
    return row.total + amount <= treasuryTc
  } catch (err) {
    captureError("[emission-guard] reserve check failed, blocking unbacked emission:", err)
    return false
  }
}
