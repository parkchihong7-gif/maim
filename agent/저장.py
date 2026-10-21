"""원본 저장 — 집 PC 에만 둔다 (GAME_PLAN 0-5, 4번).

  <루트>\\captures\\<게임id>\\<YYYY-MM-DD>\\<HHMMSS>_<장면>.png  + 같은 이름 .json(판단 결과)
  <루트>\\logs\\agent-YYYYMMDD.log
오래된 원본은 원본보관일(기본 30일)이 지나면 지운다.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import shutil
from pathlib import Path

from PIL import Image


class 저장소:
    def __init__(self, 루트: Path):
        self.루트 = Path(루트)
        (self.루트 / "logs").mkdir(parents=True, exist_ok=True)

    def 로그(self, 글: str) -> None:
        지금 = dt.datetime.now()
        줄 = f"[{지금:%H:%M:%S}] {글}"
        print(줄, flush=True)
        try:
            with (self.루트 / "logs" / f"agent-{지금:%Y%m%d}.log").open("a", encoding="utf-8") as f:
                f.write(줄 + "\n")
        except OSError:
            pass

    def 원본(self, 게임: str, img: Image.Image, 장면: str, 판단: dict | None = None) -> Path:
        지금 = dt.datetime.now()
        폴더 = self.루트 / "captures" / 게임 / f"{지금:%Y-%m-%d}"
        폴더.mkdir(parents=True, exist_ok=True)
        이름 = re.sub(r"[^\w가-힣-]", "", 장면) or "기타"
        p = 폴더 / f"{지금:%H%M%S}_{지금.microsecond // 1000:03d}_{이름}.png"
        img.save(p)
        if 판단 is not None:
            p.with_suffix(".json").write_text(json.dumps(판단, ensure_ascii=False, indent=1), encoding="utf-8")
        return p

    def 원본수(self, 게임: str) -> int:
        폴더 = self.루트 / "captures" / 게임 / f"{dt.date.today():%Y-%m-%d}"
        return len(list(폴더.glob("*.png"))) if 폴더.exists() else 0

    def 오래된원본정리(self, 보관일: int, 오늘: dt.date | None = None) -> int:
        """날짜 폴더 이름으로 판단해 보관일이 지난 폴더를 통째로 지운다."""
        오늘 = 오늘 or dt.date.today()
        지움 = 0
        for 게임폴더 in (self.루트 / "captures").glob("*"):
            for 날 in 게임폴더.glob("*"):
                try:
                    d = dt.date.fromisoformat(날.name)
                except ValueError:
                    continue
                if (오늘 - d).days > 보관일:
                    shutil.rmtree(날, ignore_errors=True)
                    지움 += 1
        return 지움
