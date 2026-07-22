import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

export class AuthService {
  // Хеширование пароля
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  // Проверка пароля
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Синхронные варианты — только для скриптов сидинга БД (init-db.ts), не для request-хендлеров
  static hashPasswordSync(password: string): string {
    return bcrypt.hashSync(password, 12);
  }

  static comparePasswordSync(password: string, hash: string): boolean {
    return bcrypt.compareSync(password, hash);
  }

  // Генерация Access Token (15 минут)
  static generateAccessToken(userId: number): string {
    return jwt.sign(
      { userId }, 
      process.env.JWT_SECRET || 'default_secret', 
      { expiresIn: '15m' }
    );
  }

  // Генерация Refresh Token (7 дней)
  static generateRefreshToken(userId: number): string {
    return jwt.sign(
      { userId }, 
      process.env.JWT_REFRESH_SECRET || 'default_refresh_secret', 
      { expiresIn: '7d' }
    );
  }

  // Верификация Access Token
  static verifyAccessToken(token: string): any {
    return jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
  }

  // Верификация Refresh Token
  static verifyRefreshToken(token: string): any {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET || 'default_refresh_secret');
  }
}
