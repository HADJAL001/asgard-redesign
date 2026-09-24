# OSGARD AI-first Design System

The isolated `/cofounder` command deck is the reference surface for the platform's AI workflow.

## Runtime contract

- Tokens: `GET /api/design/tokens?preset=<minimal|bold|playful|corporate|futuristic>`
- Universal manifest: `GET /api/design/manifest?app=<client-id>&preset=<preset>` returns the component registry, layout contract, cinematic scenes, and accessibility/performance guardrails.
- Blueprint compiler: `POST /api/design/blueprint` accepts a bounded client brief and returns a component-only blueprint with the cinematic delivery stages. Unknown components and arbitrary HTML are discarded.
- Tenant branding: `GET /api/design/tenant` (host allowlisted to `osgardnewworld.com`)
- Themes and presets are applied by `DesignSystemProvider` and persisted locally for the current browser.
- Hull surfaces use `ds-hull`; interactive controls use `ds-focus` and reduced-motion media rules.

The manifest is the boundary for AI-generated client interfaces: generation may choose only registry components and declared states. It must not emit arbitrary HTML, and the cinematic layer falls back to static progress when motion is reduced or the device is constrained.

## Tenant white-label persistence

Public brand resolution is scoped to `osgardnewworld.com` and returns a safe
default when no authenticated context is present. Authenticated users persist
their own brand through the backend contract:

- `GET /design/tenant/brand` returns the caller's brand or `null`.
- `PUT /design/tenant/brand` accepts `{ name, accent, displayFont }`.
- `user_id` is the isolation boundary; rows cannot be read or written for
  another account.
- `/api/design/tenant` forwards the bearer token server-side and falls back to
  the public OSGARD brand when the backend is unavailable.

Migration: `backend/src/migrations/125_tenant_design_brand.ts`.

## Verification

- `npx playwright test e2e/design-system.spec.ts --config=playwright.production.config.ts`
- `node scripts/design-system-performance.mjs`
- `npm run build`

The general OSGARD dashboard is intentionally outside this visual scope; only the Cofounder command deck consumes this system.
