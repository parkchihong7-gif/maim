"""집 PC 프로그램 설정 — config.yaml(있으면) + 환경변수.

비밀값(토큰)은 파일에 적지 않는다. 환경변수 이름만 config.yaml 에 적고 값은 환경변수로 둔다.
  MAIM_SERVER_URL         maim 서버 주소 (예: https://…run.app 또는 시험용 http://127.0.0.1:8793)
  MAIM_GAME_AGENT_TOKEN   서버의 집 PC 연결 토큰과 같은 값
  MAIM_GAME_ROOT          원본 저장 루트 (예: G:\\maim-game, C 드라이브 아닌 곳 권장)
단축키·원본보관일은 서버(대시보드 [설정])에서 받아 온다.
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

AGENT_DIR = Path(__file__).resolve().parent
버전 = "0.3.0"


@dataclass
class 설정:
    서버주소: str
    토큰: str
    저장루트: Path
    원본보관일: int = 30


def 읽기() -> 설정:
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
    return 설정(서버주소=서버.rstrip("/"), 토큰=토큰, 저장루트=Path(루트), 원본보관일=int(값.get("원본보관일", 30)))


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
