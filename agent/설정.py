"""집 PC 프로그램 설정 — config.yaml(있으면) + 환경변수.

비밀값(토큰)은 파일에 적지 않는다. 환경변수 이름만 config.yaml 에 적고 값은 환경변수로 둔다.
  MAIM_SERVER_URL         maim 서버 주소 (예: https://…run.app 또는 시험용 http://127.0.0.1:8793)
  MAIM_GAME_AGENT_TOKEN   서버의 GAME_AGENT_TOKEN 과 같은 값
  MAIM_GAME_ROOT          원본 저장 루트 (예: G:\\maim-game, C 드라이브 아닌 곳 권장)
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass, field
from pathlib import Path

import yaml

AGENT_DIR = Path(__file__).resolve().parent
PROFILE_DIR = AGENT_DIR / "profiles"
버전 = "0.2.0"


@dataclass
class 설정:
    서버주소: str
    토큰: str
    저장루트: Path
    원본보관일: int = 30
    폴링초: float = 5.0
    화면보기초: float = 2.5
    가상: bool = False
    빠르게: bool = False
    # 시간 기준 (GAME_PLAN 4·6번). 가상 게임 «빠르게» 면 짧게 줄인다.
    막힘판단초: float | None = None      # 비우면 프로필 막힘판단분
    이동간격초: float = 25.0              # 이동 중이면 이 간격으로 중간 지점
    예비초: float = 90.0                  # 변화 없어도 이 간격으로 원본만
    보스한도초: float = 180.0             # 보스전 이 안에 못 잡으면 직접 플레이 대기
    기타: dict = field(default_factory=dict)


def 읽기(가상: bool = False, 빠르게: bool = False) -> 설정:
    파일 = AGENT_DIR / "config.yaml"
    값: dict = {}
    if 파일.exists():
        with 파일.open(encoding="utf-8") as f:
            값 = yaml.safe_load(f) or {}

    def 환경(칸: str, 기본이름: str) -> str:
        이름 = 값.get(칸) or 기본이름
        return (os.environ.get(이름, "") or 윈도사용자환경(이름)).strip()

    서버 = 환경("서버주소_환경변수", "MAIM_SERVER_URL") or "http://127.0.0.1:8793"
    토큰 = 환경("토큰_환경변수", "MAIM_GAME_AGENT_TOKEN")
    루트 = 환경("저장루트_환경변수", "MAIM_GAME_ROOT") or str(AGENT_DIR / "시험결과")
    s = 설정(
        서버주소=서버.rstrip("/"), 토큰=토큰, 저장루트=Path(루트),
        원본보관일=int(값.get("원본보관일", 30)), 폴링초=float(값.get("폴링초", 5)),
        화면보기초=float(값.get("화면보기초", 2.5)), 가상=가상, 빠르게=빠르게, 기타=값,
    )
    if 빠르게:
        s.폴링초, s.화면보기초 = 2.0, 1.0
        s.막힘판단초, s.이동간격초, s.예비초, s.보스한도초 = 15.0, 5.0, 20.0, 30.0
    return s


def 윈도사용자환경(이름: str) -> str:
    """방금 준비 스크립트로 넣은 환경변수는 이미 열려 있던 창(클로드 코드 포함)에는 안 보인다.
    그래서 윈도면 레지스트리(HKCU\\Environment)에서 직접 읽는다."""
    if sys.platform != "win32":
        return ""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            return str(winreg.QueryValueEx(k, 이름)[0])
    except OSError:
        return ""


def 프로필파일(game_id: str) -> dict | None:
    p = PROFILE_DIR / f"{game_id}.yaml"
    if not p.exists():
        return None
    with p.open(encoding="utf-8") as f:
        return yaml.safe_load(f)
