import jwt from 'jsonwebtoken';

export class TokenService {
  static generateAccessToken(userId: number): string {
    return jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: '15m' });
  }

  static generateRefreshToken(userId: number): string {
    return jwt.sign({ userId }, process.env.JWT_REFRESH_SECRET!, { expiresIn: '7d' });
  }

  static verifyAccessToken(token: string): any {
    return jwt.verify(token, process.env.JWT_SECRET!);
  }

  static verifyRefreshToken(token: string): any {
    return jwt.verify(token, process.env.JWT_REFRESH_SECRET!);
  }
}
