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
