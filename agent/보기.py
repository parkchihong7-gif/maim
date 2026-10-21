"""화면 보기 — 창 안쪽 캡처, 영역 잘라내기, 검은 화면 감지 (GAME_PLAN 8번).

mss 는 진짜 게임(윈도)에서만 불러온다. 가상 게임은 그림을 바로 돌려준다.
"""

from __future__ import annotations

from PIL import Image, ImageChops, ImageStat

검은화면_밝기 = 8      # 평균 밝기(0~255)가 이보다 낮고
검은화면_흔들림 = 4    # 밝기 표준편차도 이보다 낮으면 검은 화면


def 검은화면인가(img: Image.Image) -> bool:
    stat = ImageStat.Stat(img.convert("L"))
    return stat.mean[0] < 검은화면_밝기 and stat.stddev[0] < 검은화면_흔들림


def 평균차이(a: Image.Image, b: Image.Image) -> float:
    if a.size != b.size:
        b = b.resize(a.size)
    return ImageStat.Stat(ImageChops.difference(a.convert("L"), b.convert("L"))).mean[0]


def 영역자르기(img: Image.Image, 비율: dict) -> Image.Image:
    W, H = img.size
    x, y = float(비율.get("x", 0)), float(비율.get("y", 0))
    w, h = float(비율.get("w", 1)), float(비율.get("h", 1))
    box = (round(x * W), round(y * H), round(min(1, x + w) * W), round(min(1, y + h) * H))
    if box[2] <= box[0] or box[3] <= box[1]:
        return img.copy()
    return img.crop(box)


class 진짜화면:
    """윈도 게임 창 캡처. mss 는 여기서만 불러온다."""

    def __init__(self, 창):
        import mss  # noqa: 윈도 전용
        self.sct = mss.mss()
        self.창 = 창

    def 찍기(self) -> Image.Image | None:
        영역 = self.창.안쪽()
        if not 영역 or 영역["width"] < 50 or 영역["height"] < 50:
            return None
        raw = self.sct.grab(영역)
        return Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")
