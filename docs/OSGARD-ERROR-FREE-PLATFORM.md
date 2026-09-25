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
