"""🕹️ 집 PC 게임 스샷 프로그램 (2026-10-21 개편).

  python main.py                  켜 두기. 게임 중 단축키(기본 F9)를 누르면 맨 앞 창을 찍어 올린다
  python main.py --연결시험        서버에 한 번 신호만 보내 보고 끝냄
  python main.py --시험찍기 5       5초 뒤 맨 앞 창을 한 장 찍어 올리고 끝냄(단축키 없이 시험)

하는 일은 다섯 가지뿐이다: 단축키 → 맨 앞 창 찍기 → 집 PC 에 원본 저장 → 서버에 올리기 → 못 올린 것은 나중에 다시.
게임에는 키보드·마우스를 **하나도 보내지 않는다.** 단축키는 가로채서 게임에 넘기지 않는다(같은 키를 게임이 쓰면 겹치니까).
게임 구분은 서버가 창 제목으로 한다(대시보드 [게임 목록]). 목록에 없는 창은 «기타» 로 들어간다.

도깨비의세계처럼 관리자 권한으로 도는 게임에서는 이 프로그램도 관리자 권한이어야 단축키가 들린다
(바탕화면 «maim 게임 켜기» 바로가기가 그렇게 돼 있다).
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import queue
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
        self.단축키 = "F9"
        self.게임들: list[dict] = []
        self.연결 = None  # 처음엔 모름
        self.누름 = queue.Queue()
        self.건 = None    # keyboard 에 건 단축키

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
        키 = 설.get("단축키") or "F9"
        if 키 != self.단축키 or self.건 is None:
            self.단축키걸기(키)
        self.다시보내기()

    def 단축키걸기(self, 키: str) -> None:
        import keyboard  # noqa: 윈도 전용
        if self.건 is not None:
            keyboard.remove_hotkey(self.건)
        # suppress — 단축키는 게임에 넘기지 않는다. 도깨비의세계는 F9 가 우편함이라 같이 열려 버린다.
        self.건 = keyboard.add_hotkey(키.lower(), lambda: self.누름.put(time.time()), suppress=True)
        if 키 != self.단축키 or not getattr(self, "_알림", False):
            self.로그(f"📸 단축키 {키} = 스샷 (대시보드 [설정] 에서 바꿀 수 있습니다)")
            self._알림 = True
        self.단축키 = 키

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
        if not 관리자인가():
            self.로그("⚠ 관리자 권한이 아닙니다 — 관리자 권한 게임(도깨비의세계)에서는 단축키가 안 들립니다. «maim 게임 켜기» 바로가기로 켜 주세요.")
        self.단축키걸기(self.단축키)
        마지막 = {"하트": 0.0, "정리": 0.0}
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
            try:
                self.누름.get(timeout=0.5)
                while not self.누름.empty():   # 길게 눌러 여러 번 들어온 것은 한 번으로
                    self.누름.get_nowait()
                self.찍기()
            except queue.Empty:
                pass
            except Exception as 탈:  # 한 번 탈이 나도 프로그램은 계속
                self.로그(f"⚠ 찍기 탈: {탈}")


def 관리자인가() -> bool:
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


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
            print(f"✅ 연결됨 — 단축키 {r.get('settings', {}).get('단축키')} · 게임 {len(r.get('games') or [])}개. 대시보드 🕹️ 게임 스샷 막대가 «집 PC 연결됨» 으로 바뀝니다.")
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
