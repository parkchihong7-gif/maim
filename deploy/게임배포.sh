#!/usr/bin/env bash
# 🕹️ 게임 플레이 기능을 운영 서버(Cloud Run «maim»)에 올린다 — Cloud Shell 에서 사장님이 실행.
#
#   bash ~/maim/deploy/게임배포.sh
#
# 하는 일 (몇 번을 돌려도 같다):
#   1) 저장소를 게임 플레이 브랜치로 맞춘다
#   2) 게임 사진 전용 저장통이 없으면 만든다 (이름: <프로젝트>-game-shots, 공개 안 함)
#   3) Cloud Run 서비스 계정에 그 저장통 쓰기 권한 + 서명 주소 권한
#   4) 집 PC 연결 토큰(GAME_AGENT_TOKEN)이 서버에 없으면 새로 만든다 — 값은 ~/maim-game-agent-token.txt 에만 남긴다
#   5) 다른 설정은 그대로 두고(--update-env-vars) 배포
# 비밀값은 화면·저장소에 찍지 않는다.
set -euo pipefail

BRANCH="claude/game-play-ontn8y"
REGION="us-central1"
SERVICE="maim"
PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] || { echo "프로젝트가 정해져 있지 않습니다: gcloud config set project <프로젝트 ID>"; exit 1; }
BUCKET="${GAME_SHOT_BUCKET_NAME:-${PROJECT}-game-shots}"
if ! gcloud run services describe "$SERVICE" --region="$REGION" >/dev/null 2>&1; then
  echo "이 프로젝트($PROJECT)에 Cloud Run 서비스 «$SERVICE»($REGION)가 없습니다."
  echo "운영 서버가 있는 프로젝트로 바꾼 뒤 다시: gcloud config set project <프로젝트 ID>"
  exit 1
fi
echo "프로젝트 $PROJECT · 서비스 $SERVICE ($REGION)"

echo "▶ 1/5 코드 맞추기 ($BRANCH)"
cd ~/maim
git fetch origin "$BRANCH"
git switch "$BRANCH" 2>/dev/null || git switch -c "$BRANCH" --track "origin/$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "▶ 2/5 게임 사진 저장통: gs://$BUCKET"
if ! gcloud storage buckets describe "gs://$BUCKET" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access --public-access-prevention
fi

echo "▶ 3/5 서비스 계정 권한"
SA="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(spec.template.spec.serviceAccountName)')"
if [ -z "$SA" ]; then
  PNUM="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
  SA="${PNUM}-compute@developer.gserviceaccount.com"
fi
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
# 화면에 15분짜리 서명 주소를 주려면 필요하다. 안 되면 서버가 사진을 직접 보내므로 실패해도 계속한다.
gcloud iam service-accounts add-iam-policy-binding "$SA" \
  --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator >/dev/null 2>&1 \
  || echo "  (서명 주소 권한은 못 넣었습니다 — 사진은 서버가 직접 보냅니다. 괜찮습니다)"

echo "▶ 4/5 집 PC 연결 토큰"
TOKEN_FILE=~/maim-game-agent-token.txt
CUR_TOKEN="$(gcloud run services describe "$SERVICE" --region="$REGION" --format=json \
  | python3 -c "import json,sys; e=json.load(sys.stdin)['spec']['template']['spec']['containers'][0].get('env',[]); print(next((x.get('value','') for x in e if x['name']=='GAME_AGENT_TOKEN'),''))")"
if [ -n "$CUR_TOKEN" ]; then
  TOKEN="$CUR_TOKEN"; echo "  서버에 이미 있습니다 — 그대로 씁니다."
else
  TOKEN="$(openssl rand -hex 24)"; echo "  새로 만들었습니다."
fi
(umask 077; printf '%s\n' "$TOKEN" > "$TOKEN_FILE")
echo "  값은 $TOKEN_FILE 에만 있습니다(집 PC 의 MAIM_GAME_AGENT_TOKEN 에 넣을 값). 채팅에 붙이지 마세요."

echo "▶ 5/5 배포 (3~6분)"
gcloud run deploy "$SERVICE" --source . --region="$REGION" --allow-unauthenticated --concurrency=80 \
  --update-env-vars="GAME_SHOT_BUCKET=$BUCKET,GAME_AGENT_TOKEN=$TOKEN"

URL="$(gcloud run services describe "$SERVICE" --region="$REGION" --format='value(status.url)')"
echo
echo "✅ 끝 — $URL"
echo "   빌드 시각 확인: curl -s $URL/api/health | head -c 200"
echo "   대시보드 새로고침(Ctrl+F5) → 왼쪽 메뉴 🕹️ 게임 플레이"
