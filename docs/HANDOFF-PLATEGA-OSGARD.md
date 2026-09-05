# OSGARD: handoff for Platega integration

Updated: 2026-09-06

## Workspace and production

- Repository root: `A:\HADJAL\osgard-work\osgard-project-platform`
- Frontend: `A:\HADJAL\osgard-work\osgard-project-platform`
- Backend: `A:\HADJAL\osgard-work\osgard-project-platform\backend`
- Backend entry point: `backend/src/server.ts`
- Frontend production domain: `https://osgardnewworld.com`
- Backend production health endpoint: `https://asgard-backend-production.up.railway.app/health`
- Deployment branch: `main` (current local branch when this note was written: `feat/osgard-project-platform`)

Do not work in `A:\РАБОТА ОСМАНА` and do not modify the separate OSMAN One project.

## Product requirements already agreed

- Preserve the globe and star-field landing design.
- RuStore stays in the top-right navigation.
- WALLI must not return to the landing hero.
- Keep ecosystem links: `gardvpn.is`, `osgardos.com`, `superday.run`, `osgardvanguard.studio`, and `senjorio.com`.
- Do not promise financial return, appreciation, or Bitcoin equivalence for artifacts or TimeCoin.

## Project creation flow

The landing page must interview the person before starting generation. This is already implemented:

1. Initial idea.
2. Target audience.
3. Desired result.
4. First-version essentials.
5. Optional constraints.

Generation is rejected by the backend if the structured brief is incomplete.

Main files:

- `components/eternity-landing.tsx`
- `lib/project-brief.ts`
- `backend/src/lib/project-brief.ts`
- `backend/src/routes/projects.routes.ts`
- `mobile/app/(tabs)/index.tsx`
- `mobile/lib/project-brief.ts`

## Current Platega state

- Platega merchant cabinet was open in Microsoft Edge at `https://my.platega.io/...`.
- Current merchant/cashier belongs to GARD VPN, not a dedicated OSGARD cashier.
- Merchant ID shown in the cabinet: `e5fc30e9-4530-4338-9d81-747fd2bb618e`.
- The Platega settings page exposes `API key` (generate button) and `Callback URL`.
- An invoice draft dialog was opened once, but no invoice was submitted and no payment link was created.
- No API key was generated or copied. Do not put it in the repository or chat.

## Local implementation completed on 2026-09-06

- `backend/src/lib/platega.ts`: official Platega headers and calls to `POST /v2/transaction/process` and `GET /transaction/{id}`.
- `backend/src/routes/platega.routes.ts`: authenticated checkout and idempotent webhook processing.
- `backend/src/migrations/109_platega_payments.ts`: separate payment ledger.
- `backend/src/server.ts`: mounts `/platega` and applies the migration.
- `components/pricing-view.tsx`: adds the Platega checkout button.
- `backend/.env.example`: documents Platega variables.

The backend TypeScript build passed after these changes. Live checkout remains intentionally unavailable until the Platega credentials are saved in Railway.

## Required implementation: Platega

Implement Platega as the only Russian payment provider for OSGARD. The old YooKassa code is being removed.

1. Obtain the current Platega API specification from `https://docs.platega.io`.
2. Add a dedicated backend client, route, database table/migration, and tests. Do not reuse Stripe tables for Platega idempotency.
3. Add environment variables only to `backend/.env.example` with blank values:
   - `PLATEGA_MERCHANT_ID`
   - `PLATEGA_API_KEY`
   - `PLATEGA_CALLBACK_SECRET` only if Platega documents a callback signature secret.
4. The create-payment endpoint must require authentication, accept only server-side configured plan prices, create an idempotent payment, and return the hosted payment URL.
5. The callback must verify the provider's documented authenticity mechanism and verify the actual transaction status through Platega's API before activating a subscription.
6. Activate a plan only once per transaction, write a transaction/audit event, and return HTTP 200 for duplicates.
7. Set callback URL in the Platega cabinet to:
   `https://asgard-backend-production.up.railway.app/platega/webhook`
8. Store production secrets in Railway service variables only. Never commit them, paste them into terminal output, or put them in frontend variables.
9. Add the Platega checkout button to `components/pricing-view.tsx` only after the server route and callback are tested.
10. Create a 1 RUB test invoice only after the callback endpoint is deployed. Use return URL `https://osgardnewworld.com/wallet?checkout=success&provider=platega` and description `OSGARD platform integration test`.

## YooKassa removal in progress

The following changes are already made locally and must be validated, completed, and committed together:

- Deleted `backend/src/lib/yookassa.ts`
- Deleted `backend/src/routes/yookassa.routes.ts`
- Deleted `backend/src/migrations/075_yookassa_payments.ts`
- Deleted `docs/yookassa-setup.md`
- Removed route and migration import from `backend/src/server.ts`
- Removed YooKassa controls and modal from `components/pricing-view.tsx`
- Updated a YooKassa mention in `backend/src/routes/secret-room.routes.ts`

Remaining cleanup:

- Remove `YOOKASSA_*` lines from `backend/.env.example`.
- `PART3_STATUS.md` only contains historical notes. Keep it as history or add a concise note that YooKassa was retired; do not rewrite unrelated historical records.
- Run `rg -n -i 'yookassa|юkassa|юкасса' --glob '!node_modules' .` after implementation.

## Worktree safety

User-owned or unrelated files currently modified/untracked must not be reverted or staged accidentally:

- `next-env.d.ts`
- `vercel.json`
- PNG visual-verification files at repository root

Current task-related uncommitted files also include:

- `components/eternity-landing.tsx`
- `e2e/landing-interview.spec.ts`
- YooKassa-removal files listed above

Before committing, inspect `git diff` carefully and stage only the completed, intended files.

## Validation and release

Run before deploy:

```powershell
npm run lint
npm run build
npx playwright test e2e/landing-interview.spec.ts
cd backend
npm run build
```

Deploy with:

```powershell
git push origin HEAD:main
```

Then check Railway health and Vercel production. The API key must be configured in Railway before the payment button is enabled for live users.
