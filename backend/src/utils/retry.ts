/* ================================================================
   OSGARD · withRetry
   ----------------------------------------------------------------
   Универсальная обёртка с экспоненциальным бэкоффом (+ джиттер) для
   вызовов внешних API (Vercel, GitHub и т.п.), где сетевые сбои и
   временные 5xx/429 — норма, а не исключение.

   Пример:
     const repo = await withRetry(() => octokit.repos.get({ owner, repo: name }))
   ================================================================ */

export type RetryOptions = {
  /** Количество повторных попыток ПОСЛЕ первой (итого попыток = retries + 1). */
  retries?: number
  baseDelayMs?: number
  maxDelayMs?: number
  onRetry?: (err: unknown, attempt: number) => void
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 8000, onRetry } = options

  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (attempt === retries) break
      onRetry?.(err, attempt + 1)
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) + Math.random() * 200
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastErr
}
