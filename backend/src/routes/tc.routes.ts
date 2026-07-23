import { Router, Request, Response } from 'express';
import { Connection, PublicKey } from '@solana/web3.js';
import { requireAuth } from '../middleware/authMiddleware';
import { rateLimit } from '../middleware/rateLimiter';
import { SolanaService } from '../services/solana.service';
import { withdrawSchema } from '../validators/withdraw.validator';
import { depositSchema } from '../validators/deposit.validator';
import { TwoFAService } from '../services/twofa.service';
import db from '../lib/db';
import { captureError } from '../lib/sentry';
import { logAudit } from '../lib/audit';

const router = Router();
const solanaService = new SolanaService();
const TC_CONVERT_FEE = 0.005;

// ========== ТИПЫ ==========

interface WithdrawalStats {
  count: number;
  totalAmount: number;
}

interface DailyStats {
  totalAmount: number;
}

interface UserRow {
  nonce: number;
}

// ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

// Проверка валидности Solana адреса
function isValidSolanaAddress(address: string): boolean {
  try {
    if (address.length < 32 || address.length > 44) return false;
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

// Проверка лимитов (флуд)
function checkWithdrawalLimits(userId: number, amount: number): { valid: boolean; error?: string } {
  const now = new Date();
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // 3 вывода за 5 минут
  const countStmt = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount
    FROM withdrawals 
    WHERE userId = ? AND createdAt > ?
  `);
  const stats = countStmt.get(userId, fiveMinutesAgo.toISOString()) as unknown as WithdrawalStats;

  const MAX_WITHDRAWALS = 3;
  const MAX_AMOUNT_5MIN = 100;

  if (stats.count >= MAX_WITHDRAWALS) {
    return { valid: false, error: `Maximum ${MAX_WITHDRAWALS} withdrawals per 5 minutes` };
  }

  if (stats.totalAmount + amount > MAX_AMOUNT_5MIN) {
    return { valid: false, error: `Maximum ${MAX_AMOUNT_5MIN} TC per 5 minutes` };
  }

  // 500 TC в день
  const dailyStmt = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as totalAmount
    FROM withdrawals 
    WHERE userId = ? AND createdAt > ?
  `);
  const dailyStats = dailyStmt.get(userId, oneDayAgo.toISOString()) as unknown as DailyStats;
  const DAILY_LIMIT = 500;

  if (dailyStats.totalAmount + amount > DAILY_LIMIT) {
    return { valid: false, error: `Daily limit: ${DAILY_LIMIT} TC per day` };
  }

  return { valid: true };
}

// ========== ЭНДПОИНТ ПОЛУЧЕНИЯ NONCE ==========

/**
 * GET /api/tc/nonce
 * Возвращает текущий nonce пользователя.
 * Клиент обязан получить его непосредственно перед отправкой
 * запроса на вывод и передать в теле POST /api/tc/withdraw.
 */
router.get('/nonce', requireAuth, (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const row = db.prepare('SELECT nonce FROM users WHERE id = ?').get(userId) as
      | { nonce: number }
      | undefined;

    if (!row) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    res.json({ nonce: row.nonce });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// ========== РОУТ ДЕПОЗИТА (TC → ∞) ==========

/**
 * POST /api/tc/deposit
 * Пользователь переводит TC на адрес казначейства в своём Solana-кошельке,
 * затем присылает подпись транзакции сюда. Мы верифицируем перевод on-chain
 * (а не доверяем заявленной сумме) и зачисляем ∞ за вычетом комиссии 0.5%.
 */
router.post('/deposit', rateLimit(60_000, 5), requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  const { error: validationError } = depositSchema.validate(req.body);
  if (validationError) return res.status(400).json({ error: validationError.details[0].message });

  const { amount, txSignature } = req.body;

  // TOCTOU-safe захват подписи транзакции под UNIQUE-индексом, до сетевой
  // верификации — конкурентные запросы с одной подписью не смогут оба пройти.
  try {
    db.prepare(
      `INSERT INTO tc_convert_log (user_id, direction, amount, solana_address, tx_signature, status)
       VALUES (?, 'from_tc', ?, NULL, ?, 'pending')`
    ).run(userId, amount, txSignature);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Эта транзакция уже была использована для депозита' });
    }
    captureError('❌ Deposit log insert error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  try {
    const { amount: verifiedAmount, from } = await solanaService.verifyIncomingTransfer(txSignature, amount);
    const infinityToCredit = verifiedAmount * (1 - TC_CONVERT_FEE);

    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE wallets SET timecoin = timecoin + ? WHERE user_id = ?').run(infinityToCredit, userId);
      db.prepare(
        `UPDATE tc_convert_log SET amount = ?, solana_address = ?, status = 'done' WHERE tx_signature = ?`
      ).run(verifiedAmount, from, txSignature);
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    logAudit(userId, 'credit', infinityToCredit, 'deposit_completed', { txSignature, from });

    const walletRow = db.prepare('SELECT timecoin FROM wallets WHERE user_id = ?').get(userId) as
      | { timecoin: number }
      | undefined;

    res.json({
      success: true,
      amountReceivedTc: verifiedAmount,
      amountCreditedInfinity: infinityToCredit,
      fee: TC_CONVERT_FEE,
      from,
      txSignature,
      timecoin: walletRow?.timecoin ?? null,
    });
  } catch (err: unknown) {
    db.prepare(`DELETE FROM tc_convert_log WHERE tx_signature = ? AND status = 'pending'`).run(txSignature);
    const msg = err instanceof Error ? err.message : 'Не удалось проверить транзакцию TC';
    captureError('❌ Deposit verify error:', err);
    res.status(400).json({ error: msg });
  }
});

// ========== ОСНОВНОЙ РОУТ ВЫВОДА ==========

router.post('/withdraw', rateLimit(60_000, 10), requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  let debited = false;

  const refundDebit = (reason: string) => {
    if (!debited) return;
    debited = false;
    db.prepare('UPDATE wallets SET timecoin = timecoin + ? WHERE user_id = ?').run(req.body.amount, userId);
    logAudit(userId, 'credit', req.body.amount, 'withdraw_refund', { reason });
  };

  try {
    // 0. Joi-валидация входных данных
    const { error: validationError } = withdrawSchema.validate(req.body);
    if (validationError) return res.status(400).json({ error: validationError.details[0].message });

    const { amount, externalWalletAddress, twofa_token, nonce } = req.body;

    // 1. Проверка 2FA (если включена у пользователя)
    const twoFaUser = db.prepare(
      'SELECT twofa_enabled, twofa_secret FROM users WHERE id = ?'
    ).get(userId) as { twofa_enabled: number; twofa_secret: string | null } | undefined;

    if (!twoFaUser) {
      return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
    }

    if (twoFaUser.twofa_enabled) {
      if (!twofa_token) {
        return res.status(403).json({ error: 'Требуется код 2FA (поле twofa_token)' });
      }
      const valid2FA = TwoFAService.verifyToken(twoFaUser.twofa_secret!, String(twofa_token));
      if (!valid2FA) {
        return res.status(403).json({ error: 'Неверный код 2FA' });
      }
    }

    // 2-4. Атомарно захватываем nonce и списываем баланс в одной транзакции.
    // Всё до этого момента — синхронный код без единого await, поэтому два
    // конкурентных запроса с одинаковым nonce физически не могут оба пройти
    // проверку: JS-код между await-точками не прерывается, значит первый
    // начавшийся запрос успевает захватить nonce и списать баланс до того,
    // как второй вообще начнёт свою часть транзакции (SQLite BEGIN IMMEDIATE
    // дополнительно берёт эксклюзивную блокировку записи).
    db.exec('BEGIN IMMEDIATE');
    let inTx = true;
    const rollback = () => { if (inTx) { inTx = false; db.exec('ROLLBACK'); } };
    try {
      const nonceClaim = db.prepare('UPDATE users SET nonce = nonce + 1 WHERE id = ? AND nonce = ?')
        .run(userId, Number(nonce));
      if (nonceClaim.changes !== 1) {
        rollback();
        logAudit(userId, 'rejected', amount, 'invalid_nonce');
        return res.status(400).json({ error: 'Invalid nonce' });
      }

      const debit = db.prepare('UPDATE wallets SET timecoin = timecoin - ? WHERE user_id = ? AND timecoin >= ?')
        .run(amount, userId, amount);
      if (debit.changes !== 1) {
        rollback();
        const walletRow = db.prepare('SELECT timecoin FROM wallets WHERE user_id = ?').get(userId) as
          | { timecoin: number }
          | undefined;
        logAudit(userId, 'rejected', amount, 'insufficient_balance', { balance: walletRow?.timecoin ?? 0 });
        return res.status(400).json({
          error: `Insufficient balance. You have ${walletRow?.timecoin ?? 0} TC`
        });
      }

      // Проверка лимитов (флуд) — откатываем списание, если превышен.
      const limits = checkWithdrawalLimits(userId, amount);
      if (!limits.valid) {
        rollback();
        logAudit(userId, 'rejected', amount, 'withdrawal_limit_exceeded', { detail: limits.error });
        return res.status(429).json({ error: limits.error });
      }

      db.exec('COMMIT');
      inTx = false;
      debited = true;
      logAudit(userId, 'debit', amount, 'withdraw_initiated', { externalWalletAddress });
    } catch (txErr) {
      rollback();
      throw txErr;
    }

    // 5. Проверка баланса казны (TC) — сетевой вызов, поэтому вне транзакции;
    //    при неудаче возвращаем списанное.
    const treasuryBalance = await solanaService.getTreasuryBalance();
    if (treasuryBalance < amount) {
      refundDebit('treasury_low');
      return res.status(400).json({
        error: 'Treasury temporarily low. Please try again later.'
      });
    }

    // 6. Проверка баланса SOL на казне (для газа)
    try {
      const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
      const pubkey = new PublicKey(solanaService.getTreasuryPublicKey());
      const solBalance = await connection.getBalance(pubkey);
      const MIN_SOL = 0.01 * 1e9; // 0.01 SOL в lamports

      if (solBalance < MIN_SOL) {
        refundDebit('treasury_sol_low');
        return res.status(400).json({
          error: 'Treasury is low on SOL for transaction fees. Please wait.'
        });
      }
    } catch (solError: unknown) {
      const msg = solError instanceof Error ? solError.message : String(solError);
      console.warn('⚠️ Could not check SOL balance:', msg);
      // Продолжаем, но логируем
    }

    // 7. Отправка транзакции в Solana
    let signature: string;
    try {
      signature = await solanaService.sendTokens(externalWalletAddress, amount);
    } catch (solanaError: unknown) {
      // ОТКАТ: возвращаем баланс (nonce уже использован для этой попытки —
      // клиент получит новый через GET /nonce)
      refundDebit('solana_send_failed');

      const msg = solanaError instanceof Error ? solanaError.message : String(solanaError);
      captureError('❌ Solana transaction failed:', solanaError);
      return res.status(500).json({
        error: `Transaction failed: ${msg}`
      });
    }

    // 8. Логирование вывода (nonce уже увеличен в транзакции на шаге 2-4)
    db.prepare(`
      INSERT INTO withdrawals (userId, amount, signature, externalAddress, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, amount, signature, externalWalletAddress, 'completed');

    // 9. Успешный ответ
    res.json({
      success: true,
      signature,
      amount,
      explorerLink: `https://solscan.io/tx/${signature}`,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    captureError('❌ Withdraw error:', error);
    const msg = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: msg });
  }
});

// ========== ДОПОЛНИТЕЛЬНЫЕ РОУТЫ ==========

// Роут для проверки баланса казны
router.get('/treasury-balance', async (req: Request, res: Response) => {
  try {
    const balance = await solanaService.getTreasuryBalance();
    const solConnection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    const pubkey = new PublicKey(solanaService.getTreasuryPublicKey());
    const solBalance = await solConnection.getBalance(pubkey);

    res.json({
      tcBalance: balance,
      solBalance: solBalance / 1e9,
      publicKey: solanaService.getTreasuryPublicKey()
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// Роут для истории выводов пользователя
router.get('/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const userId = req.user!.userId;

    const countStmt = db.prepare(`
      SELECT COUNT(*) as total FROM withdrawals WHERE userId = ?
    `);
    const { total } = countStmt.get(userId) as { total: number };

    const stmt = db.prepare(`
      SELECT id, amount, signature, externalAddress, status, createdAt
      FROM withdrawals 
      WHERE userId = ?
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `);
    const history = stmt.all(userId, limit, offset);

    res.json({
      history,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// Роут для проверки лимитов пользователя
router.get('/limits', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as totalAmount
      FROM withdrawals 
      WHERE userId = ? AND createdAt > ?
    `);
    const stats = countStmt.get(userId, fiveMinutesAgo.toISOString()) as unknown as WithdrawalStats;

    const dailyStmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount
      FROM withdrawals
      WHERE userId = ? AND createdAt > ?
    `);
    const dailyStats = dailyStmt.get(userId, oneDayAgo.toISOString()) as unknown as DailyStats;

    res.json({
      limits: {
        maxPer5min: 3,
        maxAmount5min: 100,
        dailyLimit: 500
      },
      current: {
        withdrawals5min: stats.count,
        amount5min: stats.totalAmount,
        amountToday: dailyStats.totalAmount
      },
      remaining: {
        withdrawals5min: Math.max(0, 3 - stats.count),
        amount5min: Math.max(0, 100 - stats.totalAmount),
        dailyAmount: Math.max(0, 500 - dailyStats.totalAmount)
      }
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

export default router;
