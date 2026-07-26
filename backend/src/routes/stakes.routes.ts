import { Router } from "express"
import db from "../lib/db"
import { requireAuth, AuthRequest } from "../middleware/authMiddleware"
import { fetchTreasuryTcForEmission, canEmitUnbackedSync } from "../lib/emission-guard"
import { runEconomyOp, EconomyError, normalizeIdemKey } from "../lib/economy-tx"

const router = Router()

const DAY_MS = 24 * 60 * 60 * 1000

/* APR зависит от срока стейка (чем дольше — тем выше ставка) */
function getApr(days: number): number {
  if (days >= 180) return 0.24
  if (days >= 90) return 0.18
  if (days >= 30) return 0.12
  if (days >= 7) return 0.06
  return 0.03
}

const MARKET_FEE = 0.02 // комиссия рынка при досрочном/обычном снятии, идёт в базу

/* Максимальная сумма одного стейка зависит от тарифа подписки: стейкинг доступен
   всем залогиненным (минимум крошечный — 0.001 на фронте), но потолок растёт с
   тарифом — чем дороже подписка, тем больше можно застейкать. */
const STAKE_MAX_BY_PLAN: Record<string, number> = {
  free: 100,
  pro: 1_000,
  supreme: 5_000,
  duo: 20_000,
  elite: 100_000,
}

/** Потолок одного стейка по тарифу. Чистая функция (без БД) — единственное
 *  место, где тариф превращается в число, и точка приложения тестов.
 *  Неизвестный/пустой тариф трактуется как free (консервативно). */
export function stakeMaxForPlan(plan: string | null | undefined): number {
  return STAKE_MAX_BY_PLAN[(plan as string) || "free"] ?? STAKE_MAX_BY_PLAN.free
}

/** Тариф пользователя + его потолок. Один источник правды для ПРОВЕРКИ в POST и
 *  для ПОКАЗА в GET — иначе фронт рисовал бы свой потолок, который со временем
 *  разъедется с фактически применяемым. */
function stakeLimitsFor(userId: number): { plan: string; maxStake: number } {
  const userRow: any = db.prepare(`SELECT plan FROM users WHERE id = ?`).get(userId)
  const plan = (userRow?.plan as string) || "free"
  return { plan, maxStake: stakeMaxForPlan(plan) }
}

/* ---------------- GET /stakes ----------------
   Отдаёт вместе со стейками ЛИМИТЫ тарифа. Раньше потолок жил только внутри
   POST: пользователь узнавал о нём лишь получив 400 уже ПОСЛЕ нажатия кнопки,
   а поле суммы принимало любое число и рисовало прогноз дохода по сумме,
   которую невозможно застейкать. Поле `limits` аддитивно — прежние читатели
   ответа (только `stakes`) не затронуты. */
router.get("/", requireAuth, (req: AuthRequest, res) => {
  const stakes = db
    .prepare(
      `SELECT id, amount_tc as amountTC, days, apr, market_fee as marketFee,
              start_ts as startTs, end_ts as endTs, status
       FROM stakes WHERE user_id = ? ORDER BY start_ts DESC`,
    )
    .all(req.user!.userId)

  res.json({ stakes, limits: stakeLimitsFor(req.user!.userId) })
})

/* ---------------- POST /stakes ---------------- */
router.post("/", requireAuth, (req: AuthRequest, res) => {
  const { amount, days } = req.body || {}
  const amountTc = Number(amount)
  const stakeDays = Number(days)
  const idemKey = normalizeIdemKey(req.header("Idempotency-Key") ?? (req.body as any)?.idempotencyKey)

  if (!amountTc || amountTc <= 0) {
    return res.status(400).json({ error: "Некорректная сумма стейка" })
  }
  if (!stakeDays || stakeDays <= 0) {
    return res.status(400).json({ error: "Некорректный срок стейка (в днях)" })
  }

  const wallet: any = db.prepare(`SELECT * FROM wallets WHERE user_id = ?`).get(req.user!.userId)
  if (!wallet) return res.status(404).json({ error: "Кошелёк не найден", code: "USER_NOT_FOUND" })
  if (wallet.timecoin < amountTc) {
    return res.status(400).json({ error: "Недостаточно TimeCoin" })
  }

  // Тот же источник правды, что отдаётся в GET /stakes → фронт показывает
  // ровно тот потолок, который здесь и применяется.
  const { plan, maxStake } = stakeLimitsFor(req.user!.userId)
  if (amountTc > maxStake) {
    return res.status(400).json({
      error: `Ваш тариф (${plan}) позволяет стейкать до ${maxStake} ∞ за раз. Повысьте тариф, чтобы стейкать больше.`,
      code: "STAKE_LIMIT",
      maxStake,
    })
  }

  const apr = getApr(stakeDays)
  const now = Date.now()
  const endTs = now + stakeDays * DAY_MS

  try {
    const opResult = runEconomyOp({
      userId: req.user!.userId,
      scope: "stake_create",
      idemKey,
      mutate: () => {
        // Авторитетное условное списание — источник правды на случай гонки
        // (пред-проверка выше — только для быстрого дружелюбного ответа).
        const debit = db
          .prepare(
            `UPDATE wallets SET timecoin = timecoin - ?, updated_at = ? WHERE user_id = ? AND timecoin >= ?`,
          )
          .run(amountTc, now, req.user!.userId, amountTc)
        if (debit.changes !== 1) {
          throw new EconomyError("Недостаточно TimeCoin", 400)
        }

        const info = db
          .prepare(
            `INSERT INTO stakes (user_id, amount_tc, days, apr, market_fee, start_ts, end_ts, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
          )
          .run(req.user!.userId, amountTc, stakeDays, apr, MARKET_FEE, now, endTs)

        db.prepare(`UPDATE tc_market_state SET staked = staked + ? WHERE id = 1`).run(amountTc)

        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'stake', 'TimeCoin Stake', 'Asgard Vault', ?, 'timecoin', 'done')`,
        ).run(req.user!.userId, amountTc)

        const stake = db
          .prepare(
            `SELECT id, amount_tc as amountTC, days, apr, market_fee as marketFee,
                    start_ts as startTs, end_ts as endTs, status
             FROM stakes WHERE id = ?`,
          )
          .get(Number(info.lastInsertRowid))

        return { stake }
      },
    })

    return res.status(201).json(opResult.result)
  } catch (err) {
    if (err instanceof EconomyError) {
      const body: Record<string, unknown> = { error: err.message }
      if (err.payload && typeof err.payload === "object") Object.assign(body, err.payload)
      return res.status(err.status).json(body)
    }
    throw err
  }
})

/* ---------------- POST /stakes/:id/unstake ---------------- */
router.post("/:id/unstake", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id)
  const idemKey = normalizeIdemKey(req.header("Idempotency-Key") ?? (req.body as any)?.idempotencyKey)
  const stake: any = db.prepare(`SELECT * FROM stakes WHERE id = ?`).get(id)

  if (!stake) return res.status(404).json({ error: "Стейк не найден" })
  if (stake.user_id !== req.user!.userId) {
    return res.status(403).json({ error: "Нет доступа к этому стейку" })
  }
  if (stake.status !== "active") {
    return res.status(400).json({ error: "Стейк уже снят" })
  }

  const now = Date.now()
  const isMatured = now >= stake.end_ts
  const elapsedMs = Math.min(now - stake.start_ts, stake.end_ts - stake.start_ts)
  const elapsedDays = elapsedMs / DAY_MS

  /* Награда пропорциональна прошедшему времени; при досрочном снятии — комиссия рынка */
  let reward = stake.amount_tc * stake.apr * (elapsedDays / 365)
  if (!isMatured) {
    reward = reward * (1 - stake.market_fee)
  }

  /* Проценты по стейку не обеспечены резервом (в отличие от самого тела
     стейка — оно уже принадлежало пользователю и просто возвращается).
     Если казна больше не покрывает весь ∞ 1:1, проценты не начисляем —
     тело стейка возвращается полностью в любом случае.

     Сетевой запрос баланса казны — до открытия транзакции (внутри неё
     нельзя await). Сама проверка "хватит ли резерва" ОБЯЗАНА выполняться
     синхронно внутри транзакции ниже, а не здесь — иначе конкурентное
     начисление из другого источника ∞-эмиссии могло бы проскочить между
     проверкой и записью. Поле stake.status, прочитанное ДО этого await,
     здесь больше не используется как факт — статус перезахватывается
     авторитетным условным UPDATE внутри mutate(), иначе два параллельных
     unstake-запроса на один и тот же стейк оба прошли бы эту проверку и
     оба зачислили бы деньги (двойная выплата). amount_tc/apr/даты стейка
     неизменны после создания, поэтому их безопасно брать из этого
     до-транзакционного чтения. */
  const treasuryTc = reward > 0 ? await fetchTreasuryTcForEmission() : null

  try {
    const opResult = runEconomyOp({
      userId: req.user!.userId,
      scope: "stake_unstake",
      idemKey,
      mutate: () => {
        if (reward > 0 && !(treasuryTc !== null && canEmitUnbackedSync(reward, treasuryTc))) {
          reward = 0
        }

        const totalReturn = stake.amount_tc + reward

        const claim = db
          .prepare(
            `UPDATE stakes SET status = 'unstaked' WHERE id = ? AND user_id = ? AND status = 'active'`,
          )
          .run(id, req.user!.userId)
        if (claim.changes !== 1) {
          throw new EconomyError("Стейк уже снят", 409)
        }

        db.prepare(`UPDATE tc_market_state SET staked = MAX(0, staked - ?) WHERE id = 1`).run(stake.amount_tc)

        db.prepare(
          `UPDATE wallets SET timecoin = timecoin + ?, updated_at = ? WHERE user_id = ?`,
        ).run(totalReturn, now, req.user!.userId)

        db.prepare(
          `INSERT INTO transactions (user_id, type, item, counterparty, amount, currency, status)
           VALUES (?, 'unstake', 'TimeCoin Unstake', 'Asgard Vault', ?, 'timecoin', 'done')`,
        ).run(req.user!.userId, totalReturn)

        const updatedStake = db
          .prepare(
            `SELECT id, amount_tc as amountTC, days, apr, market_fee as marketFee,
                    start_ts as startTs, end_ts as endTs, status
             FROM stakes WHERE id = ?`,
          )
          .get(id)

        return { stake: updatedStake, reward, totalReturn, matured: isMatured }
      },
    })

    return res.json(opResult.result)
  } catch (err) {
    if (err instanceof EconomyError) {
      const body: Record<string, unknown> = { error: err.message }
      if (err.payload && typeof err.payload === "object") Object.assign(body, err.payload)
      return res.status(err.status).json(body)
    }
    throw err
  }
})

export default router
