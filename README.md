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

## Google Cloud에 배포하기 (터미널 없이, 어디서든 웹주소로 접속)

집 컴퓨터가 꺼져 있거나 회사 등 다른 곳에서 대시보드를 쓰고 싶다면, 항상 켜져 있는
작은 VM 한 대에 배포해두면 됩니다. 아래 절차는 **최초 1번만** 진행하면 되고,
그 뒤로는 코드가 바뀔 때마다(제가 GitHub에 새 커밋을 올릴 때마다) VM이 5분 안에
자동으로 최신 버전을 반영합니다(재빌드+재시작까지 자동) — 이후로는 터미널을 켤 일이
없고, 그냥 브라우저로 주소만 열면 됩니다.

**1) Cloud Shell 열기**: https://console.cloud.google.com 접속 → 우측 상단 `>_` 아이콘
(Cloud Shell 활성화) 클릭 → 화면 하단에 터미널이 뜨면 아래 명령어를 순서대로 붙여넣기.

**2) VM 생성 + 방화벽 오픈** (아래 `YOUR_DASHBOARD_TOKEN` 등은 실제 값으로 바꿔서 붙여넣기):
```bash
gcloud compute instances create maim-server \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --tags=maim-dashboard \
  --metadata-from-file=startup-script=deploy/gcp/startup-script.sh \
  --metadata=dashboard-token=YOUR_DASHBOARD_TOKEN,unsplash-access-key=YOUR_UNSPLASH_KEY,pexels-api-key=YOUR_PEXELS_KEY

gcloud compute firewall-rules create maim-dashboard \
  --allow=tcp:4173 --target-tags=maim-dashboard --source-ranges=0.0.0.0/0
```
(`deploy/gcp/startup-script.sh`를 참조하려면 Cloud Shell에서 먼저
`git clone https://github.com/parkchihong7-gif/maim.git && cd maim` 을 한 번 실행해두세요.)

**3) claude 로그인 (VM에서 딱 한 번만)**: VM이 뜨면(1~2분 소요) 콘솔의
Compute Engine → VM 인스턴스 목록에서 `maim-server`의 **SSH** 버튼을 클릭(브라우저 안에서
바로 터미널이 열립니다, 별도 프로그램 설치 필요 없음). 뜬 창에 아래 입력:
```bash
sudo -i
claude login
```
화면에 나오는 링크를 아무 브라우저에서나 열어 본인 Claude 계정으로 로그인하면 끝입니다.

**4) 접속 주소 확인**: Compute Engine → VM 인스턴스 목록에서 `maim-server`의
**외부 IP**를 확인하고, 브라우저에서 `http://외부IP:4173` 으로 접속하세요. 이 주소가
바로 "퍼블리싱된 웹주소"입니다 — 집이든 회사든 인터넷만 되면 어디서나 이 주소로
대시보드에 접속할 수 있습니다. 처음 접속 시 대시보드 토큰을 물어보면 위에서 정한
`YOUR_DASHBOARD_TOKEN` 값을 입력하세요.

이후 제가 기능을 추가하거나 고치면, 여러분은 아무 것도 안 해도 5분 안에 VM에
자동 반영됩니다(`deploy/gcp/maim-autoupdate.timer`). 카테고리/초안/이미지는 `data/`
폴더에 저장되고 이 자동 업데이트가 절대 건드리지 않으니 안심하세요.

**비용 참고**: `e2-small` 인스턴스는 프리티어 대상이 아니라 월 1만원 안팎의 비용이
발생합니다(사용한 만큼만 청구, 리전에 따라 다름). 비용을 더 아끼고 싶다면
`--machine-type=e2-micro`로 바꿔보세요(`us-central1`/`us-west1`/`us-east1` 리전에서
매달 일정량 무료 제공 — 다만 사양이 낮아 속도가 느릴 수 있습니다).

## 주요 개념

- **AI 엔진**: 별도 API 과금 없이 `claude -p`를 서브프로세스로 호출해 기존 Claude 구독
  한도 내에서 동작합니다.
- **이미지**: 무료 스톡 이미지 API(Unsplash/Pexels) 검색 → Claude 비전으로 3장 선택 →
  프로그래밍적 가공(크롭/리사이즈/보정)만 적용, 생성형 AI 이미지 편집은 사용하지 않습니다.
  마음에 안 드는 이미지가 있으면 "이미지 재생성"으로 오른쪽에 새 이미지를 추가해
  여러 장 중 골라 쓸 수 있습니다.
- **발행은 항상 사람이**: 네이버 계정 보호를 위해 브라우저 자동화를 전혀 쓰지 않습니다.
