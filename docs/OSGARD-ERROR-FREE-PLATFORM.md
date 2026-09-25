# OSGARD Error Intelligence Platform

## Product decision

OSGARD will not promise impossible "zero errors". It will own a stronger,
measurable category: an evidence-backed control plane that prevents defects,
detects them quickly, explains them, proposes bounded repairs, verifies the
repair, and learns only from confirmed outcomes.

The first version is a module inside `asgard-redesign` and
`osgardnewworld.com`. It may later be extracted into a standalone multi-tenant
service without changing the portable contract and evidence APIs.

```text
Intent/ProductContract
  -> preflight scans
  -> isolated build and tests
  -> explainable repair proposal
  -> sandbox verification
  -> approval and signed artifact
  -> canary deploy
  -> runtime telemetry and incident detection
  -> rollback or verified learning
```

## Team charter

The permanent product team has eight tracks:

1. Architecture: ProductContract, Product Graph, evidence and API compatibility.
2. Compiler and static analysis: TypeScript, schema, lint, SAST, dependency and secret checks.
3. Sandbox and supply chain: isolated execution, SBOM, signatures and provenance.
4. Runtime/SRE: OpenTelemetry, synthetic tasks, canary and rollback.
5. Security and privacy: RLS, redaction, quotas, retention and policy packs.
6. UX and review: live scan timeline, plain-language diagnostics, diff and approval room.
7. Evaluation: golden tasks and reproducible comparison against Lovable, Bolt.new and Tilda.
8. Integrations: domains, DNS, Supabase, providers and external CI/IDE APIs.

Every track ships evidence, not screenshots or claims. High-risk changes require
human approval; no agent may execute arbitrary client-supplied shell commands.

## Core entities

```text
ErrorRun       tenantId, blueprintId, revision, contractHash, phase, status, toolchain
Finding        fingerprint, category, severity, confidence, source, evidenceRefs, state
RepairAttempt  findingIds, patchHash, model, sandboxRunId, diffSummary, outcome
QualityGate    kind, threshold, actual, status, evidenceId
Incident       artifactHash, releaseId, fingerprint, impact, rollbackReleaseId
LearningCase   patternHash, verifiedFix, outcome, approval, visibility
```

New Product Graph nodes: `error-run`, `finding`, `repair`, `incident`, `artifact`.
New edges: `detected_in`, `caused_by`, `proposed_fix`, `verified_by`,
`regressed_in`, `rolled_back_to`, `learned_from`.

Every record is bound to server-derived `tenantId`, exact revision and
`contractHash`. A stale hash cannot satisfy a deploy gate.

## Detection planes

### Before code generation

- ProductContract and typed intent consistency.
- Schema/type validation and component allowlist.
- Dependency lock, SBOM, license and vulnerability scan.
- Secret/PII scan, SAST and policy checks.
- Accessibility and performance budgets.

### In the sandbox

- Ephemeral non-root runner; network disabled by default.
- CPU, memory, process and time limits.
- Typecheck, lint, unit/integration/E2E, axe, Lighthouse and visual diff.
- SARIF-style findings with redacted logs.
- Maximum three repair attempts; repeated fingerprints stop the loop.

### In production

- OpenTelemetry traces, frontend crashes, API 5xx and Web Vitals.
- Synthetic golden tasks and canary health checks.
- Grouped incidents by normalized fingerprint, route and artifact hash.
- Policy-controlled rollback when SLOs breach.

## Repair policy

Auto-repair is allowed only for low-risk deterministic classes such as imports,
types, formatting and missing accessible labels. Medium-risk fixes produce a
proposal and explainable diff. Security-critical, data-migration, provider and
infrastructure changes always require explicit approval.

A patch is accepted only when:

1. The original finding disappears.
2. No new high or critical findings appear.
3. Required tests and quality gates pass for the same contract hash.
4. The artifact, source revision, sandbox image and evidence are signed.

## Learning without customer-data leakage

Raw source, secrets and logs never enter global learning. Store redacted,
tenant-scoped evidence and aggregate only normalized fingerprints and verified
fix features. Promote a Playbook rule after at least three independent
successful runs, no critical regression, and review approval. Tenants can opt
out, export or delete their learning data.

## API surface

```text
POST /api/error-intelligence/runs
GET  /api/error-intelligence/runs/:id
GET  /api/error-intelligence/runs/:id/findings
POST /api/error-intelligence/runs/:id/repair       # dry-run by default
POST /api/error-intelligence/runs/:id/recheck
POST /api/error-intelligence/findings/:id/suppress # expiry + approver required
POST /api/error-intelligence/incidents/:id/rollback
GET  /api/error-intelligence/patterns              # tenant-safe aggregates only

# ProductContract-bound edit loop
POST /api/design/blueprint/:id/command              # dry-run by default; returns explainable diff
```

All mutations require tenant context, idempotency keys, payload limits and
evidence references. The client cannot submit a tenant ID or arbitrary command.

## 90-day rollout

### Days 0-30: prevention foundation

ErrorRun/Finding schemas, scanner orchestrator, fingerprints, evidence adapters,
developer timeline and first 20 golden tasks.

### Days 31-60: verified repair

Sandbox runner, SARIF ingestion, explainable diff, three-attempt repair loop,
artifact signatures and Product Graph integration.

### Days 61-90: production control

OpenTelemetry, synthetic monitoring, canary release, incident UI, rollback,
approval room and tenant policy packs.

### Months 3-12: category moat

Postgres/RLS migration, model gateway, portable external CI/IDE API, privacy-safe
verified Playbook marketplace and benchmark dashboard.

## Measurable definition of best

- Preflight p95 <= 10 seconds cached, <= 60 seconds full.
- First valid preview p50 <= 60 seconds, p95 <= 180 seconds.
- Critical escaped defects < 1 per 100 production deploys.
- Repair precision >= 90%; repair regression rate < 3%.
- Detection-to-alert <= 60 seconds; rollback complete <= 5 minutes.
- 100% of releases carry contract hash, SBOM, signature and evidence bundle.
- WCAG critical violations = 0; LCP <= 2.5s; INP <= 200ms; CLS <= 0.1.
- Zero cross-tenant reads in automated RLS tests.

The defensible promise is therefore: **OSGARD makes the path to a correct,
reviewable, reproducible release dramatically faster and safer, and proves why
the release is trusted.**

## Model Gateway

Models connect server-side through the existing orchestrator adapters. API keys
never reach the browser, ProductContract, Evidence Ledger, or generated client
code. The gateway chooses a model by task risk, latency budget, cost, and
benchmark score, and records provider/model/latency/token evidence for every call.

| Role | Default model | Responsibility |
| --- | --- | --- |
| Architecture and high-risk review | Claude Opus 5 | threat model, contract review, difficult diagnosis, final review |
| Code generation and typed repair | GPT-5.6 Sol | TypeScript/React generation, schema transforms, deterministic patches |
| Fast interaction and triage | Gemini 3.7 Flash | interview, UI copy, quick diagnostics, progress summaries, low-risk classification |

Recommended routing:

```text
3-question interview          -> Gemini Flash
ProductContract/storyboard    -> GPT Sol, Claude review
new application code           -> GPT Sol
security/RLS/billing review   -> Claude Opus
lint/type/test diagnosis      -> Gemini triage -> GPT patch
patch approval for high risk  -> Claude Opus
visual/a11y summary            -> Gemini Flash
```

The first provider failure triggers a policy-approved fallback, never a silent
model swap. High-risk tasks cannot fall back to a cheaper model without an
explicit policy decision. Each model response is treated as an untrusted
proposal until sandbox tests and evidence gates pass.

Server configuration is intentionally provider-specific:

```text
ANTHROPIC_API_KEY=...        ANTHROPIC_REASONING_MODEL=claude-opus-5
OPENAI_API_KEY=...           OPENAI_MODEL=gpt-5.6-sol
GEMINI_API_KEY=...           GEMINI_MODEL=gemini-3.7-flash
```

The exact model IDs remain environment overrides because provider catalogues can
change. Production activation requires a provider probe, pricing entry,
timeout/circuit-breaker policy, and a golden-task benchmark before the model is
eligible for routing.
