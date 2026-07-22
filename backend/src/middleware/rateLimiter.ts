import { Request, Response, NextFunction } from 'express';
import { redisClient, ensureRedisConnected } from '../lib/redis';

interface RateRecord {
  count: number;
  resetTime: number;
}

/* In-memory fallback — используется, если REDIS_URL не задан или Redis недоступен.
   Несколько инстансов backend (Railway) не шарят этот Map между собой, поэтому
   он остаётся резервным вариантом, а не основным. */
const store = new Map<string, RateRecord>();

function memoryRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const record = store.get(key);

  if (!record || record.resetTime < now) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (record.count >= max) {
    return false;
  }

  record.count++;
  return true;
}

export function rateLimit(windowMs: number = 60000, max: number = 100) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Ключ включает путь роута, чтобы лимиты разных ручек на одном IP не смешивались.
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `ratelimit:${req.baseUrl}${req.path}:${ip}`;

    if (await ensureRedisConnected()) {
      try {
        const count = await redisClient!.incr(key);
        if (count === 1) {
          await redisClient!.pexpire(key, windowMs);
        }
        if (count > max) {
          return res.status(429).json({ error: `Too many requests. Please try again later.` });
        }
        return next();
      } catch (err: any) {
        console.warn('[rateLimiter] redis failed, falling back to in-memory:', err.message);
      }
    }

    const allowed = memoryRateLimit(key, windowMs, max);
    if (!allowed) {
      return res.status(429).json({ error: `Too many requests. Please try again later.` });
    }
    next();
  };
}

// Очистка старых записей in-memory fallback каждые 5 минут (Redis чистит себя сам через PEXPIRE)
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (record.resetTime < now) {
      store.delete(key);
    }
  }
}, 300000);
