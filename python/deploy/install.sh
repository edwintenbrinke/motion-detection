#!/usr/bin/env bash
# Installs MediaMTX as the Pi's camera service. Run ON THE PI, as a user with sudo.
#
# This does NOT stop the old python/legacy agent for you — see the "Cutover" section in
# ../../docs/v2/08-pi-agent.md. Both want the camera at once, so do that step deliberately,
# not as a side effect of running this script.
set -euo pipefail

MEDIAMTX_VERSION="${MEDIAMTX_VERSION:-1.9.3}"
ARCH="$(uname -m)"
case "$ARCH" in
  aarch64) MTX_ARCH="arm64v8" ;;
  armv7l)  MTX_ARCH="armv7" ;;
  *) echo "Unsupported arch: $ARCH (expected aarch64 on a Pi 5)" >&2; exit 1 ;;
esac

echo "== Installing MediaMTX ${MEDIAMTX_VERSION} (${MTX_ARCH}) =="
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/mediamtx.tar.gz" \
  "https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_${MTX_ARCH}.tar.gz"
tar -xzf "$TMP/mediamtx.tar.gz" -C "$TMP"
sudo install -m 0755 "$TMP/mediamtx" /usr/local/bin/mediamtx

echo "== Installing config =="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo install -m 0644 "$SCRIPT_DIR/mediamtx.yml" /etc/mediamtx.yml
sudo install -m 0644 "$SCRIPT_DIR/mediamtx.service" /etc/systemd/system/mediamtx.service

echo "== Enabling service (not starting yet — see cutover notes above) =="
sudo systemctl daemon-reload
sudo systemctl enable mediamtx

cat <<'MSG'

Installed and enabled, not started.

Before starting:
  1. Confirm nothing else has the camera open:
       sudo systemctl status motion-detection 2>/dev/null || true
  2. Start it:
       sudo systemctl start mediamtx
  3. Verify from another machine on the LAN:
       ffplay -fflags nobuffer -flags low_delay rtsp://<pi-ip>:8554/cam
  4. Watch for thermal throttling over the first day:
       vcgencmd measure_temp
       vcgencmd get_throttled   # must read 0x0

Rollback is one command:
       sudo systemctl stop mediamtx
       (and restart whatever ran the camera before)
MSG
