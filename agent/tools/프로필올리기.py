"""집 PC 클로드용 — 0단계 시험으로 알아낸 값을 서버 프로필에 올린다(창제목·실행 파일·영역 비율만).

  python tools/프로필올리기.py --game aniimo --보기
  python tools/프로필올리기.py --game aniimo --창제목 "Aniimo" --파일 "C:\\Games\\Aniimo\\Aniimo.exe"
  python tools/프로필올리기.py --game dokkaebi --영역 퀘스트표시=0.75,0.20,0.24,0.30 --영역 미니맵=0.84,0,0.16,0.22

버튼(누를 것)·모드·금지 화면은 여기서 못 바꾼다 — 대시보드 [설정 → 게임 프로필] 에서 사람이 한다.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
for _흐름 in (sys.stdout, sys.stderr):
    try:
        _흐름.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import 설정 as 설정모듈  # noqa: E402
from 올리기 import 서버  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--game", required=True)
    ap.add_argument("--보기", action="store_true")
    ap.add_argument("--창제목")
    ap.add_argument("--파일")
    ap.add_argument("--인자")
    ap.add_argument("--런처창제목")
    ap.add_argument("--창대기초", type=int)
    ap.add_argument("--영역", action="append", default=[], help="이름=x,y,w,h (0~1 비율)")
    a = ap.parse_args()
    s = 설정모듈.읽기()
    srv = 서버(s.서버주소, s.토큰)
    if a.보기:
        print(json.dumps(srv.프로필(a.game), ensure_ascii=False, indent=1))
        return
    몸: dict = {}
    if a.창제목:
        몸["창제목"] = a.창제목
    실행 = {k: v for k, v in {"파일": a.파일, "인자": a.인자, "런처창제목": a.런처창제목, "창대기초": a.창대기초}.items() if v is not None}
    if 실행:
        몸["실행"] = 실행
    if a.영역:
        몸["영역"] = {}
        for 줄 in a.영역:
            이름, 값 = 줄.split("=", 1)
            x, y, w, h = (float(v) for v in 값.split(","))
            몸["영역"][이름.strip()] = {"x": x, "y": y, "w": w, "h": h}
    if not 몸:
        sys.exit("바꿀 값이 없습니다.")
    p = srv._보내기("PUT", f"/api/game/agent/profile/{a.game}", 몸)
    print("✅ 올렸습니다:", json.dumps({k: p.get(k) for k in ("창제목", "실행", "영역")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
