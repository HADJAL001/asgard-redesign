# Release evidence: 2026-09-30

Production target: `https://osgardnewworld.com` only.

## Published commits

- PR #245: `2415afe973330a9764a13e4d828e17672e32c4d5`
- PR #246: `6907c4ff77990671e26eebdfd31d77b0eeda2a50`
- PR #247: `11c95990bf6525ad513a5ea5b1818e598bb5db4b`

## Evidence

- Production design-system contract: passed.
- Backend build/test contract: passed.
- Security audit, gitleaks and CodeQL: passed.
- Authenticated golden workflow benchmark: passed.
- Vercel deployment: completed.
- `GET /api/health`: `ok: true`; database and SSE healthy.
- Homepage: HTTP 200 with CSP, HSTS, frame and permissions policies.

## Release policy note

Android Detox is intentionally skipped for this web-only release. The emulator
job repeatedly failed during infrastructure-level Gradle/ADB startup before
executing tests. Mobile changes must re-enable and pass that job before a
mobile release is considered verified.

## Runtime budget

Blueprint assembly evidence uses a 2,000 ms budget. The measured duration and
pass/fail result are stored in the evidence ledger under
`blueprint-runtime-budget`.
