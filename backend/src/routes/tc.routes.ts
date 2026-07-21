import { Router, Request, Response } from 'express';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { Connection, PublicKey } from '@solana/web3.js';
import { authenticate } from '../middleware/auth.middleware';
import { SolanaService } from '../services/solana.service';
import { withdrawSchema } from '../validators/withdraw.validator';
import { TwoFAService } from '../services/twofa.service';

const router = Router();
const solanaService = new SolanaService();

// Подключаемся к БД (тот же путь, что и в lib/db.ts — уважает DB_PATH из окружения)
const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/osgard.db');
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
const db = new Database(dbPath);

// ========== ТИПЫ ==========

interface WithdrawalStats {
  count: number;
  totalAmount: number;
}

interface DailyStats {
  totalAmount: number;
}

interface UserRow {
  balance: number;
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
  const stats = countStmt.get(userId, fiveMinutesAgo.toISOString()) as WithdrawalStats;

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
  const dailyStats = dailyStmt.get(userId, oneDayAgo.toISOString()) as DailyStats;
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
router.get('/nonce', authenticate, (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const row = db.prepare('SELECT nonce FROM users WHERE id = ?').get(userId) as
      | { nonce: number }
      | undefined;

    if (!row) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ nonce: row.nonce });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

// ========== ОСНОВНОЙ РОУТ ВЫВОДА ==========

router.post('/withdraw', authenticate, async (req: Request, res: Response) => {
  try {
    // 0. Joi-валидация входных данных
    const { error: validationError } = withdrawSchema.validate(req.body);
    if (validationError) return res.status(400).json({ error: validationError.details[0].message });

    const { amount, externalWalletAddress, twofa_token, nonce } = req.body;
    const userId = req.user!.userId;

    // 1. Проверка 2FA (если включена у пользователя)
    const twoFaUser = db.prepare(
      'SELECT twofa_enabled, twofa_secret FROM users WHERE id = ?'
    ).get(userId) as { twofa_enabled: number; twofa_secret: string | null } | undefined;

    if (twoFaUser?.twofa_enabled) {
      if (!twofa_token) {
        return res.status(403).json({ error: 'Требуется код 2FA (поле twofa_token)' });
      }
      const valid2FA = TwoFAService.verifyToken(twoFaUser.twofa_secret!, String(twofa_token));
      if (!valid2FA) {
        return res.status(403).json({ error: 'Неверный код 2FA' });
      }
    }

    // 2. Проверка nonce (защита от replay-атак)
    const userRow = db.prepare('SELECT balance, nonce FROM users WHERE id = ?').get(userId) as UserRow | undefined;

    if (!userRow) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (userRow.nonce !== Number(nonce)) {
      return res.status(400).json({ error: 'Invalid nonce' });
    }

    // 3. Проверка баланса пользователя
    const user = userRow;

    if (user.balance < amount) {
      return res.status(400).json({
        error: `Insufficient balance. You have ${user.balance} TC`
      });
    }

    // 4. Проверка лимитов (флуд)
    const limits = checkWithdrawalLimits(userId, amount);
    if (!limits.valid) {
      return res.status(429).json({ error: limits.error });
    }

    // 5. Проверка баланса казны (TC)
    const treasuryBalance = await solanaService.getTreasuryBalance();
    if (treasuryBalance < amount) {
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
        return res.status(400).json({
          error: 'Treasury is low on SOL for transaction fees. Please wait.'
        });
      }
    } catch (solError: unknown) {
      const msg = solError instanceof Error ? solError.message : String(solError);
      console.warn('⚠️ Could not check SOL balance:', msg);
      // Продолжаем, но логируем
    }

    // 7. Атомарное списание баланса
    const updateStmt = db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?');
    updateStmt.run(amount, userId);

    // 8. Отправка транзакции в Solana
    let signature: string;
    try {
      signature = await solanaService.sendTokens(externalWalletAddress, amount);
    } catch (solanaError: unknown) {
      // ОТКАТ: возвращаем баланс
      const rollbackStmt = db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?');
      rollbackStmt.run(amount, userId);

      const msg = solanaError instanceof Error ? solanaError.message : String(solanaError);
      console.error('❌ Solana transaction failed:', msg);
      return res.status(500).json({
        error: `Transaction failed: ${msg}`
      });
    }

    // 9. Логирование вывода + инкремент nonce (атомарно в транзакции)
    db.transaction(() => {
      db.prepare(`
        INSERT INTO withdrawals (userId, amount, signature, externalAddress, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, amount, signature, externalWalletAddress, 'completed');

      // Инкрементируем nonce, чтобы предыдущий токен больше не принимался
      db.prepare('UPDATE users SET nonce = nonce + 1 WHERE id = ?').run(userId);
    })();

    // 10. Успешный ответ
    res.json({
      success: true,
      signature,
      amount,
      explorerLink: `https://solscan.io/tx/${signature}`,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('❌ Withdraw error:', error);
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
router.get('/history', authenticate, async (req: Request, res: Response) => {
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
router.get('/limits', authenticate, async (req: Request, res: Response) => {
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
    const stats = countStmt.get(userId, fiveMinutesAgo.toISOString()) as WithdrawalStats;

    const dailyStmt = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as totalAmount
      FROM withdrawals 
      WHERE userId = ? AND createdAt > ?
    `);
    const dailyStats = dailyStmt.get(userId, oneDayAgo.toISOString()) as DailyStats;

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
