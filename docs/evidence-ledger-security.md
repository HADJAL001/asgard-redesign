# Evidence Ledger Security Contract

The evidence ledger is a release control, not a client-side status indicator.

## Write contract

- A blueprint creation response includes one 64-character `evidenceToken`.
- The token is stored separately in `BLUEPRINT_EVIDENCE_TOKENS_PATH` and is never included in replay pages or public blueprint reads.
- `POST /api/design/blueprint/:id/evidence` requires the token, the current contract hash, a known evidence kind/status, and bounded payload fields.
- Token comparison is constant-time. Invalid or missing tokens return `403`.
- Evidence payloads larger than 16 KB are rejected before JSON parsing with `413`.

## Trust model

Evidence is scoped to one blueprint id. Possession of a token allows quality-gate writes for that blueprint only; it does not grant access to another blueprint or to code generation. Codegen still requires current passed gates and explicit approval.

## Operations

- Back up `BLUEPRINT_EVIDENCE_TOKENS_PATH` together with the blueprint and evidence stores.
- Restore the three stores as one snapshot. Restoring only the blueprint store makes new evidence writes fail closed, which is preferable to accepting unverifiable evidence.
- Never log or expose `evidenceToken`; redact it from support screenshots and incident reports.
- Run `npm run test:design-system-browser` after deploy. The gate verifies valid writes, replay rendering, visual diff, deploy health, and the evidence ledger.

## Required release evidence

The current revision must have passed `security`, `performance`, `a11y`, `visual-diff`, and `deploy` evidence with the same contract hash, then receive explicit approval before codegen.
