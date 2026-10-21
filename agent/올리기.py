"""서버와 이야기하기 — 하트비트·스샷 올리기.

사진은 JSON 안의 base64 로 보낸다. 가로 1600px 이하 WebP(품질 90)로 줄여 보내고, 서버가 다시 1280 으로 줄여 둔다.
네트워크 탈이면 3번까지 다시 보낸다(1·2·4초 쉬고).
"""

from __future__ import annotations

import base64
import io
import time

import requests
from PIL import Image


def 줄이기(img: Image.Image, 폭: int, 형식: str = "WEBP", 품질: int = 90) -> bytes:
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
    def __init__(self, 주소: str, 토큰: str, 로그=print, 버전: str = ""):
        self.주소 = 주소.rstrip("/")
        self.버전 = 버전
        self.세션 = requests.Session()
        self.세션.headers.update({"x-game-agent-token": 토큰, "x-agent-version": 버전, "content-type": "application/json"})
        self.로그 = 로그

    def _보내기(self, 방식: str, 길: str, 몸: dict | None = None, 시간: float = 30, 다시: int = 3) -> dict:
        마지막: Exception | None = None
        for i in range(다시):
            try:
                r = self.세션.request(방식, f"{self.주소}{길}", json=몸, timeout=시간)
                if r.status_code in (400, 401, 404, 409, 503):
                    # 다시 해도 안 되는 것 — 토큰·저장통·설정 문제. 바로 알린다.
                    try:
                        말 = r.json().get("error", r.text)
                    except ValueError:
                        말 = r.text
                    raise 서버탈(f"{r.status_code} {str(말)[:200]}")
                r.raise_for_status()
                return r.json() if r.content else {}
            except 서버탈:
                raise
            except Exception as 탈:  # 네트워크·5xx
                마지막 = 탈
                if i < 다시 - 1:
                    time.sleep(2 ** i)
        raise 서버탈(f"서버에 닿지 못했습니다 ({길}): {마지막}")

    def 하트비트(self) -> dict:
        return self._보내기("POST", "/api/game/agent/heartbeat", {"version": self.버전}, 시간=15, 다시=1)

    def 스샷(self, img: Image.Image, 창제목: str, 찍은때: str) -> dict:
        몸 = {"image": b64(줄이기(img, 1600)), "window_title": 창제목, "taken_at": 찍은때}
        return self._보내기("POST", "/api/game/agent/shot", 몸, 시간=60)
