#!/usr/bin/env bash
# Deploy one reviewed origin/main commit to osgardnewworld.com. Run only on the
# production host. A failed build or health check restores the prior revision.
set -euo pipefail

ROOT="${OSGARD_RELEASE_ROOT:-/opt/osgard-platform/current}"
SERVICE="${OSGARD_WEB_SERVICE:-osgard-web.service}"
HEALTH_URL="${OSGARD_HEALTH_URL:-http://127.0.0.1:3000/api/health}"
CANARY_ATTEMPTS="${OSGARD_CANARY_ATTEMPTS:-3}"
CANARY_INTERVAL_SECONDS="${OSGARD_CANARY_INTERVAL_SECONDS:-5}"
READINESS_TIMEOUT_SECONDS="${OSGARD_READINESS_TIMEOUT_SECONDS:-30}"
ENV_FILE="${OSGARD_ENV_FILE:-/etc/osgard-platform/web.env}"
TARGET="${1:-origin/main}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root so the service can be restarted." >&2
  exit 1
fi
if [[ ! -d "$ROOT/.git" ]]; then
  echo "Refusing release: invalid checkout root." >&2
  exit 1
fi
if ! [[ "$CANARY_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || ! [[ "$CANARY_INTERVAL_SECONDS" =~ ^[0-9]+$ ]] || ! [[ "$READINESS_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "Refusing release: invalid canary settings." >&2
  exit 1
fi
if [[ ! -f "$ENV_FILE" ]] || ! grep -qE '^ARTIFACT_SIGNING_KEY=.{32,}$' "$ENV_FILE"; then
  echo "Refusing release: ARTIFACT_SIGNING_KEY is missing or too short." >&2
  exit 1
fi
env_mode="$(stat -c '%a' "$ENV_FILE")"
if (( 8#$env_mode & 007 )); then
  echo "Refusing release: environment file must not be readable by group or others." >&2
  exit 1
fi

cd "$ROOT"
previous="$(git rev-parse HEAD)"
git fetch origin main
target_sha="$(git rev-parse "$TARGET^{commit}")"
if ! git merge-base --is-ancestor "$target_sha" origin/main; then
  echo "Refusing release: target is not reachable from origin/main." >&2
  exit 1
fi

rollback() {
  echo "Release failed; restoring ${previous}." >&2
  git checkout --detach "$previous"
  npm ci
  npm run build
  systemctl restart "$SERVICE"
}
trap rollback ERR

git checkout --detach "$target_sha"
npm ci
npm run build
systemctl restart "$SERVICE"
systemctl is-active --quiet "$SERVICE"
deadline=$((SECONDS + READINESS_TIMEOUT_SECONDS))
until curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" >/dev/null; do
  if (( SECONDS >= deadline )); then
    echo "Release failed: health endpoint did not become ready within ${READINESS_TIMEOUT_SECONDS}s." >&2
    exit 1
  fi
  sleep 1
done
for ((attempt = 1; attempt <= CANARY_ATTEMPTS; attempt++)); do
  curl --fail --silent --show-error --max-time 15 "$HEALTH_URL" >/dev/null
  if (( attempt < CANARY_ATTEMPTS )); then sleep "$CANARY_INTERVAL_SECONDS"; fi
done

mkdir -p /opt/osgard-platform/releases
printf '%s %s %s\n' "$(date -u +%FT%TZ)" "$previous" "$target_sha" >> /opt/osgard-platform/releases/verified-release.log
trap - ERR
echo "Released ${target_sha}; ${CANARY_ATTEMPTS} post-restart health checks passed."
