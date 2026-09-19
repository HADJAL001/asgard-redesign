#!/usr/bin/env bash
set -euo pipefail

read -r -s -p "Paste the Twitch stream key, then press Enter: " stream_key
printf '\n'

if [[ -z "$stream_key" ]]; then
  echo "No stream key was entered." >&2
  exit 1
fi

install -d -m 0755 /etc/osgard
umask 077
printf 'TWITCH_RTMP_URL=rtmp://ingest.global-contribute.live-video.net/app/%s\n' "$stream_key" > /etc/osgard/live-relay.env
chmod 600 /etc/osgard/live-relay.env
unset stream_key

systemctl restart osgard-live-relay.service
systemctl is-active --quiet osgard-live-relay.service
echo "Relay is configured and running."
