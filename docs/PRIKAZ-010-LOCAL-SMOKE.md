# Prikaz 010: Local authenticated smoke check

Date: 2026-09-22

The local frontend ran with `BACKEND_URL=http://localhost:3002`; the backend health endpoint returned HTTP 200. Demo account `alex_odin` authenticated successfully after clearing Microsoft Edge autofill.

Verified authenticated pages:

- `/wallet`: wallet heading, balances, transfer and withdrawal controls.
- `/stake`: staking heading, staking plans, amount field and stake action.

Production recheck:

- `https://osgardnewworld.com` returned HTTP 200.
- `/textures/earth/earth-day.jpg` returned HTTP 404.
- `/textures/earth/earth-night.jpg` returned HTTP 404.

Conclusion: local build and authentication flow are working. Live deployment remains blocked by missing server/deploy credentials. See `docs/PRIKAZ-010-HANDOFF.md` for the full handoff.
