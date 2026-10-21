"""원본 저장 — 집 PC 에만 둔다.

  <루트>\\captures\\<게임id>\\<YYYY-MM-DD>\\<HHMMSS>_<ms>.png   찍은 그대로(서버에는 줄인 것만)
  <루트>\\보낼것\\<같은 이름>.json                              서버가 안 될 때 — 연결되면 다시 올린다
  <루트>\\logs\\agent-YYYYMMDD.log
오래된 원본은 원본보관일(기본 30일, 대시보드 [설정])이 지나면 지운다.
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

    def 원본(self, 게임: str, img: Image.Image, 때: dt.datetime | None = None) -> Path:
        지금 = 때 or dt.datetime.now()
        폴더 = self.루트 / "captures" / re.sub(r"[^\w-]", "", 게임) / f"{지금:%Y-%m-%d}"
        폴더.mkdir(parents=True, exist_ok=True)
        p = 폴더 / f"{지금:%H%M%S}_{지금.microsecond // 1000:03d}.png"
        img.save(p)
        return p

    # ── 못 올린 것 ──
    def 보낼것넣기(self, 원본: Path, 창제목: str, 찍은때: str) -> None:
        폴더 = self.루트 / "보낼것"
        폴더.mkdir(parents=True, exist_ok=True)
        (폴더 / f"{원본.parent.parent.name}_{원본.parent.name}_{원본.stem}.json").write_text(
            json.dumps({"원본": str(원본), "창제목": 창제목, "찍은때": 찍은때}, ensure_ascii=False), encoding="utf-8")

    def 보낼것들(self) -> list[tuple[Path, Path, str, str]]:
        """(표 파일, 원본, 창 제목, 찍은 때) — 오래된 것부터."""
        줄 = []
        for 표 in sorted((self.루트 / "보낼것").glob("*.json")):
            try:
                v = json.loads(표.read_text(encoding="utf-8"))
                줄.append((표, Path(v["원본"]), v.get("창제목", ""), v.get("찍은때", "")))
            except (OSError, ValueError, KeyError):
                표.unlink(missing_ok=True)
        return 줄

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
