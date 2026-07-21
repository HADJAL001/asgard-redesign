import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';
import { UserModel } from '../models/user.model';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header', code: 'NO_TOKEN' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid token format. Use Bearer <token>', code: 'NO_TOKEN' });
    }

    const token = parts[1];
    const decoded = AuthService.verifyAccessToken(token);

    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid or expired token', code: 'INVALID_TOKEN' });
    }

    req.user = { userId: decoded.userId };
    req.userId = decoded.userId;
    next();

  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'INVALID_TOKEN' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Требует, чтобы у пользователя была привязана хотя бы одна соцсеть (см. UserModel.isLinked)
export function requireLinked(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId ?? req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: 'No authorization header', code: 'NO_TOKEN' });
  }

  if (!UserModel.isLinked(userId)) {
    return res.status(403).json({ error: 'Требуется привязка соцаккаунта', code: 'LINK_REQUIRED' });
  }

  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        const decoded = AuthService.verifyAccessToken(parts[1]);
        if (decoded && decoded.userId) {
          req.user = { userId: decoded.userId };
        }
      }
    }
  } catch (error) {
    // Игнорируем ошибки, просто пропускаем дальше
  }
  next();
}
