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

  /**
   * @deprecated НЕ ИСПОЛЬЗОВАТЬ для выдачи сессии. Это stateless JWT: он не попадает
   * в таблицу `refresh_tokens`, а `POST /auth/refresh` ищет предъявленный токен по
   * `token_hash` и без строки отвечает `invalid` — сессия умирает через 15 минут
   * (когда истекает access-токен). Именно так соц-вход (Google/GitHub) выбрасывало
   * на /login, пока вход по паролю жил нормально.
   * Единственный правильный способ выдать refresh — `RefreshTokenService.issue(userId)`
   * (см. lib/refresh-tokens: ротация, детекция кражи, отзыв семьи).
   * Оставлен только для обратной совместимости; контракт защищён тестом
   * src/tests/session-issuance-contract.test.ts.
   */
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
