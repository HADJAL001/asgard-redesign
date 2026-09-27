export type ProviderResponseLike = {
  status: number
  headers?: { get(name: string): string | null }
}

export type RetryOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export function openAiCompatibleChatCompletionsUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new TypeError("provider_url_must_use_http")
  if (!/\/chat\/completions\/?$/i.test(url.pathname)) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/chat/completions`
  }
  return url.toString()
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return error.name === "TimeoutError" || error.name === "AbortError" || error.name === "TypeError"
}

function retryAfterMs(response: ProviderResponseLike, now: number, maxDelayMs: number): number | null {
  const header = response.headers?.get("retry-after")
  if (!header) return null
  const seconds = Number(header)
  const value = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(header) - now
  return Number.isFinite(value) && value >= 0 ? Math.min(maxDelayMs, value) : null
}

export async function withTransientProviderRetry<T extends ProviderResponseLike>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.min(4, Math.floor(options.maxAttempts ?? 3)))
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250)
  const maxDelayMs = Math.max(baseDelayMs, options.maxDelayMs ?? 2000)
  const sleep = options.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = options.now || Date.now

  for (let attempt = 1; ; attempt += 1) {
    let response: T
    try {
      response = await operation()
    } catch (error) {
      if (attempt >= maxAttempts || !isRetryableError(error)) throw error
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
      await sleep(delay)
      continue
    }

    const retryableStatus = response.status === 408 || response.status === 429 || response.status >= 500
    if (!retryableStatus || attempt >= maxAttempts) return response
    const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
    await sleep(retryAfterMs(response, now(), maxDelayMs) ?? backoff)
  }
}

export type ProviderCircuitSnapshot = {
  state: "closed" | "open" | "half-open"
  failures: number
  retryAt?: number
  reason?: string
  probeInFlight?: boolean
}

export class ProviderCircuit {
  private failures = 0
  private openedUntil = 0
  private halfOpenProbeInFlight = false
  private reason: string | undefined

  constructor(private readonly failureThreshold = 5, private readonly openDurationMs = 60_000) {}

  tryAcquire(now = Date.now()): boolean {
    if (!this.openedUntil) return true
    if (now < this.openedUntil) return false
    if (this.halfOpenProbeInFlight) return false
    this.halfOpenProbeInFlight = true
    return true
  }

  recordFailure(reason: string, now = Date.now()): void {
    if (this.openedUntil && now >= this.openedUntil && this.halfOpenProbeInFlight) {
      this.openedUntil = now + this.openDurationMs
      this.halfOpenProbeInFlight = false
      this.reason = reason
      return
    }
    this.failures += 1
    this.reason = reason
    if (this.failures >= this.failureThreshold) this.openedUntil = now + this.openDurationMs
  }

  recordSuccess(): void {
    this.failures = 0
    this.openedUntil = 0
    this.halfOpenProbeInFlight = false
    this.reason = undefined
  }

  snapshot(now = Date.now()): ProviderCircuitSnapshot {
    if (!this.openedUntil) return { state: "closed", failures: this.failures, ...(this.reason ? { reason: this.reason } : {}) }
    if (now < this.openedUntil) return { state: "open", failures: this.failures, retryAt: this.openedUntil, reason: this.reason }
    return { state: "half-open", failures: this.failures, retryAt: this.openedUntil, reason: this.reason, probeInFlight: this.halfOpenProbeInFlight }
  }
}
