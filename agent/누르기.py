"""감독 모드 전용 — 프로필 «버튼» 목록(화이트리스트)에 있는 것만 누른다 (GAME_PLAN 1·8번).

  - 기록 모드 프로필로 만들면 바로 거부한다. main.py 는 기록 모드에서 이 파일을 **불러오지도 않는다.**
  - 버튼 이름이 목록에 없거나, 상점·결제·거래·채팅 같은 금지 말이 들어 있으면 누르지 않는다.
  - 좌표는 창 안쪽 크기에 대한 비율(0~1) → 실제 좌표로 바꾼다. AI 가 좌표를 새로 만들 수 없다.
  - 입력을 숨기거나 감지를 피하는 기능은 넣지 않는다. 보안 프로그램이 막으면 기록 모드로 바꾼다.
"""

from __future__ import annotations

import re
import time

금지버튼말 = re.compile(r"상점|결제|구매|충전|거래|경매|채팅|문파|길드|우편|PvP|대전", re.I)
키이름 = {"ESC": "esc", "ENTER": "enter", "SPACE": "space", "TAB": "tab"}


class 기록모드라못누름(RuntimeError):
    pass


class 누르개:
    def __init__(self, 프로필: dict, 창=None, 가상=None, 로그=print):
        if 프로필.get("모드") != "감독":
            raise 기록모드라못누름("기록 모드 게임에서는 누르기를 쓸 수 없습니다(입력 0건).")
        self.버튼: dict = {k: v for k, v in (프로필.get("버튼") or {}).items() if not 금지버튼말.search(k)}
        self.창 = 창
        self.가상 = 가상
        self.로그 = 로그
        self.누른기록: list[tuple[float, str]] = []
        self.입력 = None
        if 가상 is None:
            import pydirectinput  # noqa: 감독 모드 + 진짜 게임에서만
            pydirectinput.PAUSE = 0.05
            self.입력 = pydirectinput

    def 있나(self, 이름: str) -> bool:
        return 이름 in self.버튼

    def 누르기(self, 이름: str) -> bool:
        if 금지버튼말.search(이름) or 이름 not in self.버튼:
            self.로그(f"  ✋ «{이름}» 은(는) 프로필 버튼 목록에 없어 누르지 않습니다.")
            return False
        b = self.버튼[이름] or {}
        self.누른기록.append((time.time(), 이름))
        if self.가상 is not None:
            self.가상.누름(이름)
            self.로그(f"  👆 [가상] {이름}")
            return True
        self.창.앞으로()
        time.sleep(0.15)
        if b.get("키"):
            키 = str(b["키"])
            self.입력.press(키이름.get(키.upper(), 키.lower()))
        elif "x" in b and "y" in b:
            영역 = self.창.안쪽()
            if not 영역:
                return False
            x = 영역["left"] + round(float(b["x"]) * 영역["width"])
            y = 영역["top"] + round(float(b["y"]) * 영역["height"])
            self.입력.click(x, y)
        else:
            return False
        self.로그(f"  👆 {이름}")
        return True

    def 같은행동되풀이(self, 이름: str, 번: int = 3, 안에초: float = 600) -> bool:
        최근 = [n for t, n in self.누른기록 if time.time() - t < 안에초][-번:]
        return len(최근) == 번 and all(n == 이름 for n in 최근)
