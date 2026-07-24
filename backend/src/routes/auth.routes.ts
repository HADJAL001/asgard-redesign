import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { rateLimit } from '../middleware/rateLimiter';
import db from '../lib/db';
import { requireAuth, requireLinked, AuthRequest } from '../middleware/authMiddleware';
import { TwoFAService } from '../services/twofa.service';
import { decryptOrPlain } from '../utils/encryption';
import { asyncHandler } from '../utils/async-handler';

const router = Router();

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=160&q=80';

// ===== ПУБЛИЧНЫЕ РОУТЫ (AuthController) =====
router.post('/register', rateLimit(60000, 5), AuthController.register);
router.post('/login', rateLimit(60000, 10), AuthController.login);
// Refresh throttled: без лимита эндпоинт открыт для брутфорса refresh-токенов и DoS.
router.post('/refresh', rateLimit(60000, 30), AuthController.refresh);

// ===== ЗАЩИЩЁННЫЕ РОУТЫ (AuthController) =====
router.post('/logout', rateLimit(60000, 30), requireAuth, AuthController.logout);
router.get('/me', rateLimit(60000, 60), requireAuth, AuthController.me);
// Смена пароля — чувствительна: жёсткий лимит против перебора старого пароля.
router.post('/change-password', rateLimit(60000, 10), requireAuth, AuthController.changePassword);
router.post('/link', rateLimit(60000, 20), requireAuth, AuthController.linkProvider);

// Пример защищённого маршрута, доступного только пользователям с привязанным соцаккаунтом
router.get('/protected', rateLimit(60000, 60), requireAuth, requireLinked, (req, res) => {
  res.json({ success: true, userId: req.userId });
});

/* ---------------- PATCH /auth/me ---------------- */
router.patch('/me', rateLimit(60000, 30), requireAuth, (req: AuthRequest, res) => {
  const { displayName, bio, avatarUrl } = req.body || {};
  const current: any = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user!.userId);
  if (!current) return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });

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
router.post('/2fa/setup', rateLimit(60000, 10), requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.user!.userId;

  const user: any = db
    .prepare(`SELECT id, email, username, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
  if (user.twofa_enabled) return res.status(400).json({ error: '2FA уже включена' });

  const identifier = (user.email ? decryptOrPlain(user.email) : null) || user.username;
  const { secret, otpauth_url } = TwoFAService.generateSecret(identifier);
  const qrCode = await TwoFAService.generateQR(otpauth_url);

  // Секрет шифруется «в покое» — при утечке дампа БД он эквивалентен паролю.
  db.prepare(`UPDATE users SET twofa_secret = ? WHERE id = ?`).run(
    TwoFAService.encryptSecret(secret),
    userId,
  );

  res.json({ secret, qrCode, otpauth_url });
}));

/* POST /auth/2fa/verify — активация 2FA после сканирования QR.
   Отдельный жёсткий rate-limit: проверка TOTP-кода перебираема (10^6 комбинаций),
   поэтому не более 10 попыток в минуту на пользователя. */
router.post('/2fa/verify', requireAuth, rateLimit(60000, 10, (req: AuthRequest) => `2fa-verify:${req.user?.userId ?? req.ip}`), (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { token } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Укажите token' });

  const user: any = db
    .prepare(`SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
  if (!user.twofa_secret) return res.status(400).json({ error: 'Сначала выполните /2fa/setup' });
  if (user.twofa_enabled) return res.status(400).json({ error: '2FA уже активирована' });

  const valid = TwoFAService.verifyStoredToken(user.twofa_secret, String(token));
  if (!valid) return res.status(400).json({ error: 'Неверный код. Попробуйте ещё раз' });

  // Активируем 2FA и одновременно генерируем набор резервных кодов.
  const { plain, hashed } = TwoFAService.generateBackupCodes();
  db.prepare(`UPDATE users SET twofa_enabled = 1, twofa_backup_codes = ? WHERE id = ?`).run(
    TwoFAService.serializeBackupHashes(hashed),
    userId,
  );

  res.json({
    success: true,
    message: '2FA успешно активирована',
    // Показываем открытые коды ЕДИНСТВЕННЫЙ раз — сервер их больше не хранит.
    backupCodes: plain,
  });
});

/* POST /auth/2fa/backup-codes/regenerate — перевыпуск резервных кодов.
   Требует подтверждения текущим TOTP-кодом; старые коды инвалидируются. */
router.post('/2fa/backup-codes/regenerate', requireAuth, rateLimit(60000, 5, (req: AuthRequest) => `2fa-backup:${req.user?.userId ?? req.ip}`), (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { token } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Укажите текущий код 2FA' });

  const user: any = db
    .prepare(`SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
  if (!user.twofa_enabled || !user.twofa_secret) return res.status(400).json({ error: '2FA не активирована' });

  const valid = TwoFAService.verifyStoredToken(user.twofa_secret, String(token));
  if (!valid) return res.status(400).json({ error: 'Неверный код' });

  const { plain, hashed } = TwoFAService.generateBackupCodes();
  db.prepare(`UPDATE users SET twofa_backup_codes = ? WHERE id = ?`).run(
    TwoFAService.serializeBackupHashes(hashed),
    userId,
  );

  res.json({ success: true, message: 'Резервные коды перевыпущены', backupCodes: plain });
});

/* POST /auth/2fa/disable */
router.post('/2fa/disable', rateLimit(60000, 10), requireAuth, (req: AuthRequest, res) => {
  const userId = req.user!.userId;
  const { token } = req.body || {};

  if (!token) return res.status(400).json({ error: 'Укажите token для подтверждения' });

  const user: any = db
    .prepare(`SELECT twofa_secret, twofa_enabled FROM users WHERE id = ?`)
    .get(userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });
  if (!user.twofa_enabled) return res.status(400).json({ error: '2FA не активирована' });

  const valid = TwoFAService.verifyStoredToken(user.twofa_secret, String(token));
  if (!valid) return res.status(400).json({ error: 'Неверный код' });

  db.prepare(`UPDATE users SET twofa_enabled = 0, twofa_secret = NULL, twofa_backup_codes = NULL WHERE id = ?`).run(userId);

  res.json({ success: true, message: '2FA отключена' });
});

/* GET /auth/2fa/status */
router.get('/2fa/status', rateLimit(60000, 30), requireAuth, (req: AuthRequest, res) => {
  const user: any = db
    .prepare(`SELECT twofa_enabled, twofa_backup_codes FROM users WHERE id = ?`)
    .get(req.user!.userId);

  if (!user) return res.status(404).json({ error: 'Пользователь не найден', code: 'USER_NOT_FOUND' });

  res.json({
    twofa_enabled: Boolean(user.twofa_enabled),
    backup_codes_remaining: TwoFAService.countBackupCodes(user.twofa_backup_codes),
  });
});

export default router;
