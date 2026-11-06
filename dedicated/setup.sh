#!/usr/bin/env bash
# Installs (or updates) the Sixth Front dedicated servers on an Ubuntu machine and (re)starts them.
# The deploy workflow (.github/workflows/dedicated.yml) copies dedicated/ (with the game built into www/) to
# ~/sixthfront/dedicated and runs this. Safe to run again.
set -euo pipefail
APP="$HOME/sixthfront"
SERVERS="${SERVERS:-inf-1,tank-1,air-1,sea-1,aio-1,aio-2}"
cd "$APP"

# Node.js 20 or newer
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Playwright and its headless Chromium (and the libraries Chromium needs)
[ -f package.json ] || echo '{ "private": true }' > package.json
npm install --no-audit --no-fund --loglevel=error playwright@1.48.2
sudo npx --yes playwright install-deps chromium >/dev/null
npx --yes playwright install chromium

# Let direct (UDP) connections from players in; Oracle's Ubuntu images block everything but SSH by default.
# (Without it the game still works, through the relay, just with a little more delay.)
if sudo iptables -L INPUT -n >/dev/null 2>&1; then
  sudo iptables -C INPUT -p udp --dport 1024:65535 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 -p udp --dport 1024:65535 -j ACCEPT
  if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save >/dev/null 2>&1 || true; fi
fi

# a service that starts with the machine and comes back if it stops
sudo tee /etc/systemd/system/sixthfront.service >/dev/null <<UNIT
[Unit]
Description=Sixth Front dedicated servers
After=network-online.target
Wants=network-online.target

[Service]
User=$(id -un)
WorkingDirectory=$APP
Environment=SERVERS=$SERVERS
ExecStart=$(command -v node) $APP/dedicated/server.mjs
Restart=always
RestartSec=5
Nice=-2

[Install]
WantedBy=multi-user.target
UNIT
sudo systemctl daemon-reload
sudo systemctl enable sixthfront >/dev/null 2>&1
sudo systemctl restart sixthfront
sleep 20
sudo systemctl --no-pager --lines=15 status sixthfront || true
