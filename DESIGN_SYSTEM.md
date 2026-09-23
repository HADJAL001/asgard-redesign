# OSGARD AI-first Design System

The isolated `/cofounder` command deck is the reference surface for the platform's AI workflow.

## Runtime contract

- Tokens: `GET /api/design/tokens?preset=<minimal|bold|playful|corporate|futuristic>`
- Tenant branding: `GET /api/design/tenant` (host allowlisted to `osgardnewworld.com`)
- Themes and presets are applied by `DesignSystemProvider` and persisted locally for the current browser.
- Hull surfaces use `ds-hull`; interactive controls use `ds-focus` and reduced-motion media rules.

## Verification

- `npx playwright test e2e/design-system.spec.ts --config=playwright.production.config.ts`
- `node scripts/design-system-performance.mjs`
- `npm run build`

The general OSGARD dashboard is intentionally outside this visual scope; only the Cofounder command deck consumes this system.
