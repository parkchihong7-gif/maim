# maim — Claude 기반 네이버 블로그 콘텐츠 자동 생성 프로그램

Make.com + Gemini API를 대체해, `claude -p`(Claude Code CLI 헤드리스 모드)로
네이버 블로그에 올릴 글과 이미지를 자동으로 준비하는 개인용 도구입니다.

**중요**: 이 프로그램은 네이버에 자동으로 로그인하거나 글을 대신 올리지 않습니다.
글/이미지 준비까지만 자동화하고, 실제 발행은 사용자가 대시보드에서 내용을
복사해 네이버 블로그 에디터에 직접 붙여넣는 **반자동 방식**입니다.
(브라우저 자동화로 네이버에 직접 글을 올리는 방식은 실제로 시도해본 결과
네이버의 이상거래 탐지에 걸려 계정 보호조치가 발생했기 때문에, 계정을
안전하게 지키기 위해 이 방식으로 설계되었습니다.)

## 빠른 시작

```bash
npm install
cp .env.example .env    # 값 채우기 (UNSPLASH_ACCESS_KEY, PEXELS_API_KEY 등)
npm run dev
```

대시보드: http://127.0.0.1:4173

## 사용 흐름

1. 대시보드에서 카테고리를 추가/편집합니다 (실시간 검색이 필요한 카테고리인지 표시).
2. 카테고리 옆 **"지금 생성"**을 누르면 Claude가 글(제목/본문/태그)과 이미지 3장을
   준비합니다. 매일 06:00에도 자동으로 활성 카테고리 전체의 초안들을 준비해둡니다.
3. "준비된 초안" 목록에서 원하는 글의 **"복사하기"**를 누르면 클립보드에
   제목+본문+해시태그가 복사됩니다.
4. 네이버 블로그 글쓰기 화면에 직접 붙여넣고, 이미지도 다운로드해서 첨부한 뒤
   평소처럼 발행하세요.
5. 발행을 마쳤으면 대시보드에서 **"발행 완료로 표시"**를 눌러 기록해두세요
   (프로그램이 실제 발행 여부를 알 수는 없으므로 스스로 체크하는 용도입니다).

## 검증 스크립트

```bash
npx tsx tests/test-claude-cli.ts        # claude -p 웹서치/비전 동작 확인
npx tsx tests/test-generate-post.ts "카테고리이름"   # 콘텐츠 생성만 테스트
npx tsx tests/test-image-pipeline.ts    # 이미지 검색/선택/가공 테스트
```

## VPS에 배포하기 (PC가 꺼져 있어도 매일 자동으로 초안 준비)

브라우저 자동화가 전혀 없으므로 로컬과 동일한 방식으로 배포하면 됩니다 —
로그인 세션을 옮기는 과정이 필요 없습니다.

```bash
git clone <repo-url> /opt/maim && cd /opt/maim
npm install
npm run build
cp deploy/.env.vps.example .env   # 값 채우기
sudo cp deploy/systemd/maim.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now maim
sudo journalctl -u maim -f   # 로그 확인
```

대시보드는 외부에 직접 노출하지 말고 SSH 터널로 접속하세요:
```bash
ssh -L 4173:127.0.0.1:4173 user@vps-host
# 로컬 브라우저에서 http://127.0.0.1:4173
```

부득이 직접 노출해야 한다면 `.env`의 `DASHBOARD_TOKEN`을 강한 임의 문자열로
설정하세요 — 설정하면 모든 API 요청에 해당 토큰이 필요해집니다.

## Google Cloud(Cloud Run)에 배포하기 — 평소엔 꺼져있다가 접속할 때만 켜짐

VM을 24시간 켜두는 대신 **Cloud Run**을 씁니다. 아무도 접속하지 않으면 서버가
자동으로 완전히 잠들어서 요금이 거의 발생하지 않고(개인 사용량 정도는 매달
무료 제공량 안에 들어올 가능성이 높습니다), 브라우저에서 주소를 열면 몇 초 안에
깨어나 응답합니다. 대신 "항상 켜진 컴퓨터"가 아니라서 아래 두 가지를 다르게
처리합니다:
- 카테고리/초안/이미지(DB)는 컨테이너 자체가 아니라 **Cloud Storage 버킷**에
  저장해서, 서버가 잠들었다 깨어나도 데이터가 남아있게 합니다.
- 매일 06:00 자동 초안 준비는 서버가 잠들어 있으면 내부 타이머가 못 깨우므로,
  **Cloud Scheduler**(구글 클라우드의 무료 알람 서비스)가 매일 정해진 시각에
  대시보드 주소를 대신 "깨워서" 트리거합니다.

아래 절차는 **최초 1번만** 진행하면 됩니다. 이후 제가 GitHub에 새 커밋을 올리면
Cloud Run이 자동으로 새 버전을 다시 배포합니다(3번에서 "저장소에서 계속 배포" 연결
시 자동 설정됨) — 그 뒤로는 터미널을 켤 일이 없습니다.

**1) Cloud Shell 열기**: https://console.cloud.google.com 접속 → 우측 상단 `>_` 아이콘
(Cloud Shell 활성화) 클릭 → 하단 터미널에 아래를 순서대로 붙여넣기.

**2) 데이터 보관용 버킷 만들기** (`YOUR_PROJECT_ID`는 콘솔 상단에 보이는 본인 프로젝트 ID로 교체):
```bash
gcloud storage buckets create gs://maim-data-YOUR_PROJECT_ID --location=us-central1
```

**3) Cloud Run 서비스 배포** (저장소를 먼저 받아온 뒤 그 폴더에서 배포합니다.
`YOUR_DASHBOARD_TOKEN`/`YOUR_UNSPLASH_KEY`/`YOUR_PEXELS_KEY`는 실제 값으로 교체):
```bash
git clone https://github.com/parkchihong7-gif/maim.git && cd maim

gcloud run deploy maim \
  --source . \
  --region=us-central1 \
  --allow-unauthenticated \
  --min-instances=0 --max-instances=1 --concurrency=1 \
  --timeout=1800 \
  --set-env-vars=HOST=0.0.0.0,DATA_DIR=/tmp/maim-state,HOME=/tmp/maim-state/home,GCS_STATE_BUCKET=maim-data-YOUR_PROJECT_ID,TIMEZONE=Asia/Seoul,CLAUDE_BIN=claude,DASHBOARD_TOKEN=YOUR_DASHBOARD_TOKEN,UNSPLASH_ACCESS_KEY=YOUR_UNSPLASH_KEY,PEXELS_API_KEY=YOUR_PEXELS_KEY
```
(`--timeout=1800`: "지금 생성" 한 번이 글쓰기 재시도 + 이미지 검색/선택까지
전부 끝날 때까지 최악의 경우 10분 넘게 걸릴 수 있는데, Cloud Run 기본값(5분)을
넘기면 다 되어가던 요청이 강제로 끊겨 "요청 실패"로 뜬다. 넉넉하게 30분으로
늘려서 이 문제를 막는다.)
(GCS 버킷을 실시간 디스크처럼 마운트하지 않고, 컨테이너가 시작될 때 버킷
내용을 로컬에 내려받아 쓰고 주기적으로/종료 시 다시 올리는 방식입니다 —
SQLite가 일반 로컬 디스크에서만 안전하게 동작하기 때문입니다.)
빌드/배포가 끝나면 터미널에 `Service URL: https://maim-xxxxx-uc.a.run.app` 같은 줄이
뜹니다 — 이게 바로 "퍼블리싱된 웹주소"입니다. 집이든 회사든 이 주소로 접속하면
대시보드가 열립니다(처음 접속 시 대시보드 토큰을 물어보면 위에서 정한
`YOUR_DASHBOARD_TOKEN` 값을 입력).

**4) claude 로그인 (딱 한 번만)**: 위 주소로 접속해서 카테고리 옆 "지금 생성"을
눌러보면, 아직 로그인이 안 되어 있어서 에러가 날 것입니다. Cloud Shell에서 아래로
실행 중인 리비전에 접속해 로그인합니다:
```bash
gcloud run services proxy maim --region=us-central1 --port=4173 &
```
위 명령은 Cloud Run 컨테이너 안으로 직접 들어가는 것은 아니라서 `claude login`을
실행할 수 없습니다 — 대신 아래처럼 **Cloud Shell 안에서 같은 조건으로 한 번
로그인해서 인증 파일을 버킷에 직접 만들어두는 방법**을 씁니다:
```bash
npm install -g @anthropic-ai/claude-code
gcloud storage buckets add-iam-policy-binding gs://maim-data-YOUR_PROJECT_ID \
  --member="user:$(gcloud config get-value account)" --role="roles/storage.objectAdmin"
mkdir -p /tmp/maim-home && export HOME=/tmp/maim-home
claude login   # 뜨는 링크를 열어 본인 Claude 계정으로 로그인
gcloud storage cp -r /tmp/maim-home/.claude gs://maim-data-YOUR_PROJECT_ID/home/.claude
```
그 다음 대시보드에서 다시 "지금 생성"을 눌러 정상 동작하는지 확인하세요.

**5) 매일 자동 초안 준비 예약 (Cloud Scheduler)**:
```bash
gcloud scheduler jobs create http maim-daily \
  --location=us-central1 \
  --schedule="0 6 * * *" \
  --time-zone="Asia/Seoul" \
  --uri="https://맨위에서-확인한-서비스-URL/api/run/daily" \
  --http-method=POST \
  --headers="x-dashboard-token=YOUR_DASHBOARD_TOKEN"
```

### 접속키 — 통합 관리자 대시보드 장부를 씁니다

이 프로그램은 **자기 접속 코드를 만들지 않습니다.** 예전에는 만들었는데,
모양은 같아도(1차 초대 → 2차 기기별 3개) 장부가 달라서 통합 관리자 대시보드
에서 판 키가 여기서는 안 통했습니다. 파는 곳과 여는 곳이 갈라져 있으면 누구
에게 무엇을 팔았는지 한 군데서 볼 수가 없습니다.

이제 키는 대시보드에서 발급하고, 이 프로그램은 그 장부(앱스 스크립트 + 구글
시트)에 물어봅니다. 그래서 환경변수 둘이 필요합니다.

| 이름 | 값 |
|---|---|
| `KEYSERVER_URL` | 앱스 스크립트 웹 앱 주소 (`https://script.google.com/macros/s/…/exec`) |
| `KEYSERVER_PROGRAM` | `naver-blog` (기본값이라 안 넣어도 됩니다) |

`KEYSERVER_PROGRAM` 이 중요합니다. 키는 **프로그램마다 따로**입니다 — 안 맞으면
1번 프로그램 키로 여기가 열리거나, 여기 키가 안 먹습니다.

```bash
gcloud run services update maim --region us-central1 \
  --update-env-vars KEYSERVER_URL=https://script.google.com/macros/s/…/exec
```

`KEYSERVER_URL` 을 안 넣으면 **마스터 토큰(`DASHBOARD_TOKEN`)으로만** 들어올
수 있습니다. 주인은 쓸 수 있고 고객은 못 들어옵니다.

들어오는 길은 두 가지뿐입니다.

* **마스터 토큰** — 주인용. 1차 인증키 칸에 넣으면 됩니다
* **1차 + 2차 인증키** — 대시보드가 발급해 메일로 보낸 것

2차 인증키는 **기기마다 다릅니다.** 같은 2차키로 다른 기기에서 들어오면 먼저
쓰던 기기가 잠깁니다. 화면이 1분마다 확인해서 그 자리에서 내보냅니다.

---

### 코드만 고쳐서 다시 올릴 때 — 처음 설치와 다릅니다

**위 3) 의 긴 명령을 다시 쓰지 마세요.** `--set-env-vars` 는 적어 준 값으로
환경변수를 **통째로 갈아엎습니다.** `YOUR_UNSPLASH_KEY` 같은 자리표시가 섞인
채로 도시면, 지금 넣어 두신 진짜 키가 그 글자로 덮여서 이미지 검색이 멈춥니다.

다시 올릴 때는 이 한 줄이면 됩니다.

```bash
git pull
gcloud run deploy maim --source . --region us-central1
```

환경변수는 **건드리지 않으면 그대로 남습니다.** 다시 적을 필요가 없습니다.

설정값 하나만 바꾸고 싶으실 때는 `update` 를 쓰십시오. 적어 준 것만 바뀌고
나머지는 남습니다.

```bash
gcloud run services update maim --region us-central1 \
  --update-env-vars UNSPLASH_ACCESS_KEY=진짜키
```

| 무엇을 하려는가 | 무슨 명령 |
|---|---|
| 처음 설치 | 위 3) 의 긴 명령 (`--set-env-vars`) |
| 코드 고친 것 올리기 | `gcloud run deploy maim --source . --region us-central1` |
| 설정값 하나 바꾸기 | `gcloud run services update … --update-env-vars …` |

---

**6) 코드가 바뀔 때마다 자동 재배포되게 하기**: Google Cloud 콘솔(브라우저)에서
Cloud Run → `maim` 서비스 → **"저장소에서 계속 배포"(Continuously deploy from a
repository)** 설정을 켜고 이 GitHub 저장소(`parkchihong7-gif/maim`)와
`claude/great-brown-j376u0` 브랜치를 연결하세요(GitHub 로그인해서 권한 승인하는
클릭 몇 번이면 끝). 이후로는 제가 새 커밋을 올릴 때마다 자동으로 새 버전이
배포됩니다 — 터미널을 켤 일이 없습니다.

**비용 참고**: Cloud Run은 실제 요청을 처리한 시간만큼만 과금되고, 개인이 하루
몇 번 클릭하는 정도의 사용량은 매달 제공되는 무료 사용량 안에 들어올 가능성이
높습니다(정확한 금액은 Google Cloud 결제 페이지에서 확인하세요). Cloud Storage
버킷도 데이터 용량이 작아 비용이 거의 들지 않습니다. Cloud Scheduler도 계정당
일정 개수까지 무료입니다.

## 주요 개념

- **AI 엔진**: 별도 API 과금 없이 `claude -p`를 서브프로세스로 호출해 기존 Claude 구독
  한도 내에서 동작합니다.
- **이미지**: 무료 스톡 이미지 API(Unsplash/Pexels) 검색 → Claude 비전으로 3장 선택 →
  프로그래밍적 가공(크롭/리사이즈/보정)만 적용, 생성형 AI 이미지 편집은 사용하지 않습니다.
  마음에 안 드는 이미지가 있으면 "이미지 재생성"으로 오른쪽에 새 이미지를 추가해
  여러 장 중 골라 쓸 수 있습니다.
- **발행은 항상 사람이**: 네이버 계정 보호를 위해 브라우저 자동화를 전혀 쓰지 않습니다.
