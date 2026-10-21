"""맨 앞 창 찍기 (윈도 전용) — 창 안쪽(client) 영역만, 창 제목과 함께.

화면 배율(125%·150%)에서도 실제 픽셀 좌표를 받도록 처음에 DPI 인식을 켠다.
게임 창이 관리자 권한이어도 화면을 찍는 것은 된다(입력과 달리 윈도가 막지 않는다).
"""

from __future__ import annotations

import ctypes

from PIL import Image


def 고해상도_맞추기() -> None:
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def 맨앞창찍기() -> tuple[Image.Image, str] | None:
    """맨 앞 창의 안쪽을 찍는다. 이 프로그램 자신의 창이거나 너무 작으면 None."""
    import mss  # noqa: 윈도 전용
    import win32gui
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd or hwnd == ctypes.windll.kernel32.GetConsoleWindow():
        return None
    제목 = win32gui.GetWindowText(hwnd)
    _, _, w, h = win32gui.GetClientRect(hwnd)
    if w < 200 or h < 150:
        return None
    x, y = win32gui.ClientToScreen(hwnd, (0, 0))
    with mss.mss() as sct:
        raw = sct.grab({"left": x, "top": y, "width": w, "height": h})
    return Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX"), 제목
