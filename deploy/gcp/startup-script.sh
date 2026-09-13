#!/bin/bash
# Google Compute Engine VM 부팅 시 자동 실행되는 초기 설정 스크립트.
# gcloud compute instances create ... --metadata-from-file startup-script=이 파일 로
# 등록해두면, VM이 켜질 때마다(최초 생성 + 재시작 시) 이 스크립트가 root 권한으로 실행된다.
#
# 하는 일: Node.js/git 설치 -> 저장소 clone -> 빌드 -> claude CLI 설치 ->
# .env 생성(메타데이터에서 API 키 읽어옴) -> systemd 서비스 등록/기동 ->
# 5분마다 git 최신 커밋을 자동 반영하는 타이머 등록.
#
# 이미 설정이 끝난 뒤 VM을 재부팅해도 안전하게 다시 실행 가능(멱등).
set -euo pipefail

REPO_URL="https://github.com/parkchihong7-gif/maim.git"
REPO_DIR="/opt/maim"

meta() {
  curl -sf -H "Metadata-Flavor: Google" \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" 2>/dev/null || true
}

BRANCH="$(meta repo-branch)"
BRANCH="${BRANCH:-claude/great-brown-j376u0}"

echo "[maim-setup] Node.js 설치..."
if ! command -v node >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y curl git build-essential python3 ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "[maim-setup] claude(Claude Code CLI) 설치..."
npm install -g @anthropic-ai/claude-code

echo "[maim-setup] 저장소 준비..."
if [ ! -d "$REPO_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
else
  git -C "$REPO_DIR" fetch origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
fi

echo "[maim-setup] 의존성 설치 및 빌드..."
cd "$REPO_DIR"
npm ci
npm run build

echo "[maim-setup] .env 생성..."
DASHBOARD_TOKEN="$(meta dashboard-token)"
UNSPLASH_ACCESS_KEY="$(meta unsplash-access-key)"
PEXELS_API_KEY="$(meta pexels-api-key)"

cat > "$REPO_DIR/.env" <<EOF
HOST=0.0.0.0
PORT=4173
TIMEZONE=Asia/Seoul
UNSPLASH_ACCESS_KEY=${UNSPLASH_ACCESS_KEY}
PEXELS_API_KEY=${PEXELS_API_KEY}
CLAUDE_BIN=claude
DASHBOARD_TOKEN=${DASHBOARD_TOKEN}
EOF
chmod 600 "$REPO_DIR/.env"

echo "[maim-setup] systemd 서비스 등록..."
# VM 위에서는 별도 시스템 계정을 만들지 않고 root로 실행한다(1인용 개인 VM이라
# 권한 분리 실익이 적고, claude 로그인 계정과 서비스 실행 계정을 일치시켜
# "로그인은 했는데 서비스는 다른 계정이라 못 찾는" 문제를 피하기 위함).
sed 's/^User=maim$//' "$REPO_DIR/deploy/systemd/maim.service" > /etc/systemd/system/maim.service
cp "$REPO_DIR/deploy/gcp/maim-autoupdate.service" /etc/systemd/system/maim-autoupdate.service
cp "$REPO_DIR/deploy/gcp/maim-autoupdate.timer" /etc/systemd/system/maim-autoupdate.timer
chmod +x "$REPO_DIR/deploy/gcp/auto-update.sh"

systemctl daemon-reload
systemctl enable --now maim.service
systemctl enable --now maim-autoupdate.timer

echo "[maim-setup] 완료. 'claude login'이 아직이면 SSH로 접속해 로그인하세요."
