import { redisClient, ensureRedisConnected } from "../lib/redis";

const cache = new Map<string, { value: any; expires: number }>();

function memGet(key: string) {
  const entry = cache.get(key);
  if (!entry || entry.expires < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key: string, value: any, ttlSeconds: number) {
  cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export const cacheService = {
  /** Если REDIS_URL задан и доступен — пишет в Redis (общий кеш между инстансами
   *  бэкенда), иначе — в in-memory Map этого процесса. */
  async set(key: string, value: any, ttlSeconds: number = 60) {
    if (await ensureRedisConnected()) {
      try {
        await redisClient!.set(key, JSON.stringify(value), "EX", ttlSeconds);
        return;
      } catch (err: any) {
        console.warn("[cache] redis set failed, falling back to in-memory:", err.message);
      }
    }
    memSet(key, value, ttlSeconds);
  },
  async get(key: string) {
    if (await ensureRedisConnected()) {
      try {
        const raw = await redisClient!.get(key);
        return raw !== null ? JSON.parse(raw) : null;
      } catch (err: any) {
        console.warn("[cache] redis get failed, falling back to in-memory:", err.message);
      }
    }
    return memGet(key);
  },
  async del(key: string) {
    if (await ensureRedisConnected()) {
      try {
        await redisClient!.del(key);
        return;
      } catch (err: any) {
        console.warn("[cache] redis del failed:", err.message);
      }
    }
    cache.delete(key);
  },
  /** Возвращает закешированное значение, либо вычисляет его через fn, кеширует и возвращает. */
  async getOrSet<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const cached = await cacheService.get(key);
    if (cached !== null) return cached as T;
    const value = await fn();
    await cacheService.set(key, value, ttlSeconds);
    return value;
  },
};

// Используй для кэширования баланса казны, курсов, топ-лидеров.
// Примеры:
//   await cacheService.set('treasury_balance', balance, 30);  // TTL 30 сек
//   await cacheService.set('tc_rates', rates, 60);             // TTL 60 сек
//   await cacheService.set('top_leaders', leaders, 120);       // TTL 2 мин
