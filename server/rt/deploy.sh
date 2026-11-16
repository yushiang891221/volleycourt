#!/usr/bin/env bash
# 把台北伺服器（房間＋大廳）更新成目前 repo 裡的版本。
# 用法（在 repo 根目錄，Git Bash）：bash server/rt/deploy.sh
# 需要：~/.ssh/volley_tw 金鑰已經裝在伺服器上（見 docs/開發環境.md）
set -euo pipefail
HOST="${VOLLEY_HOST:-root@130.94.37.34}"
KEY="${VOLLEY_KEY:-$HOME/.ssh/volley_tw}"
SSH="ssh -i $KEY -o BatchMode=yes $HOST"
cd "$(dirname "$0")/../.."
node --check server/rt/server.mjs
# 部署會重新啟動房間伺服器、線上玩家斷線 1～2 秒：有房間在用就先不要部署（FORCE=1 才硬上）
ROOMS=$(curl -s -m 5 https://130-94-37-34.sslip.io/health | awk '$1 == "ok" { print $2 }')
if [ "${ROOMS:-0}" != "0" ] && [ "${FORCE:-0}" != "1" ]; then echo "現在有 $ROOMS 間房在用，先不部署（等沒人時再跑，或 FORCE=1 硬上）"; exit 1; fi
$SSH 'mkdir -p /opt/volleycourt/server/rt /opt/volleycourt/server/shared /opt/volleycourt/server/match /opt/volleycourt/engine /opt/volleycourt/js'
# 比賽引擎（B1～B3）與伺服器版比賽核心（B4）
scp -i "$KEY" -q engine/*.js "$HOST:/opt/volleycourt/engine/"
scp -i "$KEY" -q server/match/game-core.mjs server/match/host.mjs server/match/run-ai-match.mjs server/match/bench.mjs server/match/venue-bs-shenjing.json "$HOST:/opt/volleycourt/server/match/"
scp -i "$KEY" -q server/rt/server.mjs "$HOST:/opt/volleycourt/server/rt/"
scp -i "$KEY" -q server/package.json "$HOST:/opt/volleycourt/package.json"
scp -i "$KEY" -q server/shared/verify-player.mjs "$HOST:/opt/volleycourt/server/shared/"
scp -i "$KEY" -q js/auth-config.js js/match-sync.js js/court-formations.js "$HOST:/opt/volleycourt/js/"
scp -i "$KEY" -q server/rt/volleycourt-rt.service "$HOST:/etc/systemd/system/volleycourt-rt.service"
scp -i "$KEY" -q server/rt/Caddyfile "$HOST:/etc/caddy/Caddyfile"
$SSH 'cd /opt/volleycourt && npm install --omit=dev --no-audit --no-fund -q >/dev/null && rm -rf vps server/verify-player.mjs auth-config.js && chown -R volley:volley /opt/volleycourt && systemctl daemon-reload && systemctl restart volleycourt-rt && systemctl reload caddy && sleep 1 && systemctl is-active volleycourt-rt && curl -s localhost:8787/health'
echo
echo "完成：$(curl -s https://130-94-37-34.sslip.io/health)"
