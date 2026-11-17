# asgard-redesign · OSGARD Premium V9 native public entry

Site: `/premium-ab-preview/index.html` (exact URL is used rather than relying on directory-index rewrites).

This is an additional A/B cinematic brand route with **local** original `hero-a/hero-b` artwork, a link back to the real application `/` and a link to the seven-product design gallery. It runs without remote scripts and without touching auth, API, billing or production data.

## Required checks

1. Run `node scripts/check-premium-bridge.mjs newworld` (no secrets or installation required).
2. CI workflow `premium-bridge-quality.yml` must be PASS for same SHA.
3. Build the existing application through its normal pipeline; the Vite/Next public directory should preserve this folder.
4. Only after the target system reports a deploy: HTTPS GET exact route, JS/CSS/WebP 200, A/B switch, 320px mobile and real app `/` link.

The visual prototype must not be mistaken for completed backend integration. It is an opt-in brand landing. To redesign real app screens, create a separate functional PR with regression tests for financial transactions/auth/workspaces.

Rollback: revert this additive commit or delete `public/premium-ab-preview/**`, `scripts/check-premium-bridge.mjs`, `scripts/premium-expected.json`, `.github/workflows/premium-bridge-quality.yml`, `docs/OSGARD_PREMIUM_V9.md`.
