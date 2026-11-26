"""🕹️ 집 PC 게임 스샷 프로그램 (2026-11-26 개편 — 단축키 → 자동 촬영).

  python main.py                  켜 두기. 게임 중 자동 촬영 간격(기본 5초)마다 맨 앞 창을 찍어 올린다
  python main.py --연결시험        서버에 한 번 신호만 보내 보고 끝냄
  python main.py --시험찍기 5       5초 뒤 맨 앞 창을 한 장 찍어 올리고 끝냄(단축키 없이 시험)

하는 일은 다섯 가지뿐이다: 자동 촬영 간격 → 맨 앞 창 찍기 → 집 PC 에 원본 저장 → 서버에 올리기 → 못 올린 것은 나중에 다시.
게임에는 키보드·마우스를 **하나도 보내지 않는다.** 단축키를 누를 필요가 없다 — 이 프로그램이 켜져 있는 동안
맨 앞 창을 계속 자동으로 찍는다(2026-11-26 전에는 단축키를 눌러야만 찍었다).
게임 구분은 서버가 창 제목으로 한다(대시보드 [게임 목록]). 목록에 없는 창은 «기타» 로 들어간다.

**주의** — 이 프로그램이 켜져 있는 동안은 맨 앞 창이 무엇이든(게임이 아니어도) 자동 촬영 간격마다 찍어 올린다.
게임을 할 때만 켜고 다 하면 꺼 두는 걸 권한다(바탕화면 «maim 게임 켜기» 창을 닫으면 꺼진다).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

for _흐름 in (sys.stdout, sys.stderr):
    try:
        _흐름.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import 설정 as 설정모듈  # noqa: E402
from 올리기 import 서버, 서버탈  # noqa: E402
from 저장 import 저장소  # noqa: E402

하트비트초 = 30
정리초 = 6 * 3600


def 창으로게임(제목: str, 게임들: list[dict]) -> dict | None:
    """서버(src/game/프로필.ts 창으로게임)와 같은 규칙 — 원본 폴더 이름을 정할 때만 쓴다."""
    낮은 = 제목.lower()
    for g in sorted((g for g in 게임들 if g.get("창제목")), key=lambda g: -len(g["창제목"])):
        if g["창제목"].lower() in 낮은:
            return g
    return None


class 프로그램:
    def __init__(self, s: 설정모듈.설정):
        self.s = s
        self.저장 = 저장소(s.저장루트)
        self.로그 = self.저장.로그
        self.서버 = 서버(s.서버주소, s.토큰, 로그=self.로그, 버전=설정모듈.버전)
        self.촬영주기초 = 5
        self.게임들: list[dict] = []
        self.연결 = None  # 처음엔 모름
        self._알림 = False

    # ── 서버 ─────────────────────────────────────────────
    def 하트비트(self) -> None:
        try:
            r = self.서버.하트비트()
        except 서버탈 as 탈:
            if self.연결 is not False:
                self.로그(f"⚠ 서버 연결 안 됨 — {탈}  (원본은 계속 저장하고, 연결되면 다시 올립니다)")
            self.연결 = False
            return
        if self.연결 is not True:
            self.로그("✅ 서버 연결됨")
        self.연결 = True
        설 = r.get("settings") or {}
        self.게임들 = r.get("games") or []
        self.s.원본보관일 = int(설.get("원본보관일") or self.s.원본보관일)
        주기 = int(설.get("촬영주기초") or 5)
        if 주기 != self.촬영주기초 or not self._알림:
            self.로그(f"📸 {주기}초마다 자동 촬영 (대시보드 [설정] 에서 바꿀 수 있습니다)")
            self._알림 = True
        self.촬영주기초 = 주기
        self.다시보내기()

    # ── 찍기 ─────────────────────────────────────────────
    def 찍기(self) -> None:
        from 창 import 맨앞창찍기
        찍은때 = dt.datetime.now().astimezone()
        결과 = 맨앞창찍기()
        if 결과 is None:
            self.로그("  (찍을 창이 없습니다 — 게임 창을 맨 앞에 두고 눌러 주세요)")
            return
        img, 제목 = 결과
        게임 = 창으로게임(제목, self.게임들)
        원본 = self.저장.원본(게임["id"] if 게임 else "etc", img, 찍은때)
        try:
            r = self.서버.스샷(img, 제목, 찍은때.isoformat())
            self.로그(f"📸 {r.get('game_name')} — 올림 (오늘 {r.get('today')}장)" + ("" if 게임 else f"  · 게임 목록에 없는 창 «{제목[:30]}» → 대시보드 «기타»"))
            self.삑(True)
        except 서버탈 as 탈:
            self.저장.보낼것넣기(원본, 제목, 찍은때.isoformat())
            self.로그(f"⚠ 못 올렸습니다 — 원본은 저장했고 연결되면 다시 올립니다 ({탈})")
            self.삑(False)

    def 다시보내기(self) -> None:
        for 표, 원본, 제목, 때 in self.저장.보낼것들():
            try:
                from PIL import Image
                with Image.open(원본) as img:
                    r = self.서버.스샷(img.convert("RGB"), 제목, 때)
                표.unlink(missing_ok=True)
                self.로그(f"📤 밀린 스샷 올림 — {r.get('game_name')}")
            except FileNotFoundError:
                표.unlink(missing_ok=True)
            except 서버탈:
                return

    @staticmethod
    def 삑(잘됨: bool) -> None:
        try:
            import winsound
            winsound.MessageBeep(winsound.MB_OK if 잘됨 else winsound.MB_ICONHAND)
        except Exception:
            pass

    # ── 돌기 ─────────────────────────────────────────────
    def 돌기(self) -> None:
        self.로그(f"🕹️ maim 게임 스샷 {설정모듈.버전} — 서버 {self.s.서버주소}")
        self.로그(f"   원본 저장: {self.s.저장루트 / 'captures'}  ·  이 창을 닫으면 꺼집니다")
        if not self.s.토큰:
            self.로그("⚠ MAIM_GAME_AGENT_TOKEN 이 비어 있습니다. 집PC-준비.ps1 을 먼저 돌려 주세요.")
        마지막 = {"하트": 0.0, "정리": 0.0, "찍기": 0.0}
        while True:
            지금 = time.monotonic()
            if 지금 - 마지막["하트"] >= 하트비트초:
                마지막["하트"] = 지금
                self.하트비트()
            if 지금 - 마지막["정리"] >= 정리초:
                마지막["정리"] = 지금
                n = self.저장.오래된원본정리(self.s.원본보관일)
                if n:
                    self.로그(f"🧹 {self.s.원본보관일}일 지난 원본 폴더 {n}개 정리")
            if 지금 - 마지막["찍기"] >= self.촬영주기초:
                마지막["찍기"] = 지금
                try:
                    self.찍기()
                except Exception as 탈:  # 한 번 탈이 나도 프로그램은 계속
                    self.로그(f"⚠ 찍기 탈: {탈}")
            time.sleep(0.5)


def main() -> None:
    ap = argparse.ArgumentParser(description="maim 집 PC 게임 스샷 프로그램")
    ap.add_argument("--연결시험", action="store_true", help="서버에 한 번 신호만 보내 보고 끝냄")
    ap.add_argument("--시험찍기", type=float, metavar="초", help="이 초 뒤 맨 앞 창을 한 장 찍어 올리고 끝냄")
    a = ap.parse_args()
    s = 설정모듈.읽기()
    if a.연결시험:
        print(f"서버: {s.서버주소}")
        print(f"토큰: {'있음' if s.토큰 else '없음 ← 집PC-준비.ps1 을 먼저'} · 저장 루트: {s.저장루트}")
        try:
            r = 서버(s.서버주소, s.토큰, 버전=설정모듈.버전).하트비트()
            print(f"✅ 연결됨 — {r.get('settings', {}).get('촬영주기초')}초마다 자동 촬영 · 게임 {len(r.get('games') or [])}개. 대시보드 🕹️ 게임 스샷 막대가 «집 PC 연결됨» 으로 바뀝니다.")
            sys.exit(0)
        except 서버탈 as 탈:
            print(f"❌ 연결 안 됨 — {탈}")
            sys.exit(1)
    if sys.platform != "win32":
        sys.exit("윈도(집 PC)에서만 됩니다.")
    from 창 import 고해상도_맞추기
    고해상도_맞추기()
    p = 프로그램(s)
    if a.시험찍기 is not None:
        p.하트비트()
        p.로그(f"⏱ {a.시험찍기:g}초 뒤 맨 앞 창을 찍습니다")
        time.sleep(a.시험찍기)
        p.찍기()
        return
    p.돌기()


if __name__ == "__main__":
    main()
