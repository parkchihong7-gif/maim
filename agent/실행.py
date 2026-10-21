"""게임 켜기 (GAME_PLAN 15-2).

  - 게임 창이 이미 떠 있으면 새로 켜지 않고 그 창에 붙는다.
  - 프로필 «실행.파일»(게임 또는 공식 런처 exe)만 실행한다. **아이디·비밀번호는 다루지 않는다** —
    로그인은 공식 런처의 «자동 로그인» 에 맡긴다. 로그인 화면이 보이면 서버 판단(장면 «로그인»)이 정지시킨다.
  - 런처 [게임 시작] 클릭은 감독 모드 + 프로필에 좌표가 있을 때만 1회. 기록 모드는 사장님이 누른다.
  - «창대기초»(기본 180초) 안에 게임 창이 안 뜨면 «확인 필요».
"""

from __future__ import annotations

import shlex
import subprocess
import time
from pathlib import Path


class 켜기실패(RuntimeError):
    pass


def 켜기(프로필: dict, 창, 로그=print, 누르개만들기=None) -> None:
    """진짜 게임 켜기. `창` 은 창.게임창. 성공하면 돌아오고, 실패하면 켜기실패."""
    if 창.찾기():
        로그("  게임 창이 이미 있습니다 — 그 창에 붙습니다.")
        return
    실행 = 프로필.get("실행") or {}
    파일 = str(실행.get("파일") or "")
    if not 파일 or 파일.startswith("<"):
        raise 켜기실패("프로필 «실행.파일» 이 비어 있습니다. 대시보드 [설정 → 게임 프로필] 에서 exe 경로를 넣어 주세요.")
    if not Path(파일).exists():
        raise 켜기실패(f"실행 파일이 없습니다: {파일}")
    인자 = shlex.split(str(실행.get("인자") or ""), posix=False)
    로그(f"  ▶ 게임 켜기: {파일}")
    subprocess.Popen([파일, *인자], cwd=str(Path(파일).parent))

    런처제목 = str(실행.get("런처창제목") or "")
    버튼 = 실행.get("런처시작버튼") or {}
    if 런처제목:
        from 창 import 게임창
        런처 = 게임창(런처제목)
        끝 = time.time() + 60
        while time.time() < 끝 and not 런처.찾기():
            time.sleep(1)
        if 런처.찾기() and 프로필.get("모드") == "감독" and "x" in 버튼 and 누르개만들기:
            time.sleep(3)
            누르개 = 누르개만들기({"모드": "감독", "버튼": {"런처시작": 버튼}}, 런처)
            누르개.누르기("런처시작")
        elif 런처.찾기():
            로그("  런처가 떴습니다 — [게임 시작] 을 눌러 주세요.")

    끝 = time.time() + float(실행.get("창대기초") or 180)
    while time.time() < 끝:
        if 창.찾기():
            로그("  게임 창이 떴습니다.")
            return
        time.sleep(2)
    raise 켜기실패(f"{실행.get('창대기초') or 180}초 안에 게임 창이 뜨지 않았습니다.")
