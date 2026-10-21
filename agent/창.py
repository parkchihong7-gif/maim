"""게임 창 찾기 (윈도 전용) — 창 제목 부분 일치, 창 안쪽(client) 영역, 앞으로 가져오기.

화면 배율(125%·150%)에서도 실제 픽셀 좌표를 받도록 처음에 DPI 인식을 켠다.
"""

from __future__ import annotations

import ctypes


def 고해상도_맞추기() -> None:
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


class 게임창:
    def __init__(self, 제목: str):
        import win32gui  # noqa: 윈도 전용
        self.win32gui = win32gui
        self.제목 = 제목
        self.hwnd: int | None = None

    def 찾기(self) -> bool:
        찾은것: list[int] = []

        def 훑기(hwnd, _):
            if self.win32gui.IsWindowVisible(hwnd) and self.제목.lower() in self.win32gui.GetWindowText(hwnd).lower():
                찾은것.append(hwnd)

        self.win32gui.EnumWindows(훑기, None)
        self.hwnd = 찾은것[0] if 찾은것 else None
        return self.hwnd is not None

    def 있나(self) -> bool:
        return bool(self.hwnd) and self.win32gui.IsWindow(self.hwnd) or self.찾기()

    def 안쪽(self) -> dict | None:
        if not self.있나():
            return None
        _, _, w, h = self.win32gui.GetClientRect(self.hwnd)
        x, y = self.win32gui.ClientToScreen(self.hwnd, (0, 0))
        return {"left": x, "top": y, "width": w, "height": h}

    def 앞으로(self) -> None:
        import win32con  # noqa
        if not self.있나():
            return
        if self.win32gui.IsIconic(self.hwnd):
            self.win32gui.ShowWindow(self.hwnd, win32con.SW_RESTORE)
        try:
            self.win32gui.SetForegroundWindow(self.hwnd)
        except Exception:
            pass
