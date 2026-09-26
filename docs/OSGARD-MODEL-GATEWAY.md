# OSGARD Model Gateway

The production model split is intentionally role-based. API keys never leave the backend and are never included in ProductContract, browser HTML, telemetry payloads, or generated artifacts.

| Role | Provider/model | Used for | Why |
| --- | --- | --- | --- |
| Architect / Reviewer | Anthropic Claude Opus 5 | ProductContract review, threat modeling, final quality gates, rollback decisions | Highest reasoning budget is reserved for decisions that can create production risk. |
| Builder / Repair | OpenAI GPT-5.6 Sol | React/TypeScript generation, bounded repair patches, explainable diffs | Strong code transformation lane with typed contracts and deterministic limits. |
| Fast lane | Google Gemini 3.7 Flash | Three-question interview, intent classification, triage, summaries, progress updates | Low latency keeps the <60s preview workflow responsive. |

## Runtime wiring

The orchestration node types are the stable boundary:

- `claude`: architecture and review lane. Use `ANTHROPIC_REASONING_MODEL` for the Opus model when a chain needs the reasoning lane.
- `openai`: code generation and repair lane. Uses the OpenAI Responses API.
- `gemini`: interview/triage lane. Uses the Gemini `generateContent` API.

Each node is tenant-scoped, quota checked, time limited, and recorded in generation telemetry. A failed provider produces an explicit evidence event; it is not silently treated as a successful generation.

## Activation proof

`GET /design/provider-readiness` is authenticated and runs a token-free catalogue preflight for Claude, OpenAI and Gemini. It returns only `configured`, `available` and the assigned role; credentials, provider endpoints and account metadata are never exposed. A configured key is not treated as active until its requested model is discoverable.

For the production service, the operator sets the values in `/etc/osgard-platform/web.env`, restarts `osgard-web.service`, then opens the protected endpoint. This is the activation record; an absent key or unavailable model remains visible as unavailable instead of silently falling through as a successful AI generation.

## Production environment

Set these values on the `osgard-web` service only:

```env
ANTHROPIC_API_KEY=...
ANTHROPIC_REASONING_MODEL=claude-opus-5
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-sol
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.7-flash
```

Model identifiers are environment overrides because provider gateways can publish a different canonical ID. Never commit these values or put them in `NEXT_PUBLIC_*` variables.

## Generated artifact provenance

Every completed generation with a delivery URL is bound to its tenant, blueprint revision,
ProductContract hash, task ID and sanitized result URLs by a server-side HMAC seal. Configure
the key only in the `osgard-web` production service:

```env
ARTIFACT_SIGNING_KEY=long-random-secret-not-stored-in-git
```

The UI and Evidence Ledger receive only the seal state and digest prefix. The secret is never
returned to the browser. If the key is unavailable, the response explicitly reports
`sealStatus: "unavailable"`; an unsigned artifact cannot be represented as verified provenance.

## Request routing policy

1. Interview and intent extraction: `POST /design/interview` uses Gemini Flash first; deterministic three-question validation remains authoritative and is the fallback when Gemini is unavailable.
2. Blueprint architecture and risk review: `claude` with the Opus reasoning model.
3. Code generation and repair: `openai` (GPT-5.6 Sol) when `OPENAI_API_KEY` is configured; DeepSeek/Kimi remain ordered fallbacks. Output is accepted only after sandbox, typecheck, accessibility, security, performance, and visual evidence gates.
4. Final approval: `claude` reviews the typed diff and evidence ledger; a human approval is still required for deploy.

The gateway is an implementation detail of OSGARD. Tenants select a product outcome and quality policy, not raw provider credentials.
