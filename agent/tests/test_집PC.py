"""집 PC 스샷 프로그램 시험 (게임 없이) — `cd agent && python -m pytest tests -q`

  - 창 제목으로 게임 찾기: 서버와 같은 규칙(긴 글자부터, 대소문자 무시, 런처 창은 안 맞음)
  - 원본 저장: captures/<게임>/<날짜>/ 에 PNG
  - 못 올린 것: 보낼것 에 적었다가 다시 읽는다
  - 원본 정리: 보관일 지난 날짜 폴더만 지운다
  - 올리기: 1600px 넘는 사진은 줄여 보낸다
"""

from __future__ import annotations

import datetime as dt
import io
import sys
from pathlib import Path

from PIL import Image

AGENT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AGENT))

from main import 창으로게임  # noqa: E402
from 올리기 import 줄이기  # noqa: E402
from 저장 import 저장소  # noqa: E402

게임들 = [
    {"id": "dokkaebi", "이름": "도깨비의세계", "창제목": "도깨비의세계 -"},
    {"id": "aniimo", "이름": "애니모", "창제목": "Aniimo"},
    {"id": "dk", "이름": "도깨비", "창제목": "도깨비"},
    {"id": "blank", "이름": "빈칸", "창제목": ""},
]


def test_창으로게임():
    assert 창으로게임("도깨비의세계 - 26.104.005", 게임들)["id"] == "dokkaebi"
    assert 창으로게임("ANIIMO Global", 게임들)["id"] == "aniimo"
    assert 창으로게임("도깨비의세계 런처", 게임들)["id"] == "dk"   # «도깨비» 만 맞는다
    assert 창으로게임("카카오톡", 게임들) is None


def test_원본과_보낼것(tmp_path):
    s = 저장소(tmp_path)
    때 = dt.datetime(2026, 10, 21, 21, 13, 2, 345000)
    p = s.원본("dokkaebi", Image.new("RGB", (320, 180), (10, 20, 30)), 때)
    assert p == tmp_path / "captures" / "dokkaebi" / "2026-10-21" / "211302_345.png" and p.exists()
    s.보낼것넣기(p, "도깨비의세계 - 26.104.005", 때.isoformat())
    [(표, 원본, 제목, 찍은때)] = s.보낼것들()
    assert 원본 == p and 제목.startswith("도깨비의세계") and 찍은때.startswith("2026-10-21")
    표.unlink()
    assert s.보낼것들() == []


def test_원본정리(tmp_path):
    s = 저장소(tmp_path)
    for 날 in ["2026-08-01", "2026-10-20", "메모"]:
        (tmp_path / "captures" / "etc" / 날).mkdir(parents=True)
    assert s.오래된원본정리(30, dt.date(2026, 10, 21)) == 1
    assert sorted(p.name for p in (tmp_path / "captures" / "etc").iterdir()) == ["2026-10-20", "메모"]


def test_줄이기():
    큰 = Image.new("RGB", (3840, 2160), (200, 100, 50))
    with Image.open(io.BytesIO(줄이기(큰, 1600))) as img:
        assert img.size == (1600, 900) and img.format == "WEBP"
    with Image.open(io.BytesIO(줄이기(Image.new("RGB", (1176, 664)), 1600))) as img:
        assert img.size == (1176, 664)
