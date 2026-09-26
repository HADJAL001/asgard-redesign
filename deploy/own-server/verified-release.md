# Verified production release

`verified-release.sh` is the only release helper for `osgardnewworld.com`.
It runs on `84.46.244.117` from `/opt/osgard-platform/current` and only touches
`osgard-web.service`.

```bash
sudo /opt/osgard-platform/current/deploy/own-server/verified-release.sh origin/main
```

The script accepts only a commit reachable from `origin/main`, rebuilds before
restart, verifies the local health endpoint three times across a post-restart
canary window, and restores the previous commit when any guarded step fails.
It writes commit transition metadata to
`/opt/osgard-platform/releases/verified-release.log`; secrets are never logged.

This is a post-restart canary, not blue/green traffic splitting. Use
`OSGARD_CANARY_ATTEMPTS` and `OSGARD_CANARY_INTERVAL_SECONDS` to tune the
window; a real traffic canary requires separate upstream instances.
The first probe waits up to 30 seconds for Next.js readiness; configure this
with `OSGARD_READINESS_TIMEOUT_SECONDS` when the host needs a different bound.

Before touching the checkout, the script validates `ARTIFACT_SIGNING_KEY` in
`/etc/osgard-platform/web.env`: the key must be at least 32 bytes and the file
must not grant group or world read access. Override the path only with
`OSGARD_ENV_FILE` on the production host.
