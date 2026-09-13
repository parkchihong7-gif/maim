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
2. 카테고리 옆 **"지금 생성"**을 누르면 Claude가 글(제목/본문/태그)과 대표 이미지를
   준비합니다. 매일 06:00에도 자동으로 그날의 초안들을 준비해둡니다(하루 최대 5개).
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
npx tsx tests/test-scheduler.ts         # 매일 초안 준비 로직 테스트
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

## 주요 개념

- **AI 엔진**: 별도 API 과금 없이 `claude -p`를 서브프로세스로 호출해 기존 Claude 구독
  한도 내에서 동작합니다.
- **콘텐츠 생성 한도**: 하루 최대 5개 하드 캡(Claude 사용량 및 검수 부담 관리 목적).
- **이미지**: 무료 스톡 이미지 API(Unsplash/Pexels) 검색 → Claude 비전으로 선택 →
  프로그래밍적 가공(크롭/리사이즈/보정)만 적용, 생성형 AI 이미지 편집은 사용하지 않습니다.
- **발행은 항상 사람이**: 네이버 계정 보호를 위해 브라우저 자동화를 전혀 쓰지 않습니다.
