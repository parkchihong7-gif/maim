# maim — Claude 기반 네이버 블로그 자동 발행 프로그램

Make.com + Gemini API를 대체해, `claude -p`(Claude Code CLI 헤드리스 모드) + Playwright로
네이버 블로그 포스팅을 생성부터 예약 발행까지 자동화하는 개인용 도구입니다.

## 빠른 시작

```bash
npm install
cp .env.example .env   # 값 채우기
npm run setup           # playwright chromium 설치 확인/설치
npm run dev
```

대시보드: http://127.0.0.1:4173

## 주요 개념

- **로컬 vs VPS**: 네이버 로그인은 항상 사람이 직접 보이는 브라우저로 로컬에서 수행합니다.
  세션은 `scripts/export-session.ts` / `scripts/import-session.ts`로 암호화 이전합니다.
- **AI 엔진**: 별도 API 과금 없이 `claude -p`를 서브프로세스로 호출해 기존 Claude 구독
  한도 내에서 동작합니다.
- **발행 안전장치**: 예약 발행 + 랜덤 발행 시각 + 하루 최대 5개 하드 캡.

세부 설계는 프로젝트 루트 밖의 계획 문서(`deep-knitting-moon.md`)를 참고하세요.
