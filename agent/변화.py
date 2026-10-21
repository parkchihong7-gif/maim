"""화면 변화 감지 — 영역별 지각 해시(pHash) 차이 + 전체 화면 차이 (GAME_PLAN 4번).

  - 퀘스트표시·미니맵·지역명 영역 중 하나라도 해시 거리가 기준을 넘으면 «바뀜»
  - 전체 화면 해시도 크게 다르면 «바뀜» (창이 열리거나 장면이 통째로 바뀜)
  - 같은 화면이 이어진 시간을 잰다 → 막힘 판단(기본 5분)
  - 남긴 사진과 너무 비슷하면 버린다(원본에서도)
"""

from __future__ import annotations

import time

import imagehash
from PIL import Image

from 보기 import 영역자르기

영역기준 = 8      # 영역 해시 거리가 이보다 크면 바뀜
전체기준 = 10     # 전체 해시 거리
비슷기준 = 4      # 남긴 사진끼리 이보다 가까우면 «비슷함»


def 해시(img: Image.Image) -> imagehash.ImageHash:
    return imagehash.phash(img.convert("L"), hash_size=8)


class 변화감지:
    def __init__(self, 영역들: dict, 시계=time.monotonic):
        self.영역들 = {k: v for k, v in (영역들 or {}).items() if k != "목록"}
        self.시계 = 시계
        self.전: dict[str, imagehash.ImageHash] = {}
        self.같은화면부터 = 시계()
        self.남긴해시: list[imagehash.ImageHash] = []

    def 보기(self, img: Image.Image) -> tuple[bool, list[str]]:
        """이번 화면이 앞 화면과 달라졌나. 돌려주는 것: (바뀜, 바뀐 영역 이름들)."""
        지금 = {"전체": 해시(img)}
        for 이름, 비율 in self.영역들.items():
            지금[이름] = 해시(영역자르기(img, 비율))
        if not self.전:
            self.전 = 지금
            self.같은화면부터 = self.시계()
            return True, ["처음"]
        바뀐 = [k for k, h in 지금.items() if k != "전체" and (h - self.전.get(k, h)) > 영역기준]
        if (지금["전체"] - self.전["전체"]) > 전체기준:
            바뀐.append("전체")
        self.전 = 지금
        if 바뀐:
            self.같은화면부터 = self.시계()
        return bool(바뀐), 바뀐

    def 같은화면초(self) -> float:
        return self.시계() - self.같은화면부터

    def 처음부터(self) -> None:
        self.같은화면부터 = self.시계()

    def 비슷한가(self, img: Image.Image) -> bool:
        h = 해시(img)
        return any((h - 옛) <= 비슷기준 for 옛 in self.남긴해시[-30:])

    def 남겼음(self, img: Image.Image) -> None:
        self.남긴해시.append(해시(img))
