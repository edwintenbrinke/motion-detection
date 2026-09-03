#!/usr/bin/env bash
# Installs the Phase 1 soak logger. Run ON THE PI.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo install -m 0755 "$SCRIPT_DIR/mediamtx-soak" /usr/local/bin/mediamtx-soak
sudo install -m 0644 "$SCRIPT_DIR/mediamtx-soak.service" /etc/systemd/system/mediamtx-soak.service
sudo install -m 0644 "$SCRIPT_DIR/mediamtx-soak.timer" /etc/systemd/system/mediamtx-soak.timer
sudo systemctl daemon-reload
sudo systemctl enable --now mediamtx-soak.timer
sudo systemctl start mediamtx-soak.service
echo "Installed. Watch it with:  tail -f /var/log/mediamtx-soak.log"
