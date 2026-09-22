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
