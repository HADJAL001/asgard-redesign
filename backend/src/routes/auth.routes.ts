import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { rateLimit } from '../middleware/rateLimiter';
import { authenticate, requireLinked } from '../middleware/auth.middleware';
import db from '../lib/db';
import { hashPassword, comparePassword, signToken } from '../lib/auth';
import { requireAuth, AuthRequest } from '../middleware/authMiddleware';
import { TokenService } from '../services/token.service';
import { TwoFAService } from '../services/twofa.service';
import { encrypt, decrypt } from '../utils/encryption';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

// ===== ПУБЛИЧНЫЕ РОУТЫ (AuthController) =====
router.post('/register', rateLimit(60000, 5), AuthController.register);
router.post('/login', rateLimit(60000, 10), AuthController.login);
router.post('/refresh', AuthController.refresh);

// ===== ЗАЩИЩЁННЫЕ РОУТЫ (AuthController) =====
router.post('/logout', authenticate, AuthController.logout);
router.get('/me', authenticate, AuthController.me);
router.post('/change-password', authenticate, AuthController.changePassword);
router.post('/link', authenticate, AuthController.linkProvider);

// Пример защищённого маршрута, доступного только пользователям с привязанным соцаккаунтом
router.get('/protected', authenticate, requireLinked, (req, res) => {
  res.json({ success: true, userId: req.userId });
});

/* ---------------- PATCH /auth/me ---------------- */
router.patch('/me', requireAuth, (req: AuthRequest, res) => {
  const { displayName, bio, avatarUrl } = req.body || {};
  const current: any = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user!.userId);
  if (!current) return res.status(404).json({ error: 'Пользователь не найден' });

  db.prepare(
    `UPDATE users SET display_name = ?, bio = ?, avatar_url = ? WHERE id = ?`,
  ).run(
    displayName ?? current.display_name,
    bio ?? current.bio,
    avatarUrl ?? current.avatar_url,
    req.user!.userId,
  );

  const userPatched: any = db
    .prepare(
      `SELECT id, username, email, display_name as displayName, level, avatar_url as avatarUrl, bio, created_at as createdAt
       FROM users WHERE id = ?`,
    )
    .get(req.user!.userId);

  res.json({ user: userPatched });
});

/* --------------------------------------------------------
 * 2FA РОУТЫ
 * -------------------------------------------------------- */

/* POST /auth/2fa/setup */
router.post('/2fa/setup', requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  const user: any = db
    .prepare(`SELECT id, email, username, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (user.twofa_enabled) return res.status(400).json({ error: '2FA уже включена' });

  const identifier = (user.email ? decrypt(user.email) : null) || user.username;
  const { secret, otpauth_url } = TwoFAService.generateSecret(identifier);
  const qrCode = await TwoFAService.generateQR(otpauth_url);

  db.prepare(`UPDATE users SET twofa_secret = ? WHERE id = ?`).run(secret, userId);

  res.json({ secret, qrCode, otpauth_url });
}));

/* POST /auth/2fa/verify */
router.post('/2fa/verify', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { token } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Укажите token' });

  const user: any = db
    .prepare(`SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!user.twofa_secret) return res.status(400).json({ error: 'Сначала выполните /2fa/setup' });
  if (user.twofa_enabled) return res.status(400).json({ error: '2FA уже активирована' });

  const valid = TwoFAService.verifyToken(user.twofa_secret, String(token));
  if (!valid) return res.status(400).json({ error: 'Неверный код. Попробуйте ещё раз' });

  db.prepare(`UPDATE users SET twofa_enabled = 1 WHERE id = ?`).run(userId);

  res.json({ success: true, message: '2FA успешно активирована' });
});

/* POST /auth/2fa/disable */
router.post('/2fa/disable', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { token } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Укажите token для подтверждения' });

  const user: any = db
    .prepare(`SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  if (!user.twofa_enabled) return res.status(400).json({ error: '2FA не активирована' });

  const valid = TwoFAService.verifyToken(user.twofa_secret, String(token));
  if (!valid) return res.status(400).json({ error: 'Неверный код' });

  db.prepare(`UPDATE users SET twofa_enabled = 0, twofa_secret = NULL WHERE id = ?`).run(userId);

  res.json({ success: true, message: '2FA отключена' });
});

/* GET /auth/2fa/status */
router.get('/2fa/status', requireAuth, (req: AuthRequest, res) => {
  const user: any = db
    .prepare(`SELECT twofa_enabled FROM users WHERE id = ?`)
    .get(req.user!.userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });

  res.json({ twofa_enabled: Boolean(user.twofa_enabled) });
});

export default router;
