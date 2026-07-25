import db from "../../lib/db"

/* ================================================================
   OSGARD · DurableCache (SQLite)
   ----------------------------------------------------------------
   Долговременный слой кеша стадий генерации, ПЕРЕЖИВАЮЩИЙ рестарт
   процесса. Проблема, которую он решает: cacheService при отсутствии
   Redis падает на in-memory Map, а она обнуляется при каждом
   перезапуске бэкенда — то есть повторная/похожая генерация сложного
   проекта каждый раз начиналась бы с нуля.

   Здесь артефакты стадий (тяжёлые AI-выводы, ключ = хеш входа) пишутся
   в ту же SQLite, что и остальные данные приложения, поэтому переживают
   рестарт даже без Redis. Используется в связке с cacheService в
   AgentCache: cacheService — быстрый L1 (Redis/память), durableCache —
   L2, который восстанавливает кеш после перезапуска.

   Только для тяжёлых, редко меняющихся артефактов генерации — НЕ для
   горячих данных (баланс/курсы), у которых свой короткий TTL в
   cacheService.
   ================================================================ */

db.exec(`
  CREATE TABLE IF NOT EXISTS agent_cache (
    cache_key TEXT PRIMARY KEY,
    value     TEXT NOT NULL,
    expires   INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_cache_expires ON agent_cache(expires);
`)

const selectStmt = db.prepare(`SELECT value, expires FROM agent_cache WHERE cache_key = ?`)
const upsertStmt = db.prepare(
  `INSERT INTO agent_cache (cache_key, value, expires) VALUES (?, ?, ?)
   ON CONFLICT(cache_key) DO UPDATE SET value = excluded.value, expires = excluded.expires`,
)
const deleteStmt = db.prepare(`DELETE FROM agent_cache WHERE cache_key = ?`)
const sweepStmt = db.prepare(`DELETE FROM agent_cache WHERE expires < ?`)

let writeCounter = 0

export const durableCache = {
  get<T = any>(key: string): T | null {
    try {
      const row = selectStmt.get(key) as { value: string; expires: number } | undefined
      if (!row) return null
      if (row.expires < Date.now()) {
        deleteStmt.run(key)
        return null
      }
      return JSON.parse(row.value) as T
    } catch (err: any) {
      console.warn("[durable-cache] get failed:", err?.message ?? err)
      return null
    }
  },

  set(key: string, value: unknown, ttlSeconds: number): void {
    try {
      upsertStmt.run(key, JSON.stringify(value), Date.now() + ttlSeconds * 1000)
      // Раз в ~50 записей подчищаем протухшие строки, чтобы таблица не росла.
      if (++writeCounter % 50 === 0) sweepStmt.run(Date.now())
    } catch (err: any) {
      console.warn("[durable-cache] set failed:", err?.message ?? err)
    }
  },

  del(key: string): void {
    try {
      deleteStmt.run(key)
    } catch (err: any) {
      console.warn("[durable-cache] del failed:", err?.message ?? err)
    }
  },
}
