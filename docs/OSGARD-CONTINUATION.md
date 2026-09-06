# OSGARD continuation

This file is the entry point for a new work session on the OSGARD project-creation platform.

## Workspace and production

- Repository: `A:\HADJAL\osgard-work\osgard-project-platform`
- Git remote: `https://github.com/HADJAL001/asgard-redesign.git`
- Production web: `https://osgardnewworld.com`
- Production API: `https://asgard-backend-production.up.railway.app`
- API health: `https://asgard-backend-production.up.railway.app/health`
- Railway project/service: `asgard-backend` / `asgard-backend`, production environment
- Do not modify the separate OSMAN One project.

Do not commit user-owned landing changes or local screenshots without first reviewing them. The working tree may contain intentional changes in `components/eternity-landing.tsx`, `e2e/landing-interview.spec.ts`, `vercel.json`, and root PNG files.

## Current product guarantees

1. A web or mobile guest creates a real server-side project, not mobile demo data.
2. Mobile collects the project idea, then requires a four-question brief before generation begins.
3. Guest project ownership is retained in secure storage and transferred with `POST /guest/claim` after registration or login.
4. A failed transfer is retried once a real mobile session is restored. The claim token is cleared only after success.
5. Guest claim access lasts seven days. The server still enforces one project per guest account.
6. Public release requires a real build proof (`sandbox` or `cluster-build`) and design score of at least 80. Broken builds cannot be bypassed.

## Recent published commits

- `3ac0cc6` Guest project claim token lifetime is seven days; backend deployment verified online.
- `8771f0c` Mobile route guard preserves the guest's entered project brief for the interview.
- `8078b93` Mobile retries a retained guest-project claim after a transient failure.
- `cecf300` Tests protect guest claim token clearing and retry behavior.
- `26cbf51` Mobile guests have a profile action to create an account and preserve the project.
- `4d52513` Mobile guest flow uses the real project platform rather than `/demo/generate`.
- `61f1c7a` Own-cluster deploy records successful Docker build and live health proof.
- `8cefd91` Release quality gate requires verified build and premium design review.

## Verification commands

```powershell
# Backend
Set-Location A:\HADJAL\osgard-work\osgard-project-platform\backend
npm run build
npx tsx --test src/tests/guest-funnel.test.ts src/tests/guest-reaper.test.ts
npx tsx --test src/tests/engineering-gate.test.ts src/tests/own-cluster-deploy.test.ts

# Web
Set-Location A:\HADJAL\osgard-work\osgard-project-platform
npm run lint
npm run build

# Mobile
Set-Location A:\HADJAL\osgard-work\osgard-project-platform\mobile
npm run lint
npx tsc --noEmit
npm test -- --runTestsByPath app/__tests__/guest-home.test.tsx app/__tests__/create-project-interview.test.tsx store/__tests__/guestStore.test.ts

# Production
Invoke-WebRequest https://osgardnewworld.com -UseBasicParsing
Invoke-WebRequest https://asgard-backend-production.up.railway.app/health -UseBasicParsing
railway status
```

## Publishing safely

The local feature branch may contain historic divergence. Commit only task files, then publish only that commit from a temporary detached worktree based on `origin/main`:

```powershell
git fetch origin
git worktree add --detach C:\Users\HADJAL\AppData\Local\Temp\osgard-publish origin/main
git -C C:\Users\HADJAL\AppData\Local\Temp\osgard-publish cherry-pick <source-commit-hash>
git -C C:\Users\HADJAL\AppData\Local\Temp\osgard-publish push origin HEAD:main
git worktree remove C:\Users\HADJAL\AppData\Local\Temp\osgard-publish
```

Always use the explicit source hash in the `cherry-pick` command; `HEAD` inside the temporary worktree points to `origin/main`, not to the source branch.

## Operational limits

- Do not purchase services, create paid accounts, or rotate production secrets without explicit approval.
- Keep payment provider credentials only in Railway variables. Never emit them in terminal output, source, or documentation.
- A mobile binary release is separate from pushing the repository. Use the EAS checklist only when build/submission authorization is available.
