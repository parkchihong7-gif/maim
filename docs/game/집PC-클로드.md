# 🏠 집 PC — 게임 스샷 프로그램 준비 순서 (2026-10-21 개편)

> 설계는 `docs/game/게임스샷.md`. 이 집 PC(G:\CLAUDE\blog\maim)는 2026-10-21 에 한 번 준비를 마쳤다
> (환경변수 `MAIM_SERVER_URL`·`MAIM_GAME_AGENT_TOKEN`·`MAIM_GAME_ROOT=G:\maim-game`, 바탕화면 «maim 게임 켜기» 관리자 권한 바로가기).
> 다시 할 때만 아래를 따른다. 설명은 한국어로 짧게.

## A. 사장님이 하실 것
1. (새 코드일 때만) Cloud Shell 배포
   ```
   cd ~/maim && git fetch origin claude/game-play-ontn8y && git switch claude/game-play-ontn8y && git pull
   bash deploy/게임배포.sh
   ```
2. 집 PC: 바탕화면 **«maim 게임 켜기»** → [예] → 검은 창이 하나 떠 있으면 된다(닫으면 꺼짐).
3. 게임을 하다가 **F9**(대시보드 [설정] 에서 바꿀 수 있음) → 대시보드 [🕹️ 게임 스샷] 에 쌓인다.
4. 글: [블로그 관리] 카테고리 ⑧ «연결 게임» 을 고르면 그 카테고리 글에 스샷 3장이 붙는다 → 포스팅 카드에서 [이미지 복사] → 네이버에 Ctrl+V.

## B. 클로드가 할 일 (처음 준비하는 PC 일 때)
1. `git fetch origin claude/game-play-ontn8y` → `git switch claude/game-play-ontn8y` → `git pull`, `python --version` 3.11 이상.
2. 준비 스크립트를 새 창으로: `Start-Process powershell -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File','agent\집PC-준비.ps1'`
   - 토큰은 대시보드 [🕹️ 게임 스샷 → 설정 → 🔑 집 PC 연결] 에서 복사, 또는 Cloud Shell `cat ~/maim-game-agent-token.txt`.
     사장님이 파란 창에 직접 붙여 넣는다(채팅·파일에 토큰 금지).
3. `python agent\main.py --연결시험` → ✅ 면 다음.
4. 바탕화면 바로가기: 대상 `agent\켜기.cmd`, «관리자 권한으로 실행» 켜기(게임이 관리자 권한이면 단축키가 안 들린다).
5. 게임을 맨 앞에 두고 `python agent\main.py --시험찍기 3` → 대시보드에 그 게임으로 올라갔는지 본다.
   «기타» 로 가면 `python agent\tools\게임찾기.py` 로 창 제목을 보고 대시보드 [게임 목록] 의 «창 제목 글자» 를 고친다.

## 막힐 때
| 증상 | 할 일 |
|---|---|
| `pip install` 이 cp949 오류 | `PYTHONUTF8=1` (준비 스크립트·켜기.cmd 에 이미 들어 있음) |
| 단축키를 눌러도 안 찍힘 | 프로그램이 관리자 권한인지(창 맨 위 ⚠ 문구), 게임 창이 맨 앞인지 |
| «기타» 로만 들어감 | 게임 목록의 «창 제목 글자» 가 실제 창 제목에 들어 있는지(대소문자 무관) |
| 대시보드에 메뉴가 없음 | 관리자 토큰(DASHBOARD_TOKEN)으로 1차 칸에만 넣고 들어왔는지 · 게임 블로그(게임 카테고리)인지 |
| 검은 사진 | 게임을 창 모드로. 보안 프로그램이 막으면 우회하지 않고 보고 |
