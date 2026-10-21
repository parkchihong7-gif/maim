# 집 PC 게임 스샷 프로그램 (agent)

게임을 하다가 **단축키(기본 F9)** 를 누르면 맨 앞 게임 창을 찍어 maim 서버로 올린다.
대시보드 [🕹️ 게임 스샷] 에 날짜·게임별로 쌓이고, 게임을 연결한 카테고리 글에 3장씩 붙는다. **발행은 사람이 한다.**
게임에는 키보드·마우스를 하나도 보내지 않는다. 관리자 접속 전용 기능이다. 설계: `docs/game/게임스샷.md`

## 설치 (한 번만)
저장소 폴더에서 `powershell -ExecutionPolicy Bypass -File agent\집PC-준비.ps1`
— Python 확인 → 패키지 설치 → 서버 주소·토큰·저장 폴더(환경변수) → 연결 시험.

## 쓰기
| 하는 일 | 명령 |
|---|---|
| 켜 두기(관리자 권한 권장) | `agent\켜기.cmd` (바탕화면 «maim 게임 켜기») |
| 연결 시험 | `python main.py --연결시험` |
| 단축키 없이 한 장 시험 | `python main.py --시험찍기 3` (3초 뒤 맨 앞 창) |
| 지금 떠 있는 창 제목 보기 | `python tools/게임찾기.py [거를 말]` |
| 시험 | `python -m pytest tests -q` |

## 파일
- 원본: `<MAIM_GAME_ROOT>\captures\<게임id>\<날짜>\<시각>.png` (서버에는 가로 1280 으로 줄인 것만)
- 못 올린 것: `<MAIM_GAME_ROOT>\보낼것\*.json` — 서버가 다시 되면 저절로 올린다
- 기록: `<MAIM_GAME_ROOT>\logs\agent-YYYYMMDD.log`

단축키·원본보관일·게임 목록은 대시보드에서 정하고, 프로그램이 30초마다 받아 간다.
