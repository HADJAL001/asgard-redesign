#!/usr/bin/env bash
set -euo pipefail

# Keep release storage bounded without ever touching the active checkout.
ROOT="${OSGARD_PLATFORM_ROOT:-/opt/osgard-platform}"
RELEASES="$ROOT/releases"
KEEP="${OSGARD_RELEASE_KEEP:-3}"
APPLY=false

if [[ "${1:-}" == "--apply" ]]; then APPLY=true; fi
if [[ "${1:-}" != "" && "${1:-}" != "--apply" ]]; then
  echo "Usage: $0 [--apply]" >&2
  exit 64
fi
if [[ "$ROOT" != "/opt/osgard-platform" || ! -d "$RELEASES" || ! "$KEEP" =~ ^[0-9]+$ ]]; then
  echo "Refusing unsafe release root or retention value." >&2
  exit 64
fi

mapfile -t candidates < <(find "$RELEASES" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +$((KEEP + 1)) | cut -d' ' -f2-)
if (( ${#candidates[@]} == 0 )); then
  echo "Release storage is within retention ($KEEP directories kept)."
  exit 0
fi

printf '%s\n' "Release cleanup candidates (keeping $KEEP newest):"
printf '  %s\n' "${candidates[@]}"
if ! $APPLY; then
  echo "Dry run only. Re-run with --apply after confirming the list."
  exit 0
fi

for candidate in "${candidates[@]}"; do
  [[ "$candidate" == "$RELEASES"/* ]] || { echo "Refusing unsafe path: $candidate" >&2; exit 64; }
  rm -rf -- "$candidate"
done
df -h "$ROOT"
