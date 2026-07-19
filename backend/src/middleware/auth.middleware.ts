import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service';

export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header' });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid token format. Use Bearer <token>' });
    }

    const token = parts[1];
    const decoded = AuthService.verifyAccessToken(token);
    
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = { userId: decoded.userId };
    next();

  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    console.error('Auth middleware error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
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
