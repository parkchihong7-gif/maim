"""안전 규칙 — 막힘 판단, 단축키(F9 수동 캡처·F10 목록 찍기·F12 즉시 정지) (GAME_PLAN 1·6번).

막힘이면 그 퀘스트를 «직접 플레이 대기» 로 넘긴다:
  - 같은 장면 N분(프로필 막힘판단분, 기본 5) 이상
  - 같은 행동 3회 반복 후 변화 없음
  - 사망 2회
  - 보스전에서 3분 안에 처치 못 함
하루 상한은 서버가 셈해 하트비트로 «stop» 을 준다.
"""

from __future__ import annotations

import queue
import time


class 단축키:
    """keyboard 라이브러리로 전역 단축키를 건다. 못 불러오면(다른 OS·권한) 조용히 끈다."""

    def __init__(self, 로그=print):
        self.눌림: queue.Queue[str] = queue.Queue()
        self.켜짐 = False
        try:
            import keyboard  # noqa
            for 키 in ("f9", "f10", "f12"):
                keyboard.add_hotkey(키, lambda k=키: self.눌림.put(k.upper()))
            self.켜짐 = True
        except Exception as 탈:  # 리눅스에서 root 아님 등
            로그(f"  (단축키를 못 걸었습니다 — F9·F10·F12 없이 진행: {탈})")

    def 넣기(self, 키: str) -> None:
        """시험·가상 게임용 — 키를 누른 것처럼."""
        self.눌림.put(키)

    def 꺼내기(self) -> list[str]:
        out = []
        while not self.눌림.empty():
            out.append(self.눌림.get_nowait())
        return out


class 안전지기:
    def __init__(self, 막힘초: float, 보스한도초: float = 180, 시계=time.monotonic):
        self.막힘초 = 막힘초
        self.보스한도초 = 보스한도초
        self.시계 = 시계
        self.새퀘스트()

    def 새퀘스트(self) -> None:
        self.사망수 = 0
        self.보스시작: float | None = None
        self.행동기록: list[str] = []

    def 판단봄(self, 판단: dict) -> str | None:
        장면 = 판단.get("장면")
        if 장면 == "사망":
            self.사망수 += 1
            if self.사망수 >= 2:
                return "사망 2회"
        if 장면 == "보스등장" and self.보스시작 is None:
            self.보스시작 = self.시계()
        if 장면 in ("보스처치", "퀘스트완료", "보상"):
            self.보스시작 = None
        return None

    def 행동봄(self, 행동: str, 화면바뀜: bool) -> str | None:
        if 화면바뀜:
            self.행동기록 = []
        if 행동 in ("대기", "정지", "다음퀘스트", "직접플레이대기"):
            return None
        self.행동기록.append(행동)
        if len(self.행동기록) >= 3 and len(set(self.행동기록[-3:])) == 1:
            return f"같은 행동({행동}) 3회 반복 후 변화 없음"
        return None

    def 시간봄(self, 같은화면초: float) -> str | None:
        if 같은화면초 >= self.막힘초:
            분 = self.막힘초 / 60
            return f"같은 장면 {분:g}분 이상" if 분 >= 1 else f"같은 장면 {self.막힘초:g}초 이상"
        if self.보스시작 is not None and self.시계() - self.보스시작 > self.보스한도초:
            return f"보스전 {self.보스한도초 / 60:g}분 안에 처치 못 함"
        return None
