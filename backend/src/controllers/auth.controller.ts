import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { UserModel } from '../models/user.model';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import db from '../db/database';

// Схемы валидации
const registerSchema = Joi.object({
  email: Joi.string().email().optional(),
  password: Joi.string().min(6).required(),
  username: Joi.string().min(3).max(30).required(),
  referralCode: Joi.string().optional()
});

const loginSchema = Joi.object({
  email: Joi.string().email().optional(),
  username: Joi.string().optional(),
  password: Joi.string().required()
}).or('email', 'username');

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).required()
});

export class AuthController {
  // ===== РЕГИСТРАЦИЯ =====
  static async register(req: Request, res: Response) {
    try {
      const { error } = registerSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { email, password, username, referralCode } = req.body;

      if (email && UserModel.findByEmail(email)) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      if (UserModel.findByUsername(username)) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      const hashedPassword = await AuthService.hashPassword(password);
      const refCode = uuidv4().slice(0, 8).toUpperCase();

      let referredBy: number | null = null;
      if (referralCode) {
        const referrer = UserModel.findByReferralCode(referralCode);
        if (referrer) referredBy = referrer.id;
      }

      // Создаём пользователя согласно схеме init-db (без balance_* — баланс в таблице wallets)
      const userId = UserModel.create({
        email,
        password_hash: hashedPassword,
        username,
        referral_code: refCode,
        referred_by: referredBy,
        is_verified: false,
        twofa_secret: null,
        twofa_enabled: false,
        nonce: 0,
        role: 'user'
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
  static async login(req: Request, res: Response) {
    try {
      const { error } = loginSchema.validate(req.body);
      if (error) {
        return res.status(400).json({ error: error.details[0].message });
      }

      const { email, username, password } = req.body;
      // поиск по email или username
      const user = email ? UserModel.findByEmail(email) : UserModel.findByUsername(username);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const valid = await AuthService.verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid credentials' });
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
          role: user.role,
          referralCode: user.referral_code
        }
      });

    } catch (error: any) {
      console.error('Login error:', error);
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
        return res.status(404).json({ error: 'User not found' });
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
