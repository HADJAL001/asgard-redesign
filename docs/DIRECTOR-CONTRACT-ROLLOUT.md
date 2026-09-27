# Cofounder → Director → Build Status

This document distinguishes implemented behavior from planned provider work. It covers only the OSGARD product in this repository and `osgardnewworld.com`.

## Delivered in this change

- Cofounder code generation now sends the approved blueprint as the existing strict `ProductContract`, plus blueprint ID, tenant, revision, contract hash, storyboard components, and architecture notes.
- The Next.js handoff signs that payload with HMAC-SHA256 using `PRODUCT_CONTRACT_SIGNING_KEY`, or the already-required `ARTIFACT_SIGNING_KEY` as a domain-separated fallback. The backend verifies the signature before queuing generation. Missing signing configuration fails closed with `503`; changed payloads are rejected.
- The validated contract and blueprint provenance are stored in the generation task input. The contract hash binds the task to the approved revision.
- The first analyst receives the actual description string rather than the enclosing task object. The verified Director Plan is carried through the ChainManager context and injected into Architect, Designer, Frontend, Backend, and QA agent inputs.
- Frontend/backend prompts now receive selected product type and Visual DNA; QA receives the contract requirements as acceptance criteria.
- User-entered constraints are emitted as separate ProductContract requirements, each linked to the exact blueprint revision and contract hash. A focused unit test verifies their preservation and provenance.
- Removed the Cofounder panel-open interview requests that used the fabricated idea `new product` and empty answers. The form now uses explicit deterministic prompts; the interview API is not presented as powering this form until it can ask context-aware follow-ups from actual answers.
- Existing callers that do not submit a ProductContract continue to use the previous generation path.

## Verification

- `npm run test:product-contract`: 5 tests pass, including valid signature, tamper rejection, invalid contract rejection, missing-key fail-closed behavior, task-context extraction, and user-constraint provenance.
- `npm run lint:quality`: passes.
- `npm run build` (repository root): passes, including Next.js TypeScript and production build.
- `npm run build` (backend): currently cannot pass in this checkout. Backend dependencies/types are not installed/resolvable (`joi`, `better-sqlite3`, `ioredis`, `@octokit/rest`, and other declared dependencies); the resulting type errors also affect existing unrelated routes. The changed backend files produced no additional errors beyond that dependency/type-resolution baseline in the observed output.

## Existing capabilities, verified in source

- The production pipeline is a fixed director-worker sequence: Business Analyst → Architect → Designer → Frontend → Backend → Tests → parallel Optimization/Security → Deploy.
- ChainManager persists task state and stage artifacts and emits real progress events. The new contract follows that task context; the progress UI should continue to display those actual stages.
- WebContainer live preview is already used by project workspaces and the guest studio, with route-scoped cross-origin isolation. This is not yet proven as a preview generated from a Cofounder blueprint before codegen.
- Vercel and GitHub deployment adapters exist. DeployAgent runs a build sandbox first and returns no app/repo URL on failure. Live publish requires both publish mode and `OSGARD_GENERATION_MODE=publish`.
- Cloudflare and Supabase-management connection checks exist in delivery preflight. A selected integration record or passing preflight is not evidence that a new Stripe/Supabase project has been provisioned.

## Not delivered or not proven

- No autonomous Director review/rework loop (`max_loops=2`) has been implemented. Current orchestration is a fixed pipeline with manual retry, not an agent that evaluates results and reassigns work.
- Cofounder does not yet hand off into Studio with a blueprint-loaded workspace. Avoid launching Studio's separate project wizard from this point; that would create a second generation path. The intended UX is one Creator with Quick and Governed modes over this same contract and pipeline.
- A generated Cofounder preview before code generation, blueprint-to-WebContainer file mounting, sub-60-second preview SLO, and runtime-error repair loop are not yet proven end to end.
- MCP/Conjra/MCP Superstack/Figma MCP are not installed or configured. No MCP call is made by this change. Existing direct adapters remain the source of truth; provider operations must require connection verification and user approval.
- No changes have been deployed or published to production in this change.

## Next implementation gates

1. Install the declared backend dependencies in the supported build environment, then make backend typecheck/tests a required CI gate.
2. Add an authenticated Studio handoff that loads the same blueprint and generation task; remove any parallel generation decision rather than invoking the legacy wizard.
3. Mount generated files into the existing WebContainer workspace and report real boot/build/runtime timings and errors. Set the preview SLO only after measuring real runs.
4. Add a Director evaluation artifact with bounded rework attempts, immutable inputs, and human approval for risky changes. Do not label the current fixed pipeline as autonomous review.
5. Connect providers through existing adapters, least-privilege credentials, per-tenant scopes, approval gates, and verified production callbacks. Do not claim a connection based only on generated code or configuration labels.
6. Exercise golden marketplace/social/app tasks end to end and compare blueprint requirements against generated routes, entities, preview interactions, and quality evidence.
