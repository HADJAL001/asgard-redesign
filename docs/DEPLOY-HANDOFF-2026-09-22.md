# Production deploy handoff - 2026-09-22

## Goal

Publish the current `main` branch of `HADJAL001/asgard-redesign` to `https://osgardnewworld.com`.

## Repository state

- Branch: `main`
- HEAD: `0376488f feat: execute prikaz 011 visual cleanup`
- `npm run build`: passed
- `npm run lint`: six pre-existing errors in `components/JarvisAvatar.tsx` and `components/section-help.tsx`
- Preserve unrelated working-tree files: `next-env.d.ts`, `AGENTS.md`, `CLAUDE.md`

## Target VPS

- Provider: Contabo
- VPS ID: `203602351`
- Host: `109.123.240.180`
- User: `root`
- SSH port responds (`Test-NetConnection` succeeded)
- Docker is not installed; expected deployment is nginx plus a systemd/Node process or static web root.

## Current blocker

The Contabo password reset confirmation was submitted, but SSH still returns `Authentication failed` for the newly generated password. Existing local keys (`osgard_contabo`, `osgard_infra`, `id_ed25519`, `id_rsa`) also do not authenticate. Do not reinstall or use rescue mode. Re-open the Contabo password reset page, set a fresh temporary password, confirm it, wait for the reset to finish, then retry SSH.

## Once SSH works

1. Read-only discovery: `nginx -T`; inspect `/var/www`, `/srv`, `/opt`, systemd and PM2 processes.
2. Inspect `/root/deploy-dist.tgz` before use; it already exists on the VPS.
3. Create a timestamped backup of the discovered web root/process directory.
4. Upload the current production build and required `public` assets, including `public/textures/earth/earth-day.jpg` and `earth-night.jpg`.
5. Restart only the identified service and verify rollback path.
6. Check `curl -I https://osgardnewworld.com` and both earth texture URLs return `200` with non-zero size.

## Previously observed live issue

Before this deploy, the domain returned `200`, but `/textures/earth/earth-day.jpg` and `/textures/earth/earth-night.jpg` returned `404`.

## Latest verification

- `https://osgardnewworld.com`: `200`
- `/textures/earth/earth-day.jpg`: `404`
- `/textures/earth/earth-night.jpg`: `404`
- SSH port is reachable, but root password authentication still returns `Authentication failed` after the confirmed reset attempt.

## Deployment completed

- Actual production host: `84.46.244.117` (SSH key access), not the unavailable Contabo password path.
- Deployed commit: `0376488`.
- Service: `osgard-web.service` is `active`.
- Backup: `/opt/osgard-platform/releases/current-before-20260922-0376488`.
- Live checks: `/` and `/login` return `200`.
- `earth-day.jpg`: `200`, 2,566,770 bytes.
- `earth-night.jpg`: `200`, 794,479 bytes.

## Visual pass - 2026-09-22

- Globe uses Blue Marble day map, restrained night emissive, lower exposure and softer directional lighting; hotspot badges are always visible with icon and label.
- Orchestrator showcase uses a larger cinematic canvas, tighter constellation scale, orbital glow layers and stronger node lighting.
- Build completed on the production checkout; `osgard-web.service` is active.
- Remote checks: local Next.js and public nginx endpoint both return `200` from the VPS.
- Visual rollback: `/opt/osgard-platform/releases/current-before-visual-20260922`.

## Deployment audit - 2026-09-22

- Runtime: `osgard-web.service` and nginx are active; nginx configuration test passes.
- Remote HTTP: `/` and Earth day texture return `200`; no warning-or-higher entries in the last 30 minutes of the web service journal.
- The phrase `sandbox-wrapper` is absent from both the repository and deployed application. The screenshot text is an execution/tool overlay, not site content.
- Release risk: the visual pass was copied directly into `/opt/osgard-platform/current` from a temporary checkout. The five visual source files remain uncommitted locally, and `origin/main` still points to `0376488`; production therefore contains changes that are not represented by a Git commit.
- Local lint still reports six pre-existing errors in `components/JarvisAvatar.tsx` and `components/section-help.tsx`.
- Local build is blocked by Windows `EPERM` opening `.next/trace-build`; the same visual build completed successfully on the production Linux checkout.

## Reproducible release completed

- The visual and lint fixes were committed and pushed to `origin/main`: `b128cfac fix: finalize visual release and lint errors`.
- The VPS fetched that commit, ran `npm ci` and `npm run build`, then deployed the resulting checkout.
- Production now runs `b128cfa`; `osgard-web.service` and nginx are active.
- Remote smoke checks: root, login and public HTTPS return `200`; day/night Earth textures return `200` with 2,566,770 and 794,479 bytes respectively.
- `nginx -t` passes and the web service journal has no warning-or-higher entries for the final release.
- Rollback backup: `/opt/osgard-platform/releases/current-before-commit-b128cfac`.
