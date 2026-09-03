#!/usr/bin/env bash
# Installs MediaMTX as the Pi's camera service. Run ON THE PI, as a user with sudo.
#
# This does NOT stop the old python/legacy agent for you — see the "Cutover" section in
# ../../docs/v2/08-pi-agent.md. Both want the camera at once, so do that step deliberately,
# not as a side effect of running this script.
#
# Re-running is safe: an already-running mediamtx is stopped, upgraded and started again.
set -euo pipefail

# Pinned by version *and* digest. MediaMTX embeds its own libcamera build
# (mtxrpicam_64/), so this binary does not depend on the Pi's system libcamera — which is
# the reason a recent version is safe to pin here.
MEDIAMTX_VERSION="${MEDIAMTX_VERSION:-1.20.1}"
MEDIAMTX_SHA256="${MEDIAMTX_SHA256:-d1689f0bfefb1864e5ed3dcc8495eb2d7ec0a654f90bf3cd48980cb3bd08718a}"

ARCH="$(uname -m)"
if [ "$ARCH" != "aarch64" ]; then
  echo "Unsupported arch: $ARCH — this expects a 64-bit Raspberry Pi OS on a Pi 5." >&2
  echo "The camera source needs MediaMTX's arm64 build (mtxrpicam_64)." >&2
  exit 1
fi
TARBALL="mediamtx_v${MEDIAMTX_VERSION}_linux_arm64.tar.gz"

echo "== Downloading MediaMTX ${MEDIAMTX_VERSION} =="
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$TARBALL" \
  "https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/${TARBALL}"

echo "== Verifying digest =="
echo "${MEDIAMTX_SHA256}  $TMP/$TARBALL" | sha256sum -c -

tar -xzf "$TMP/$TARBALL" -C "$TMP"

# Replacing a running binary fails with ETXTBSY, so stand it down first and note whether
# it was up so it can be put back exactly as found.
WAS_ACTIVE=no
if systemctl is-active --quiet mediamtx; then
  WAS_ACTIVE=yes
  echo "== mediamtx is running — stopping it for the upgrade =="
  sudo systemctl stop mediamtx
fi

echo "== Installing binary and config =="
sudo install -m 0755 "$TMP/mediamtx" /usr/local/bin/mediamtx

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo install -m 0644 "$SCRIPT_DIR/mediamtx.yml" /etc/mediamtx.yml
sudo install -m 0644 "$SCRIPT_DIR/mediamtx.service" /etc/systemd/system/mediamtx.service

sudo systemctl daemon-reload
sudo systemctl enable mediamtx

if [ "$WAS_ACTIVE" = yes ]; then
  echo "== Starting mediamtx again (it was running before this upgrade) =="
  sudo systemctl start mediamtx
  exit 0
fi

echo "== Enabled, not started — see the cutover checklist below =="
cat <<'MSG'

Installed and enabled, not started.

Before starting:
  1. Confirm nothing else has the camera open:
       sudo systemctl status motion-detection 2>/dev/null || true
       pgrep -af 'python.*main.py|rpicam|libcamera'
  2. Start it:
       sudo systemctl start mediamtx
  3. Check it is publishing (loopback API, no video player needed):
       curl -s localhost:9997/v3/paths/get/cam
  4. Verify from another machine on the LAN:
       ffplay -fflags nobuffer -flags low_delay rtsp://<pi-ip>:8554/cam
  5. Watch for thermal throttling over the first day:
       vcgencmd measure_temp
       vcgencmd get_throttled   # must read 0x0

Rollback is one command:
       sudo systemctl stop mediamtx
       (and restart whatever ran the camera before)
MSG
