"""집 PC 클로드용 — 지금 떠 있는 창 제목과 그 실행 파일 경로를 보여 준다(윈도).

게임(또는 런처)을 한 번 직접 켜 둔 뒤:
  python tools/게임찾기.py              보이는 창 전부
  python tools/게임찾기.py Aniimo 도깨비  이 말이 들어간 창만
→ «창제목» 과 «실행 파일» 을 프로필에 올릴 때 쓴다(tools/프로필올리기.py).
"""

from __future__ import annotations

import ctypes
import sys
from ctypes import wintypes

for _흐름 in (sys.stdout, sys.stderr):
    try:
        _흐름.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def 실행파일(pid: int) -> str:
    k32 = ctypes.windll.kernel32
    h = k32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
    if not h:
        return "(권한 없음 — 게임이 관리자 권한이면 명령 창도 관리자로)"
    try:
        버퍼 = ctypes.create_unicode_buffer(1024)
        크기 = wintypes.DWORD(1024)
        if k32.QueryFullProcessImageNameW(h, 0, 버퍼, ctypes.byref(크기)):
            return 버퍼.value
        return ""
    finally:
        k32.CloseHandle(h)


def main() -> None:
    if sys.platform != "win32":
        sys.exit("윈도에서만 됩니다.")
    import win32gui
    import win32process
    거름 = [w.lower() for w in sys.argv[1:]]
    본 = set()

    def 훑기(hwnd, _):
        if not win32gui.IsWindowVisible(hwnd):
            return
        제목 = win32gui.GetWindowText(hwnd)
        if not 제목 or (거름 and not any(w in 제목.lower() for w in 거름)):
            return
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        _, _, w, h = win32gui.GetClientRect(hwnd)
        if (제목, pid) in 본:
            return
        본.add((제목, pid))
        print(f"창제목: {제목}\n  크기: {w}x{h}  ·  실행 파일: {실행파일(pid)}\n")

    win32gui.EnumWindows(훑기, None)
    if not 본:
        print("맞는 창이 없습니다. 게임을 먼저 켜 두세요.")


if __name__ == "__main__":
    main()
