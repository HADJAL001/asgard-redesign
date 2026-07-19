import { Request, Response, NextFunction } from 'express';

interface RateRecord {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateRecord>();

export function rateLimit(windowMs: number = 60000, max: number = 100) {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = store.get(key);
    
    if (!record || record.resetTime < now) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      return next();
    }
    
    if (record.count >= max) {
      return res.status(429).json({ 
        error: `Too many requests. Please try again later.` 
      });
    }
    
    record.count++;
    next();
  };
}

// Очистка старых записей каждые 5 минут
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetTime < now) {
      store.delete(key);
    }
  }
}, 300000);
