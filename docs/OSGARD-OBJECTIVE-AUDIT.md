# OSGARD Objective Audit

Updated: 2026-09-27. Scope: `asgard-redesign` and `osgardnewworld.com` only.

| Requirement | Status | Evidence | Remaining condition |
| --- | --- | --- | --- |
| Three-question AI interview | Verified | `CofounderConsole`, `cofounder-interview-guard`, production E2E | None for the current workflow |
| Storyboard before code | Verified | `StoryboardRail`, preview render plan, golden task | None for the current workflow |
| Preview under 60 seconds | Verified | Production golden task: 241 ms; SLA guard: 60,000 ms | Keep under SLA as product load grows |
| Text commands and explainable diff | Verified | Dense, mobile, Stripe commands tested by golden task | Add semantic command coverage as new commands are introduced |
| Visual editor and multi-select | Verified | `BlueprintCanvas`, keyboard/multi-select E2E | None for the current workflow |
| Delivery wizard | Implemented, provider-dependent | Cloudflare zone + DNS-record and exact Supabase project access checks through authenticated read-only adapters; adapter recheck before codegen | Connect live provider credentials and pass adapter tests; separately verify DNS target/deployment health |
| Sandbox and signed artifacts | Implemented, production use pending | Sandbox gate and artifact seal tests | Run an authenticated production codegen task with a signed result |
| Collaboration and approval | Verified | Authenticated approval/comments, anonymous writes rejected | Add role-based approval policy when team roles are enabled |
| Golden tasks and quality gates | Verified | Golden task, 31/31 production E2E, axe, Web Vitals, browser gate | Run the benchmark with `GOLDEN_TASK_COOKIE` after every auth-sensitive release; capture equivalent external competitor runs before comparative claims |
| Product Graph / four-layer memory direction | Foundation implemented, migration pending | Tenant-bound graph projection/replay plus `backend/src/postgres/001_product_memory.sql` with RLS, pgvector and append-only evidence; [runbook](PRODUCT-MEMORY-POSTGRES.md) | Apply to a provisioned Postgres cluster, enable shadow writes, reconcile, then move reads |

## Production evidence

- Full public design-system E2E: 31/31 passed.
- Axe WCAG A/AA: zero violations on `/cofounder` and `/dev`.
- Web Vitals: FCP/LCP under 2.5 s and CLS under 0.1 for Cofounder desktop and mobile.
- Golden workflow: 1.767 s total, with first preview at 262 ms (2026-09-27 production run).

## Conditions before claiming full turnkey delivery

1. Create or connect provider credentials only in encrypted production integration storage.
2. Verify each selected adapter is active and has a current passing test.
3. Run a real authenticated codegen task through sandbox, evidence gates, approval, and deploy.
4. Run `OSGARD_PRODUCT_POSTGRES_URL=... npm run migrate:product-memory-postgres` against a provisioned cluster, then enable shadow writes and reconcile before moving reads.
