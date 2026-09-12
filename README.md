# maim — Claude 기반 네이버 블로그 자동 발행 프로그램

Make.com + Gemini API를 대체해, `claude -p`(Claude Code CLI 헤드리스 모드) + Playwright로
네이버 블로그 포스팅을 생성부터 예약 발행까지 자동화하는 개인용 도구입니다.

## 1. 로컬 PC에서 처음 설정하기

```bash
npm install
cp .env.example .env    # 값 채우기 (UNSPLASH_ACCESS_KEY, PEXELS_API_KEY, SESSION_EXPORT_PASSPHRASE 등)
npm run setup            # playwright chromium 설치 확인/설치
npm run login             # 브라우저 창이 뜨면 네이버에 직접 로그인 (2FA/캡차는 사람만 가능)
npm run dev
```

대시보드: http://127.0.0.1:4173

카테고리를 대시보드에서 추가/편집하고, "지금 생성" → "지금 발행"으로 먼저 수동 테스트를
해본 뒤, 문제가 없으면 그대로 켜두면 매일 자동으로 (기본 06:00) 그날의 포스팅을 생성해
큐에 넣고, 예약된 랜덤 시각에 하나씩 발행합니다.

### 검증 스크립트

각 구성요소를 개별적으로 점검할 수 있습니다.

```bash
npx tsx tests/test-generate-post.ts "카테고리이름"   # 콘텐츠 생성만 테스트
npx tsx tests/test-image-pipeline.ts                  # 이미지 검색/선택/가공 테스트
npx tsx tests/test-playwright-login.ts                # 세션 저장/재사용 메커니즘 테스트
PLAYWRIGHT_HEADLESS=false npx tsx tests/test-single-publish.ts   # 실제 예약 발행 1건 (로그인 필요)
npx tsx tests/test-scheduler.ts                        # 스케줄러 전체 흐름 테스트
```

`test-single-publish.ts`가 실패하면 `data/generated/<postId>/error.png` 스크린샷과
에러 메시지를 보고 `src/naver/selectors.ts`를 실제 DOM에 맞게 갱신하세요. 네이버
스마트에디터 구조는 예고 없이 바뀔 수 있어 셀렉터를 한 곳에 모아뒀습니다.

## 2. VPS에 배포하기 (PC가 꺼져 있어도 매일 자동 실행)

로그인은 항상 로컬 PC에서 헤드풀로 해야 하므로, 순서가 중요합니다.

1. 로컬에서 `npm run login`으로 로그인 완료 (이미 했다면 생략)
2. 로컬에서 세션 내보내기:
   ```bash
   npm run export-session -- <암호>
   # data/naver-session.enc 생성됨
   ```
3. 이 파일을 VPS로 복사 (scp 등)
4. VPS에 저장소를 클론하고 의존성 설치:
   ```bash
   git clone <repo-url> /opt/maim && cd /opt/maim
   npm install
   npm run build
   cp deploy/.env.vps.example .env   # 값 채우기 (SESSION_EXPORT_PASSPHRASE는 2번과 동일하게)
   npx playwright install --with-deps chromium
   ```
5. 옮겨온 암호화 세션 파일을 복원:
   ```bash
   npm run import-session -- <가져온 파일 경로> <암호>
   ```
6. systemd 서비스 등록:
   ```bash
   sudo cp deploy/systemd/maim.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now maim
   sudo journalctl -u maim -f   # 로그 확인
   ```
7. 대시보드는 외부에 직접 노출하지 말고 SSH 터널로 접속:
   ```bash
   ssh -L 4173:127.0.0.1:4173 user@vps-host
   # 로컬 브라우저에서 http://127.0.0.1:4173
   ```

세션이 만료되면(네이버 로그인 페이지로 리다이렉트 감지) 대시보드에 "세션 만료" 상태가
표시됩니다. 이 경우 1~5번을 다시 수행해 세션을 갱신하세요.

## 주요 개념

- **로컬 vs VPS**: 네이버 로그인은 항상 사람이 직접 보이는 브라우저로 로컬에서 수행합니다.
  세션은 `scripts/export-session.ts` / `scripts/import-session.ts`로 암호화 이전합니다.
- **AI 엔진**: 별도 API 과금 없이 `claude -p`를 서브프로세스로 호출해 기존 Claude 구독
  한도 내에서 동작합니다.
- **발행 안전장치**: 예약 발행 + 랜덤 발행 시각 + 하루 최대 5개 하드 캡. 네이버 이용약관상
  자동화는 그레이존이며 계정 제재 가능성이 있음을 인지하고 사용하세요.
- **이미지**: 무료 스톡 이미지 API(Unsplash/Pexels) 검색 → Claude 비전으로 선택 →
  프로그래밍적 가공(크롭/리사이즈/보정)만 적용, 생성형 AI 이미지 편집은 사용하지 않습니다.
