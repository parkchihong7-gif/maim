#!/bin/bash
# 5분마다 GitHub의 최신 코드를 자동으로 받아 반영한다(maim-autoupdate.timer가 호출).
# 새 커밋이 없으면 아무 것도 하지 않고 조용히 끝난다. data/ 디렉터리는 git이 관리하지
# 않으므로(.gitignore) 초안/카테고리/DB는 이 과정에서 절대 지워지지 않는다.
set -euo pipefail

REPO_DIR="/opt/maim"
cd "$REPO_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git fetch origin "$BRANCH"

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0
fi

echo "[maim-autoupdate] 새 커밋 발견, 반영 중... ($LOCAL -> $REMOTE)"
git reset --hard "origin/$BRANCH"
npm ci
npm run build
systemctl restart maim.service
echo "[maim-autoupdate] 반영 완료."
