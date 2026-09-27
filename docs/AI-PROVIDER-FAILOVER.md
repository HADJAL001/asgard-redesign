# AI Provider Failover

This document records the implemented provider resilience behavior. It does not claim that any provider credential or model is configured in production; readiness probes and actual successful calls remain the source of truth.

## Runtime behavior

- Provider HTTP requests retry at most three total attempts for network errors, timeouts, HTTP 408, HTTP 429, and HTTP 5xx. Backoff is bounded exponential (`250ms`, `500ms`, up to `2s`); a valid `Retry-After` header is honored within the same bound.
- HTTP 4xx errors such as 400 and 401 are not retried. They return control to the provider chain immediately.
- The circuit breaker counts failed provider calls (after the bounded request retries). At five consecutive failures it opens for 60 seconds. It then admits a single half-open request; success closes and resets the circuit, failure reopens it.
- Defaults can be changed with `AI_PROVIDER_CIRCUIT_FAILURE_THRESHOLD` and `AI_PROVIDER_CIRCUIT_OPEN_MS`. Bounds are enforced in code.
- Circuit state is local to one backend process. It is not shared between replicas and is lost on restart. Multi-replica coordination requires a Redis-backed atomic circuit store and is not part of this implementation.
- Vexly is a distinct OpenAI-compatible gateway. It is enabled only when `VEXLY_API_KEY`, `VEXLY_BASE_URL`, and `VEXLY_MODEL` are all present. Its credentials are never inferred from or sent through OpenAI settings.

## Task chains

Chains use the configured adapters and their current environment-selected model IDs. Unconfigured providers return unavailable and are skipped without making a network call.

- Product planning: Vexly, Claude, Kimi, Gemini, OpenAI, DeepSeek.
- Code generation: Vexly first when fully configured, then OpenAI when configured, otherwise DeepSeek first; remaining providers are attempted in the configured role chain.
- Independent review: Vexly, Claude, Kimi, OpenAI, Gemini, DeepSeek.
- General raw generation: Vexly, Claude, Kimi, DeepSeek, Grok, OpenAI, Gemini.
- Blueprint compile already has a typed-JSON acceptance chain across Claude, OpenAI, Gemini, and DeepSeek.

The OpenAI adapter can be pointed at a compatible gateway through the existing `OPENAI_BASE_URL`; telemetry continues to label it `openai`. Anthropic uses its Anthropic Messages adapter unless `CLAUDE_API_FORMAT=openai` explicitly selects a configured compatible gateway. Vexly is labeled separately and requires its own explicit base URL and model.

## Failure output and data handling

- If no provider returns acceptable output, callers receive `null` and use their existing explicit deterministic fallback or report an unavailable/error state. The router does not fabricate a successful model response.
- Existing per-generation telemetry records each provider attempt, usage, latency, and success/failure. Failover logs contain provider adapter names, attempt numbers, and outcome reason only; prompt and response content are not logged. A dedicated durable failover-rate metric/dashboard is not implemented yet.
- No shared LLM response cache was added. A safe cache needs tenant and authorization scoping, prompt/model/version keys, retention rules, and a policy for nondeterministic or side-effecting output. Existing exact-input generation caches remain separate.
- Readiness probes remain advisory and do not replace a successful generation call. They do not coordinate circuits across replicas.

## Verification

- `backend`: `npm run test:file -- src/tests/ai-provider-resilience.test.ts src/tests/ai-router.test.ts` covers gateway URL normalization, transient retries, permanent HTTP errors, Retry-After bounds, network retry, breaker threshold, half-open exclusivity, chain continuation, and provider identity.
- The existing project-readiness suite imports the full generator and cannot run in this checkout because `better-sqlite3` is unavailable. The extracted chain primitive has an isolated test in `ai-provider-resilience.test.ts`.
- The full backend TypeScript build currently fails on missing declared packages/types and unrelated existing route type errors. The changed AI router/resilience modules had no reported diagnostics in the observed build output.
- No production deployment or provider credential verification was performed as part of this change.

## Follow-up gates

1. Add Redis-backed circuit state with atomic half-open leases before relying on this breaker across multiple backend replicas.
2. Export provider health and failover ratios from a protected operational endpoint or metrics sink, then alert on sustained failover rates.
3. Run controlled provider outage tests using staging credentials and cost limits. Confirm actual model entitlements before pinning model IDs.
4. Only consider a response cache after tenant isolation, provenance, invalidation, and privacy tests are in place.
