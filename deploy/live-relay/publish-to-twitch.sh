#!/usr/bin/env bash
set -euo pipefail

# Keep the Twitch URL (including its stream key) in /etc/osgard/live-relay.env.
# It is intentionally absent from the repository and browser bundle.
if [[ -z "${TWITCH_RTMP_URL:-}" ]]; then
  echo "TWITCH_RTMP_URL is not configured; refusing to relay" >&2
  exit 1
fi

exec /usr/bin/ffmpeg \
  -hide_banner \
  -loglevel warning \
  -i "rtsp://127.0.0.1:8554/${MTX_PATH}" \
  -c:v libx264 \
  -preset veryfast \
  -tune zerolatency \
  -pix_fmt yuv420p \
  -g 60 \
  -c:a aac \
  -b:a 128k \
  -f flv \
  "${TWITCH_RTMP_URL}"
