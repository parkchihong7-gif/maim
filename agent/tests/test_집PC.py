"""집 PC 프로그램 시험 (게임 없이) — `cd agent && python -m pytest tests -q`

  - 변화 감지: 같은 화면은 «안 바뀜», 장면이 바뀌면 «바뀜», 같은 화면 시간이 쌓임
  - 영역 잘라내기: 비율대로
  - 안전: 기록 모드는 누르개를 못 만든다 / 화이트리스트 밖·금지 이름은 안 누른다
  - 기록 모드 main 은 누르기 모듈을 불러오지 않는다
  - 막힘: 같은 장면 N초·사망 2회·같은 행동 3회·보스 시간
  - 가상 게임: 감독 모드는 [임무수락] 전에는 안 넘어가고, 막힌 퀘스트는 [임무창열기]→[자동진행] 으로 넘어간다
  - 원본 정리: 보관일 지난 날짜 폴더만 지운다
"""

from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

import pytest
import yaml
from PIL import Image

AGENT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(AGENT))

from 가상게임 import 가상게임  # noqa: E402
from 누르기 import 기록모드라못누름, 누르개  # noqa: E402
from 변화 import 변화감지  # noqa: E402
from 보기 import 검은화면인가, 영역자르기  # noqa: E402
from 안전 import 안전지기  # noqa: E402
from 저장 import 저장소  # noqa: E402


def 프로필(이름: str) -> dict:
    return yaml.safe_load((AGENT / "profiles" / f"{이름}.yaml").read_text(encoding="utf-8"))


class 시계:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def 게임(이름="dokkaebi", 간격=1.0):
    c = 시계()
    return 가상게임(프로필(이름), 간격초=간격, 시계=c, 로그=lambda *a: None), c


def test_영역자르기():
    img = Image.new("RGB", (1000, 500))
    조각 = 영역자르기(img, {"x": 0.1, "y": 0.2, "w": 0.5, "h": 0.4})
    assert 조각.size == (500, 200)


def test_검은화면():
    assert 검은화면인가(Image.new("RGB", (100, 100), (0, 0, 0)))
    assert not 검은화면인가(Image.new("RGB", (100, 100), (120, 120, 120)))


def test_변화감지_같은화면과_바뀐화면():
    g, c = 게임()
    g.켜기()
    c.t = 5
    g.자동 = True
    감지 = 변화감지(프로필("dokkaebi")["영역"], 시계=c)
    첫 = g.찍기()
    assert 감지.보기(첫)[0]                 # 처음은 늘 «바뀜»
    assert not 감지.보기(g.찍기())[0]       # 시간이 안 흘렀으니 같은 화면
    c.t += 2
    assert 감지.같은화면초() == pytest.approx(2)
    c.t += 1.5                               # 간격(1초) 지나 다음 장면
    assert 감지.보기(g.찍기())[0]
    assert 감지.같은화면초() == 0
    감지.남겼음(첫)
    assert 감지.비슷한가(첫)


def test_기록모드는_누르개를_못만든다():
    with pytest.raises(기록모드라못누름):
        누르개(프로필("aniimo"), 가상=object())


def test_화이트리스트_밖과_금지이름은_안누른다():
    g, _ = 게임()
    p = 프로필("dokkaebi")
    p["버튼"]["상점열기"] = {"x": 0.5, "y": 0.5}     # 누가 프로필에 넣어도
    n = 누르개(p, 가상=g, 로그=lambda *a: None)
    assert not n.있나("상점열기")
    assert not n.누르기("상점열기")
    assert not n.누르기("공격")                       # 목록에 없는 버튼
    assert n.누르기("창닫기")
    assert g.누른기록 == ["창닫기"]


def test_기록모드_main은_누르기를_불러오지_않는다(monkeypatch, tmp_path):
    sys.modules.pop("누르기", None)
    import 설정 as 설정모듈
    import main
    s = 설정모듈.설정(서버주소="http://127.0.0.1:9", 토큰="x" * 10, 저장루트=tmp_path, 가상=True)
    a = main.에이전트(s)
    monkeypatch.setattr(a, "하트비트알림", lambda: None)
    a.시작({"명령": "start", "game": "aniimo", "profile": 프로필("aniimo")})
    assert a.누르개 is None
    assert "누르기" not in sys.modules


def test_막힘_판단():
    c = 시계()
    s = 안전지기(막힘초=300, 보스한도초=180, 시계=c)
    assert s.시간봄(299) is None
    assert "같은 장면 5분" in s.시간봄(300)
    assert s.판단봄({"장면": "사망"}) is None
    assert s.판단봄({"장면": "사망"}) == "사망 2회"
    s.새퀘스트()
    assert s.행동봄("자동진행", False) is None
    assert s.행동봄("자동진행", False) is None
    assert "3회" in s.행동봄("자동진행", False)
    s.새퀘스트()
    s.판단봄({"장면": "보스등장"})
    c.t = 181
    assert "보스전" in s.시간봄(0)


def test_가상게임_감독은_수락해야_넘어가고_막히면_다음퀘스트():
    g, c = 게임(간격=1)
    g.켜기()
    c.t = 5
    g.찍기()
    assert g.힌트()["장면"] == "퀘스트받음"
    c.t += 5
    g.찍기()
    assert g.힌트()["장면"] == "퀘스트받음"    # 누르기 전엔 그대로
    g.누름("임무수락")
    for _ in range(30):
        c.t += 1.1
        g.찍기()
    assert g.힌트()["퀘스트"]["이름"] == "잃어버린 장부"   # 1번을 마치고 2번 시작
    g.누름("임무수락")
    for _ in range(10):
        c.t += 1.1
        g.찍기()
    assert g._지금().get("멈춤")              # 2번은 멈춤 장면에서 멈춘다
    for b in ("임무창열기", "창닫기", "자동진행"):
        g.누름(b)
    assert g.힌트()["퀘스트"]["이름"] == "장터의 소문"


def test_원본정리(tmp_path):
    저장 = 저장소(tmp_path)
    저장.원본("dokkaebi", Image.new("RGB", (10, 10)), "지도", {"장면": "지도"})
    옛 = tmp_path / "captures" / "dokkaebi" / "2020-01-01"
    옛.mkdir(parents=True)
    assert 저장.오래된원본정리(30, 오늘=dt.date.today()) == 1
    assert not 옛.exists()
    assert 저장.원본수("dokkaebi") == 1
