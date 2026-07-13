#!/usr/bin/env bash
# Run on purr001 as root (or sudo).
# Usage: ./deploy.sh [user@purr001]
set -euo pipefail

REMOTE=${1:-purr001}
APP_DIR=/opt/purr-you
DEPLOY_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "==> building locally"
cd "$DEPLOY_DIR"
bun run build

echo "==> syncing build to $REMOTE:$APP_DIR"
ssh "$REMOTE" "mkdir -p $APP_DIR"
rsync -az --delete \
  --exclude '.env' \
  "$DEPLOY_DIR/build/" "$REMOTE:$APP_DIR/build/"
rsync -az "$DEPLOY_DIR/package.json" "$REMOTE:$APP_DIR/"

echo "==> verifying node on remote"
ssh "$REMOTE" "which node || (echo 'node not found — install it first' && exit 1)"

echo "==> installing service + nginx config"
scp "$DEPLOY_DIR/deploy/purr-you.service" "$REMOTE:/etc/systemd/system/purr-you.service"
scp "$DEPLOY_DIR/deploy/purr.you.nginx"   "$REMOTE:/etc/nginx/sites-available/purr.you"
ssh "$REMOTE" "ln -sf /etc/nginx/sites-available/purr.you /etc/nginx/sites-enabled/purr.you"

echo "==> reloading services"
ssh "$REMOTE" "set -e
  sudo systemctl daemon-reload
  sudo systemctl enable --now purr-you
  sudo systemctl restart purr-you
  sudo nginx -t && sudo systemctl reload nginx
"

echo "==> done. check: systemctl status purr-you"
