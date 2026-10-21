"""서버와 이야기하기 — 하트비트·판단·사진·이벤트·목록 (GAME_PLAN 7-3).

사진은 JSON 안의 base64 로 보낸다. 판단용은 가로 768px, 남길 사진은 WebP 품질 80·가로 1280px.
실패하면 3번까지 다시 보낸다(1·2·4초 쉬고).
"""

from __future__ import annotations

import base64
import io
import time

import requests
from PIL import Image


def 줄이기(img: Image.Image, 폭: int, 형식: str = "WEBP", 품질: int = 80) -> bytes:
    if img.width > 폭:
        img = img.resize((폭, round(img.height * 폭 / img.width)), Image.LANCZOS)
    b = io.BytesIO()
    img.convert("RGB").save(b, 형식, quality=품질)
    return b.getvalue()


def b64(내용: bytes) -> str:
    return base64.b64encode(내용).decode("ascii")


class 서버탈(Exception):
    pass


class 서버:
    def __init__(self, 주소: str, 토큰: str, 로그=print):
        self.주소 = 주소.rstrip("/")
        self.세션 = requests.Session()
        self.세션.headers.update({"x-game-agent-token": 토큰, "content-type": "application/json"})
        self.로그 = 로그

    def _보내기(self, 방식: str, 길: str, 몸: dict | None = None, 시간: float = 30, 다시: int = 3) -> dict:
        마지막: Exception | None = None
        for i in range(다시):
            try:
                r = self.세션.request(방식, f"{self.주소}{길}", json=몸, timeout=시간)
                if r.status_code in (401, 404, 409, 503):
                    # 다시 해도 안 되는 것 — 토큰·저장통·설정 문제. 바로 알린다.
                    raise 서버탈(f"{r.status_code} {r.json().get('error', r.text)[:200]}")
                r.raise_for_status()
                return r.json() if r.content else {}
            except 서버탈:
                raise
            except Exception as 탈:  # 네트워크·5xx
                마지막 = 탈
                time.sleep(2 ** i)
        raise 서버탈(f"서버에 닿지 못했습니다 ({길}): {마지막}")

    def 하트비트(self, 버전: str, 게임: str | None, 상태: str, 자세히: dict) -> dict:
        return self._보내기("POST", "/api/game/agent/heartbeat", {"version": 버전, "game": 게임, "state": 상태, "detail": 자세히}, 시간=15, 다시=1)

    def 프로필(self, game_id: str) -> dict:
        return self._보내기("GET", f"/api/game/agent/profile/{game_id}")

    def 판단(self, 게임: str, img: Image.Image, 상황: dict) -> dict:
        return self._보내기("POST", "/api/game/agent/judge", {"game": 게임, "image": b64(줄이기(img, 768)), "상황": 상황}, 시간=120, 다시=2)

    def 사진(self, 게임: str, img: Image.Image, 장면: str, 설명: str, 출처: str = "auto",
             퀘스트id: int | None = None, 찍은때: str | None = None, 목적: str | None = None, 항목id: int | None = None) -> dict:
        몸 = {"game": 게임, "image": b64(줄이기(img, 1280)), "scene": 장면, "caption": 설명, "source": 출처,
              "quest_id": 퀘스트id, "taken_at": 찍은때, "목적": 목적, "항목id": 항목id}
        return self._보내기("POST", "/api/game/agent/shot", 몸, 시간=60)

    def 목록(self, 게임: str, 사진들: list[Image.Image], 가상힌트=None) -> dict:
        return self._보내기("POST", "/api/game/agent/list",
                          {"game": 게임, "images": [b64(줄이기(i, 1280)) for i in 사진들], "가상힌트": 가상힌트}, 시간=180, 다시=2)

    def 이벤트(self, 게임: str | None, 종류: str, 자세히: dict | None = None) -> None:
        try:
            self._보내기("POST", "/api/game/agent/event", {"game": 게임, "kind": 종류, "detail": 자세히 or {}}, 시간=15, 다시=2)
        except 서버탈 as 탈:
            self.로그(f"  (이벤트를 못 보냈습니다: {탈})")
