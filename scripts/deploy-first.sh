set -eu
test -d /opt
test -d /etc/caddy
test -z "$(ss -lnt | grep ':8473 ' || true)"
mkdir -p /opt/kreatix-ui
cd /opt/kreatix-ui
npm ci --omit=dev --no-audit --no-fund
cat > /etc/systemd/system/kreatix-ui.service <<'UNIT'
[Unit]
Description=Kreatix UI community
After=network.target

[Service]
Type=simple
DynamicUser=yes
StateDirectory=kreatix-ui
WorkingDirectory=/opt/kreatix-ui
ExecStart=/usr/bin/node /opt/kreatix-ui/build/index.js
Environment=NODE_ENV=production
Environment=APP_ORIGIN=https://ui.kreatix.dev
Environment=HOST=127.0.0.1
Environment=PORT=8473
Environment=DATA_DIR=/var/lib/kreatix-ui
Environment=TRUST_PROXY=1
Restart=on-failure
RestartSec=3
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
MemoryMax=512M
CPUQuota=75%

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now kreatix-ui
cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.pre-ui-$(date +%s)"
if ! grep -q '^ui.kreatix.dev {' /etc/caddy/Caddyfile; then
cat >> /etc/caddy/Caddyfile <<'CADDY'

ui.kreatix.dev {
  reverse_proxy 127.0.0.1:8473 {
    header_up X-Real-IP {http.request.header.CF-Connecting-IP}
  }
}
CADDY
fi
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl is-active kreatix-ui
