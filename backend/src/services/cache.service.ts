const cache = new Map<string, { value: any; expires: number }>();

export const cacheService = {
  set(key: string, value: any, ttlSeconds: number = 60) {
    cache.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
  },
  get(key: string) {
    const entry = cache.get(key);
    if (!entry || entry.expires < Date.now()) {
      cache.delete(key);
      return null;
    }
    return entry.value;
  },
  del(key: string) {
    cache.delete(key);
  },
};

// Используй для кэширования баланса казны, курсов, топ-лидеров.
// Примеры:
//   cacheService.set('treasury_balance', balance, 30);       // TTL 30 сек
//   cacheService.set('tc_rates', rates, 60);                 // TTL 60 сек
//   cacheService.set('top_leaders', leaders, 120);           // TTL 2 мин
