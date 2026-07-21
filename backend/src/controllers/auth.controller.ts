import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { UserModel, SocialProvider } from '../models/user.model';
import { isValidEmail, isValidPhone, isValidUsername, isValidPassword } from '../utils/validators';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import db from '../db/database';

const SOCIAL_PROVIDERS: SocialProvider[] = ['google', 'github'];

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

export class AuthController {
  // ===== РЕГИСТРАЦИЯ =====
  static async register(req: Request, res: Response) {
    try {
      const { email, phone, password, username, referralCode, provider, providerId } = req.body;

      if (!isValidUsername(username)) {
        return res.status(400).json({ error: 'Некорректный username', code: 'INVALID_USERNAME' });
      }
      if (email && !isValidEmail(email)) {
        return res.status(400).json({ error: 'Некорректный email', code: 'INVALID_EMAIL' });
      }
      if (phone && !isValidPhone(phone)) {
        return res.status(400).json({ error: 'Некорректный телефон', code: 'INVALID_PHONE' });
      }
      if (!isValidPassword(password)) {
        return res.status(400).json({ error: 'Пароль слишком короткий (минимум 8 символов)', code: 'WEAK_PASSWORD' });
      }
      if (email && UserModel.findByEmail(email)) {
        return res.status(409).json({ error: 'Email уже используется', code: 'EMAIL_ALREADY_LINKED' });
      }
      if (phone && UserModel.findByPhone(phone)) {
        return res.status(409).json({ error: 'Телефон уже используется', code: 'PHONE_ALREADY_LINKED' });
      }
      if (UserModel.isUsernameTaken(username)) {
        return res.status(409).json({ error: 'Username уже занят', code: 'USERNAME_TAKEN' });
      }

      const hashedPassword = await AuthService.hashPassword(password);
      const refCode = uuidv4().slice(0, 8).toUpperCase();

      let referredBy: number | null = null;
      if (referralCode) {
        const referrer = UserModel.findByReferralCode(referralCode);
        if (referrer) referredBy = referrer.id;
      }

      const validProvider: SocialProvider | undefined =
        provider && SOCIAL_PROVIDERS.includes(provider) ? provider : undefined;

      // Создаём пользователя согласно схеме init-db (без balance_* — баланс в таблице wallets)
      const userId = UserModel.create({
        email,
        phone,
        password_hash: hashedPassword,
        username,
        referral_code: refCode,
        referred_by: referredBy,
        is_verified: false,
        twofa_secret: null,
        twofa_enabled: false,
        nonce: 0,
        role: 'user',
        provider: validProvider,
        providerId: validProvider ? providerId : undefined
      });

      // Создаём кошелёк в таблице wallets (стартовый бонус 100 credits)
      try {
        db.prepare(`
          INSERT OR IGNORE INTO wallets (user_id, credits, shards, crystals, timecoin, cash_usd)
          VALUES (?, 100, 0, 0, 0, 0)
        `).run(userId);
      } catch (e) {
        // wallets таблица может не существовать — игнорируем
      }

      // Начисляем бонус рефереру
      if (referredBy) {
        try {
          db.prepare(`UPDATE wallets SET timecoin = timecoin + 5 WHERE user_id = ?`).run(referredBy);
          db.prepare(`
            INSERT OR IGNORE INTO referrals (referrer_id, referee_id, reward_amount, status)
            VALUES (?, ?, ?, 'active')
          `).run(referredBy, userId, 5);
        } catch (e) {
          // referrals таблица может не существовать
        }
      }

      const token = AuthService.generateAccessToken(userId);
      const refreshToken = AuthService.generateRefreshToken(userId);

      res.status(201).json({
        success: true,
        token,
        refreshToken,
        user: { id: userId, email, username, referralCode: refCode }
      });

    } catch (error: any) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ===== ВХОД =====
  // Поддерживает 4 режима входа: email+password, phone+password, username+password, provider+providerId.
  static async login(req: Request, res: Response) {
    try {
      const { email, username, phone, password, provider, providerId } = req.body;

      let user;
      const isProviderLogin = provider && providerId;

      if (isProviderLogin) {
        if (!SOCIAL_PROVIDERS.includes(provider)) {
          return res.status(400).json({ error: 'Некорректный провайдер', code: 'INVALID_CREDENTIALS' });
        }
        user = UserModel.findByProvider(provider, providerId);
        if (!user) {
          return res.status(401).json({ error: 'Провайдер не привязан ни к одному аккаунту', code: 'PROVIDER_NOT_LINKED' });
        }
        if (!user.is_linked) {
          return res.status(401).json({ error: 'Требуется привязка аккаунта', code: 'LINK_REQUIRED' });
        }
      } else {
        if (!email && !phone && !username) {
          return res.status(400).json({ error: 'Укажите email, phone, username или provider', code: 'INVALID_CREDENTIALS' });
        }
        user = email
          ? UserModel.findByEmail(email)
          : phone
            ? UserModel.findByPhone(phone)
            : UserModel.findByUsername(username);

        if (!user) {
          return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        }

        const valid = user.password_hash
          ? await AuthService.verifyPassword(password || '', user.password_hash)
          : false;
        if (!valid) {
          return res.status(401).json({ error: 'Invalid credentials', code: 'INVALID_CREDENTIALS' });
        }
      }

      if (user.banned) {
        return res.status(403).json({ error: 'Аккаунт заблокирован' });
      }

      UserModel.updateLastLogin(user.id);

      const token = AuthService.generateAccessToken(user.id);
      const refreshToken = AuthService.generateRefreshToken(user.id);

      res.json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          phone: user.phone,
          role: user.role,
          referralCode: user.referral_code
        }
      });

    } catch (error: any) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ===== ПРИВЯЗКА СОЦПРОВАЙДЕРА =====
  static async linkProvider(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { provider, providerId, email, phone } = req.body;
      if (!provider || !providerId || !SOCIAL_PROVIDERS.includes(provider)) {
        return res.status(400).json({ error: 'Укажите корректный provider и providerId', code: 'MISSING_PROVIDER' });
      }

      try {
        UserModel.linkProvider(userId, provider, providerId, email, phone);
      } catch (e: any) {
        return res.status(409).json({ error: e.message, code: 'PROVIDER_ALREADY_LINKED' });
      }

      const user = UserModel.findById(userId);
      const { password_hash, twofa_secret, ...safeUser } = user || ({} as any);

      res.json({ success: true, message: 'Провайдер успешно привязан', user: safeUser });

    } catch (error: any) {
      console.error('Link provider error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ===== ОБНОВЛЕНИЕ ТОКЕНА =====
  static async refresh(req: Request, res: Response) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'Refresh token required' });
      }

      const decoded = AuthService.verifyRefreshToken(refreshToken);
      if (!decoded || !decoded.userId) {
        return res.status(401).json({ error: 'Invalid refresh token' });
      }

      const newAccessToken = AuthService.generateAccessToken(decoded.userId);
      res.json({ success: true, accessToken: newAccessToken });

    } catch (error: any) {
      res.status(401).json({ error: 'Invalid refresh token' });
    }
  }

  // ===== ПОЛУЧИТЬ ПРОФИЛЬ =====
  static async me(req: Request, res: Response) {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const user = UserModel.findById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found', code: 'USER_NOT_FOUND' });
      }

      const { password_hash, twofa_secret, ...safeUser } = user;
      res.json({ success: true, user: safeUser });

    } catch (error: any) {
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // ===== ВЫХОД =====
  static async logout(req: Request, res: Response) {
    res.json({ success: true, message: 'Logged out successfully' });
  }

  // ===== СМЕНА ПАРОЛЯ =====
  static async changePassword(req: Request, res: Response) {
    try {
      const { error } = changePasswordSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const userId = req.user?.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { oldPassword, newPassword } = req.body;
      const user = UserModel.findById(userId);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const valid = await AuthService.verifyPassword(oldPassword, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      const hashed = await AuthService.hashPassword(newPassword);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashed, userId);

      res.json({ success: true, message: 'Password changed successfully' });

    } catch (error: any) {
      console.error('Change password error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
