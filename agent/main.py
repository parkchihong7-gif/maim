"""🕹️ 집 PC 게임 프로그램 — 시작점 (GAME_PLAN 8·15번).

  python main.py                 진짜 게임 (윈도, 집 PC). 한 번 켜 두면 대시보드에서 시작·정지한다.
  python main.py --가상          가상 게임으로 전체 흐름 시험 (회사 PC 등 게임 없는 곳)
  python main.py --가상 --빠르게  시간 기준을 줄여 몇 분 안에 막힘·보스 판단까지 본다
  python main.py --가상 --금지    가상 게임에 «상점» 화면을 끼워 즉시 정지를 시험한다
  python main.py --시간 300       300초 뒤 스스로 끝낸다(시험용)

하는 일: 5초마다 서버에 하트비트 → 명령(start·stop·capture·sync_list)을 받는다 →
  게임을 켜고 2~3초마다 화면을 본다 → 바뀐 순간만 서버에 판단을 묻는다 → 남길 사진만 올린다 →
  (감독 모드) 프로필 버튼만 누른다 → 막히면 «직접 플레이 대기» 로 넘기고 다음 퀘스트.

지킬 것: 기록 모드는 입력 0건(누르기.py 를 불러오지도 않는다). 금지 화면이면 즉시 정지.
보안 프로그램이 캡처·입력을 막으면 우회하지 않는다. 아이디·비밀번호는 다루지 않는다.
"""

from __future__ import annotations

import argparse
import datetime as dt
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
# 윈도 명령 창(cp949)에서 이모지·한글 로그가 깨지거나 멈추지 않게.
for _흐름 in (sys.stdout, sys.stderr):
    try:
        _흐름.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import 설정 as 설정모듈  # noqa: E402
from 변화 import 변화감지  # noqa: E402
from 보기 import 검은화면인가  # noqa: E402
from 안전 import 단축키, 안전지기  # noqa: E402
from 올리기 import 서버, 서버탈  # noqa: E402
from 저장 import 저장소  # noqa: E402

퀘스트당최대 = {"이동중": 6, "대화": 3}


class 에이전트:
    def __init__(self, s: 설정모듈.설정, 금지: bool = False):
        self.s = s
        self.저장 = 저장소(s.저장루트)
        self.로그 = self.저장.로그
        self.서버 = 서버(s.서버주소, s.토큰, self.로그)
        self.단축키 = 단축키(self.로그)
        self.금지 = 금지
        self.상태 = "대기"
        self.게임: str | None = None
        self.프로필: dict | None = None
        self.화면 = None
        self.창 = None
        self.가상게임 = None
        self.누르개 = None
        self.감지: 변화감지 | None = None
        self.안전: 안전지기 | None = None
        self.퀘스트: dict = {}
        self.남은분: float | None = None
        self.멈춘까닭 = ""
        self.마지막장면: str | None = None
        self.사진수 = 0
        self.장수: dict[tuple, int] = {}
        self.지도찍은: set[int] = set()
        self.검은수 = 0
        self.목록버퍼: list = []
        self.목록마지막 = 0.0
        self.목록대기 = False
        self.시각 = {"폴링": 0.0, "보기": 0.0, "예비": 0.0, "이동사진": 0.0, "정리": 0.0, "탈": 0.0}

    # ── 서버 ─────────────────────────────────────────────
    def 감독(self) -> bool:
        return bool(self.프로필) and self.프로필.get("모드") == "감독"

    def 자세히(self) -> dict:
        return {
            "모드": self.프로필.get("모드") if self.프로필 else None, "가상": self.s.가상, "사진수": self.사진수,
            "원본수": self.저장.원본수(self.게임) if self.게임 else 0, "마지막장면": self.마지막장면,
            "까닭": self.멈춘까닭 or None, "단축키": self.단축키.켜짐, "목록대기": self.목록대기,
            "누른수": len(self.누르개.누른기록) if self.누르개 else 0,
        }

    def 하트비트(self) -> None:
        try:
            hb = self.서버.하트비트(설정모듈.버전, self.게임, self.상태, self.자세히())
        except 서버탈 as 탈:
            if time.monotonic() - self.시각["탈"] > 60:
                self.로그(f"⚠ 서버 연결 안 됨: {탈}")
                self.시각["탈"] = time.monotonic()
            return
        self.남은분 = hb.get("남은분")
        설정값 = hb.get("settings") or {}
        if 설정값.get("판단간격초") and not self.s.빠르게:
            self.s.화면보기초 = float(설정값["판단간격초"])
        if 설정값.get("원본보관일"):
            self.s.원본보관일 = int(설정값["원본보관일"])
        if hb.get("quest"):
            self.퀘스트.update({"빠진장면": hb["quest"].get("빠진장면") or []})
        if hb.get("command"):
            self.명령(hb["command"])

    def 명령(self, c: dict) -> None:
        m = c.get("명령")
        self.로그(f"📨 명령: {m} {c.get('까닭', '')}")
        if m == "start":
            self.시작(c)
        elif m == "stop":
            self.멈추기(c.get("까닭") or "정지 명령", "대기")
        elif m == "capture":
            self.수동캡처(목적=c.get("목적"), 항목id=c.get("항목id"))
        elif m == "sync_list":
            self.목록읽기(c.get("game") or self.게임)

    # ── 시작·멈춤 ────────────────────────────────────────
    def 프로필받기(self, 게임: str, c: dict) -> dict:
        if c.get("profile"):
            return c["profile"]
        try:
            return self.서버.프로필(게임)
        except 서버탈:
            p = 설정모듈.프로필파일(게임)
            if not p:
                raise
            return p

    def 시작(self, c: dict) -> None:
        self.게임 = c.get("game")
        self.프로필 = self.프로필받기(self.게임, c)
        self.상태 = "켜는중"
        self.멈춘까닭 = ""
        self.퀘스트, self.장수, self.지도찍은 = {}, {}, set()
        self.로그(f"▶ {self.프로필.get('이름')} 시작 — {self.프로필.get('모드')} 모드{' (가상 게임)' if self.s.가상 else ''}")
        self.하트비트알림()
        try:
            if self.s.가상:
                from 가상게임 import 가상게임
                self.가상게임 = 가상게임(self.프로필, 간격초=3.0 if self.s.빠르게 else 6.0, 금지=self.금지, 로그=self.로그)
                self.가상게임.켜기()
                self.화면 = self.가상게임
            else:
                from 보기 import 진짜화면
                from 창 import 게임창, 고해상도_맞추기
                from 실행 import 켜기, 켜기실패  # noqa
                고해상도_맞추기()
                self.창 = 게임창(self.프로필.get("창제목", ""))
                만들기 = None
                if self.감독():
                    def 만들기(p, 창):
                        from 누르기 import 누르개
                        return 누르개(p, 창, 로그=self.로그)
                켜기(self.프로필, self.창, self.로그, 만들기)
                self.화면 = 진짜화면(self.창)
        except Exception as 탈:
            self.멈추기(f"게임을 켜지 못했습니다: {탈}", "확인필요")
            return
        if self.감독():
            from 누르기 import 누르개   # 감독 모드에서만 불러온다
            self.누르개 = 누르개(self.프로필, self.창, 가상=self.가상게임, 로그=self.로그)
        else:
            self.누르개 = None
        self.감지 = 변화감지(self.프로필.get("영역") or {})
        막힘초 = self.s.막힘판단초 or float(self.프로필.get("막힘판단분", 5)) * 60
        self.안전 = 안전지기(막힘초, self.s.보스한도초)
        self.상태 = "로딩"

    def 하트비트알림(self) -> None:
        self.시각["폴링"] = 0.0

    def 멈추기(self, 까닭: str, 상태: str) -> None:
        if self.상태 in ("대기", "확인필요", "로그인필요") and 상태 == "대기" and not self.화면:
            return
        self.로그(f"⏹ 멈춤 — {까닭}")
        self.멈춘까닭 = 까닭
        self.서버.이벤트(self.게임, "정지" if 상태 == "대기" else 상태, {"까닭": 까닭})
        self.상태 = 상태
        self.하트비트알림()
        # 게임은 끄지 않는다. 사장님이 이어서 직접 할 수 있다.

    # ── 화면 보기 ────────────────────────────────────────
    def 찍기(self):
        return self.화면.찍기() if self.화면 else None

    def 한번보기(self) -> None:
        img = self.찍기()
        if img is None:
            self.멈추기("게임 창이 사라졌습니다", "확인필요")
            return
        if 검은화면인가(img):
            self.검은수 += 1
            if self.검은수 >= 5:
                self.멈추기("캡처가 계속 검은 화면입니다 — 게임 보안 프로그램이 막는 것일 수 있습니다. 우회하지 않습니다. 기록 모드로 바꾸거나 확인해 주세요.", "확인필요")
            return
        self.검은수 = 0
        지금 = time.monotonic()
        바뀜, 어디 = self.감지.보기(img)
        이동때 = self.마지막장면 == "이동중" and 지금 - self.시각["이동사진"] >= self.s.이동간격초
        if 바뀜 or 이동때:
            상황 = {"가상힌트": self.가상게임.힌트() if self.가상게임 else None}
            try:
                판단 = self.서버.판단(self.게임, img, 상황)
            except 서버탈 as 탈:
                self.로그(f"  판단 실패: {탈}")
                return
            self.판단처리(img, 판단, 바뀜)
        elif 지금 - self.시각["예비"] >= self.s.예비초:
            self.저장.원본(self.게임, img, "예비")
            self.시각["예비"] = 지금
        if self.상태 == "진행중":
            막힘 = self.안전.시간봄(self.감지.같은화면초())
            if 막힘:
                self.막힘처리(막힘)

    def 남길까(self, img, 판단: dict) -> bool:
        if not 판단.get("남김") or self.감지.비슷한가(img):
            return False
        장면 = 판단.get("장면")
        if 장면 in 퀘스트당최대:
            키 = (판단.get("quest_id"), 장면)
            if self.장수.get(키, 0) >= 퀘스트당최대[장면]:
                return False
            self.장수[키] = self.장수.get(키, 0) + 1
        return True

    def 판단처리(self, img, 판단: dict, 바뀜: bool) -> None:
        장면 = 판단.get("장면", "기타")
        self.마지막장면 = 장면
        if self.상태 == "로딩" and 장면 != "로딩":
            self.상태 = "진행중"
            self.서버.이벤트(self.게임, "진행시작", {})
        qid = 판단.get("quest_id")
        if qid and qid != self.퀘스트.get("id"):
            self.퀘스트 = {"id": qid, "name": 판단.get("quest_name")}
            self.안전.새퀘스트()
            self.로그(f"📜 퀘스트: {판단.get('quest_name')}")
        self.퀘스트["빠진장면"] = 판단.get("빠진장면") or []
        self.저장.원본(self.게임, img, 장면, 판단)
        if self.남길까(img, 판단):
            try:
                self.서버.사진(self.게임, img, 장면, 판단.get("설명", ""), "auto", qid, dt.datetime.now().astimezone().isoformat())
                self.감지.남겼음(img)
                self.사진수 += 1
                if 장면 == "이동중":
                    self.시각["이동사진"] = time.monotonic()
                self.로그(f"  📸 {장면} — {판단.get('설명', '')}")
            except 서버탈 as 탈:
                self.로그(f"  사진 올리기 실패: {탈}")

        if 판단.get("멈춤상태") == "로그인필요":
            self.멈추기(판단.get("막음") or "로그인 화면", "로그인필요")
            return
        행동 = 판단.get("행동", "대기")
        if 행동 == "정지":
            self.멈추기(판단.get("막음") or 판단.get("이유") or "AI 판단: 정지", "확인필요")
            return
        막힘 = self.안전.판단봄(판단)
        if 막힘:
            self.막힘처리(막힘)
            return
        if 행동 == "직접플레이대기":
            # 서버가 이미 퀘스트를 대기 목록에 넣었다. 다음 퀘스트로만 넘어간다.
            self.로그(f"  🙋 직접 플레이 대기 — {판단.get('이유', '')}")
            self.다음퀘스트로(사람=True)
            return
        if not self.감독():
            return   # 기록 모드: 입력 0건
        if 행동 == "다음퀘스트":
            self.다음퀘스트로()
        elif self.누르개.있나(행동):
            막힘 = self.안전.행동봄(행동, 바뀜)
            if 막힘:
                self.막힘처리(막힘)
                return
            self.누르개.누르기(행동)
        # 체크리스트에 지도가 비었으면 퀘스트 초반에 한 번 지도를 열어 찍는다(15-3).
        if qid and qid not in self.지도찍은 and "지도" in self.퀘스트.get("빠진장면", []) \
                and 장면 in ("퀘스트받음", "이동중") and self.누르개.있나("지도열기"):
            self.지도찍기(qid)

    def 지도찍기(self, qid: int) -> None:
        self.지도찍은.add(qid)
        if not self.누르개.누르기("지도열기"):
            return
        time.sleep(0.6)
        img = self.찍기()
        if img is not None:
            try:
                판단 = self.서버.판단(self.게임, img, {"가상힌트": self.가상게임.힌트() if self.가상게임 else None})
                self.저장.원본(self.게임, img, "지도", 판단)
                self.서버.사진(self.게임, img, "지도", 판단.get("설명") or "지도 — 목적지 표시", "auto", qid)
                self.감지.남겼음(img)
                self.사진수 += 1
                self.로그("  🗺️ 지도 찍음")
            except 서버탈 as 탈:
                self.로그(f"  지도 찍기 실패: {탈}")
        self.누르개.누르기("창닫기")

    def 막힘처리(self, 이유: str) -> None:
        self.로그(f"  🙋 막힘 — {이유} → 직접 플레이 대기, 다음 퀘스트로")
        self.서버.이벤트(self.게임, "막힘", {"quest_id": self.퀘스트.get("id"), "이유": 이유})
        self.다음퀘스트로(사람=not self.감독())

    def 다음퀘스트로(self, 사람: bool = False) -> None:
        self.퀘스트 = {}
        self.감지.처음부터()
        self.안전.새퀘스트()
        if self.감독() and self.누르개:
            for 버튼 in ("임무창열기", "창닫기", "자동진행"):
                if self.누르개.있나(버튼):
                    self.누르개.누르기(버튼)
                    time.sleep(0.3)
        elif 사람 and self.가상게임:
            self.가상게임.사람이넘김()   # 가상 게임: 사장님이 다음 퀘스트로 넘어간 것처럼

    # ── 수동 캡처·목록 ───────────────────────────────────
    def 수동캡처(self, 목적: str | None = None, 항목id: int | None = None) -> None:
        img = self.찍기()
        if img is None:
            self.로그("  (찍을 게임 화면이 없습니다 — 게임을 먼저 실행해 주세요)")
            return
        장면 = "목록" if 목적 == "목록확인" else (self.마지막장면 or "기타")
        self.저장.원본(self.게임, img, f"F9_{장면}")
        try:
            self.서버.사진(self.게임, img, 장면, "직접 찍은 사진(F9)" if 목적 != "목록확인" else "목록 확인용 캡처",
                         "f9", self.퀘스트.get("id"), 목적=목적, 항목id=항목id)
            self.감지.남겼음(img)
            self.사진수 += 1
            self.로그(f"  📸 수동 캡처 ({목적 or 'F9'})")
        except 서버탈 as 탈:
            self.로그(f"  수동 캡처 실패: {탈}")

    def 목록읽기(self, 게임: str | None) -> None:
        if not 게임:
            return
        if self.감독() and self.상태 in ("진행중", "로딩") and self.누르개 and self.누르개.있나("임무창열기"):
            self.로그("📋 게임 목록 읽기 (감독 모드: 목록 창 열기)")
            이전 = self.상태
            self.상태 = "목록읽기"
            self.누르개.누르기("임무창열기")
            time.sleep(0.6)
            사진들 = [self.찍기()]
            for _ in range(4):
                if not self.누르개.있나("목록다음"):
                    break
                self.누르개.누르기("목록다음")
                time.sleep(0.5)
                사진들.append(self.찍기())
            self.누르개.누르기("창닫기")
            self.상태 = 이전
            self.목록보내기(게임, [p for p in 사진들 if p is not None])
            return
        # 기록 모드(또는 게임이 안 켜졌을 때): 입력하지 않는다. 사장님이 목록 창을 열고 F10.
        self.목록대기 = True
        self.게임 = self.게임 or 게임
        self.로그("📋 게임에서 퀘스트 목록 창을 열어 두고 F10 을 눌러 주세요(여러 장이면 여러 번).")
        if self.s.가상:
            # 가상 게임: 사장님이 목록을 열고 F10 을 누른 것처럼 흉내 낸다.
            from 가상게임 import 가상게임
            if not self.가상게임:
                self.프로필 = self.프로필 or self.프로필받기(게임, {})
                self.가상게임 = 가상게임(self.프로필, 로그=self.로그)
                self.가상게임.켜기()
                self.가상게임.켠때 -= 10
                self.화면 = self.가상게임
            self.가상게임.덮개 = "목록"
            self.단축키.넣기("F10")

    def F10(self) -> None:
        img = self.찍기()
        if img is None:
            self.로그("  (찍을 게임 화면이 없습니다)")
            return
        self.목록버퍼.append(img)
        self.목록마지막 = time.monotonic()
        self.로그(f"  📋 목록 찍음 ({len(self.목록버퍼)}장) — 더 있으면 넘겨서 F10, 없으면 4초 뒤 보냅니다")

    def 목록보내기(self, 게임: str, 사진들: list) -> None:
        if not 사진들:
            return
        try:
            r = self.서버.목록(게임, 사진들[:5], self.가상게임.목록힌트() if self.가상게임 else None)
            self.로그(f"  📋 목록 {r.get('rows')}줄 읽음")
        except 서버탈 as 탈:
            self.로그(f"  목록 보내기 실패: {탈}")

    # ── 돌기 ─────────────────────────────────────────────
    def 돌기(self, 끝초: float | None = None) -> None:
        self.로그(f"🕹️ 집 PC 게임 프로그램 {설정모듈.버전} — 서버 {self.s.서버주소}{' · 가상 게임' if self.s.가상 else ''}")
        self.로그(f"   원본 저장: {self.s.저장루트}  ·  F9 수동 캡처 · F10 목록 찍기 · F12 즉시 정지")
        if not self.s.토큰:
            self.로그("⚠ MAIM_GAME_AGENT_TOKEN 이 비어 있습니다. 서버의 GAME_AGENT_TOKEN 과 같은 값을 넣어 주세요.")
        시작 = time.monotonic()
        while 끝초 is None or time.monotonic() - 시작 < 끝초:
            지금 = time.monotonic()
            if 지금 - self.시각["정리"] > 6 * 3600:
                n = self.저장.오래된원본정리(self.s.원본보관일)
                if n:
                    self.로그(f"🧹 오래된 원본 폴더 {n}개 정리")
                self.시각["정리"] = 지금
            if 지금 - self.시각["폴링"] >= self.s.폴링초:
                self.시각["폴링"] = 지금
                self.하트비트()
            for 키 in self.단축키.꺼내기():
                if 키 == "F12":
                    self.멈추기("F12 즉시 정지", "대기")
                elif 키 == "F9":
                    self.수동캡처()
                elif 키 == "F10":
                    self.F10()
            if self.목록버퍼 and time.monotonic() - self.목록마지막 > 4:
                사진들, self.목록버퍼 = self.목록버퍼, []
                self.목록대기 = False
                if self.가상게임 and self.가상게임.덮개 == "목록":
                    self.가상게임.덮개 = None
                self.목록보내기(self.게임, 사진들)
            if self.상태 in ("로딩", "진행중") and 지금 - self.시각["보기"] >= self.s.화면보기초:
                self.시각["보기"] = 지금
                try:
                    self.한번보기()
                except Exception as 탈:  # 한 번 탈이 나도 프로그램은 계속
                    self.로그(f"  ⚠ 화면 보기 탈: {탈}")
            time.sleep(0.2)
        self.로그("⏹ 시험 시간이 끝나 프로그램을 마칩니다.")
        if self.상태 in ("로딩", "진행중"):
            self.멈추기("프로그램 종료", "대기")
            self.하트비트()


def main() -> None:
    ap = argparse.ArgumentParser(description="maim 집 PC 게임 프로그램")
    ap.add_argument("--가상", action="store_true", help="진짜 게임 대신 가상 게임으로 시험")
    ap.add_argument("--빠르게", action="store_true", help="시간 기준을 줄여 빨리 시험(가상 게임)")
    ap.add_argument("--금지", action="store_true", help="가상 게임에 상점 화면을 끼워 즉시 정지 시험")
    ap.add_argument("--시간", type=float, default=None, help="이 초가 지나면 끝냄(시험용)")
    ap.add_argument("--연결시험", action="store_true", help="서버에 한 번 신호만 보내 보고 끝냄")
    a = ap.parse_args()
    if a.연결시험:
        s = 설정모듈.읽기()
        print(f"서버: {s.서버주소}")
        print(f"토큰: {'있음' if s.토큰 else '없음 ← 집PC-준비.ps1 을 먼저'} · 저장 루트: {s.저장루트}")
        try:
            서버(s.서버주소, s.토큰).하트비트(설정모듈.버전, None, "대기", {"연결시험": True})
            print("✅ 연결됨 — 대시보드 🕹️ 게임 플레이 상태 막대가 몇 초 안에 «준비됨» 으로 바뀝니다(20초 뒤엔 다시 «끊김»).")
            sys.exit(0)
        except 서버탈 as 탈:
            print(f"❌ 연결 안 됨 — {탈}")
            sys.exit(1)
    if not a.가상 and sys.platform != "win32":
        sys.exit("진짜 게임 모드는 윈도(집 PC)에서만 됩니다. 시험은 --가상 을 붙여 주세요.")
    s = 설정모듈.읽기(가상=a.가상, 빠르게=a.빠르게)
    에이전트(s, 금지=a.금지).돌기(a.시간)


if __name__ == "__main__":
    main()
