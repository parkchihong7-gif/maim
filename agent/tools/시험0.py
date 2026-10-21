"""0단계 시험 도구 — 게임 창을 찾아 캡처가 되는지, (감독 모드면) 키 입력이 먹히는지 확인한다.

쓰는 법 (집 PC, 게임을 켜 둔 상태에서):
  python tools/시험0.py --game dokkaebi              캡처 시험 (3장 + 영역 잘라내기)
  python tools/시험0.py --game dokkaebi --input-test 캡처 시험 + ESC 1회 입력 시험 (감독 모드만)
  python tools/시험0.py --game aniimo --coords       마우스 위치를 창 안쪽 비율로 보여 준다 (프로필 채우기용)
  python tools/시험0.py --game dokkaebi --launch     게임 켜기 시험 → 창이 뜨면 이어서 캡처 시험

지킬 것:
  - 입력 시험은 프로필 버튼 '창닫기'(ESC) 한 번뿐이다. 다른 키·클릭은 보내지 않는다.
  - 기록 모드 게임은 입력 시험을 거부하고, 입력 모듈을 불러오지도 않는다.
  - 켜기 시험은 프로필 '실행.파일'만 실행한다. 아이디·비밀번호는 다루지 않는다(로그인은 공식 런처의 자동 로그인).
    런처 [게임 시작] 클릭은 감독 모드 + 프로필에 좌표가 있을 때만, '예' 확인 후 1회.
  - 게임 보안 프로그램이 캡처나 입력을 막으면 우회하지 않는다. 결과만 적고 기록 모드로 바꾼다.
"""

from __future__ import annotations

import argparse
import ctypes
import datetime as dt
import json
import os
import shlex
import subprocess
import sys
import time
from pathlib import Path

import mss
import win32con
import win32gui
import yaml
from PIL import Image, ImageChops, ImageStat

AGENT_DIR = Path(__file__).resolve().parent.parent
PROFILE_DIR = AGENT_DIR / "profiles"

검은화면_밝기 = 8      # 평균 밝기(0~255)가 이보다 낮고
검은화면_흔들림 = 4    # 밝기 표준편차도 이보다 낮으면 검은 화면으로 본다
같은사진_차이 = 1.0    # 두 사진 평균 차이가 이보다 작으면 '멈춘 화면'으로 본다


def 고해상도_맞추기() -> None:
    """화면 배율(125%·150%)에서도 실제 픽셀 좌표를 받도록 한다."""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def 프로필_읽기(game_id: str) -> dict:
    path = PROFILE_DIR / f"{game_id}.yaml"
    if not path.exists():
        sys.exit(f"[실패] 프로필이 없습니다: {path}")
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def 창_찾기(제목: str) -> list[tuple[int, str]]:
    찾은것: list[tuple[int, str]] = []

    def 훑기(hwnd, _):
        if win32gui.IsWindowVisible(hwnd):
            t = win32gui.GetWindowText(hwnd)
            if 제목.lower() in t.lower():
                찾은것.append((hwnd, t))

    win32gui.EnumWindows(훑기, None)
    return 찾은것


def 창_안쪽(hwnd: int) -> dict:
    """창 테두리·제목줄을 뺀 안쪽 영역의 화면 좌표."""
    _, _, w, h = win32gui.GetClientRect(hwnd)
    x, y = win32gui.ClientToScreen(hwnd, (0, 0))
    return {"left": x, "top": y, "width": w, "height": h}


def 앞으로(hwnd: int) -> None:
    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    try:
        win32gui.SetForegroundWindow(hwnd)
    except Exception:
        print("  (창을 앞으로 가져오지 못했습니다. 게임 창을 한 번 클릭해 주세요.)")


def 찍기(sct, 영역: dict) -> Image.Image:
    raw = sct.grab(영역)
    return Image.frombytes("RGB", raw.size, raw.bgra, "raw", "BGRX")


def 검은화면인가(img: Image.Image) -> tuple[bool, float, float]:
    stat = ImageStat.Stat(img.convert("L"))
    밝기, 흔들림 = stat.mean[0], stat.stddev[0]
    return (밝기 < 검은화면_밝기 and 흔들림 < 검은화면_흔들림), 밝기, 흔들림


def 평균차이(a: Image.Image, b: Image.Image) -> float:
    diff = ImageChops.difference(a.convert("L"), b.convert("L"))
    return ImageStat.Stat(diff).mean[0]


def 영역_자르기(img: Image.Image, 비율: dict) -> Image.Image:
    W, H = img.size
    box = (
        round(비율["x"] * W),
        round(비율["y"] * H),
        round((비율["x"] + 비율["w"]) * W),
        round((비율["y"] + 비율["h"]) * H),
    )
    return img.crop(box)


def 저장루트(인자: str | None) -> Path:
    if 인자:
        return Path(인자)
    if os.environ.get("MAIM_GAME_ROOT"):
        return Path(os.environ["MAIM_GAME_ROOT"])
    return AGENT_DIR / "시험결과"


def 캡처_시험(hwnd: int, 프로필: dict, 폴더: Path) -> dict:
    결과: dict = {"사진": []}
    with mss.mss() as sct:
        사진들 = []
        for i in range(3):
            영역 = 창_안쪽(hwnd)
            img = 찍기(sct, 영역)
            p = 폴더 / f"shot{i + 1}.png"
            img.save(p)
            검음, 밝기, 흔들림 = 검은화면인가(img)
            결과["사진"].append(
                {"파일": p.name, "크기": list(img.size), "평균밝기": round(밝기, 1),
                 "흔들림": round(흔들림, 1), "검은화면": 검음}
            )
            print(f"  {p.name}: {img.size[0]}x{img.size[1]}  밝기 {밝기:.1f}  "
                  f"흔들림 {흔들림:.1f}  {'← 검은 화면!' if 검음 else 'OK'}")
            사진들.append(img)
            time.sleep(2)

    차이 = [round(평균차이(사진들[i], 사진들[i + 1]), 2) for i in range(2)]
    결과["연속차이"] = 차이
    결과["멈춘화면의심"] = all(d < 같은사진_차이 for d in 차이)

    for 이름, 비율 in (프로필.get("영역") or {}).items():
        영역_자르기(사진들[0], 비율).save(폴더 / f"영역_{이름}.png")
    print(f"  영역 잘라낸 사진: {', '.join((프로필.get('영역') or {}).keys())} → 맞는 곳인지 눈으로 확인")

    결과["캡처"] = not any(s["검은화면"] for s in 결과["사진"])
    return 결과


def 입력_시험(hwnd: int, 프로필: dict, 폴더: Path) -> dict:
    if 프로필.get("모드") != "감독":
        print("[건너뜀] 기록 모드 게임은 입력 시험을 하지 않습니다(입력 0건 원칙).")
        return {"입력": None, "이유": "기록 모드"}

    버튼 = (프로필.get("버튼") or {}).get("창닫기") or {}
    키 = str(버튼.get("키", "")).lower()
    if 키 != "esc":
        sys.exit("[실패] 프로필 버튼 '창닫기'가 ESC 키가 아닙니다. 입력 시험은 ESC 1회만 허용합니다.")

    print("\n입력 시험: 게임 화면에 창 하나(예: 가방·지도)를 열어 둔 상태로 준비해 주세요.")
    print("ESC 키를 딱 한 번 보냅니다. 진행하려면 '예'를 입력하세요.")
    if input("> ").strip() != "예":
        return {"입력": None, "이유": "사장님이 취소"}

    import pydirectinput  # 감독 모드 입력 시험에서만 불러온다

    앞으로(hwnd)
    for n in (3, 2, 1):
        print(f"  {n}…")
        time.sleep(1)
    with mss.mss() as sct:
        전 = 찍기(sct, 창_안쪽(hwnd))
        pydirectinput.press("esc")
        time.sleep(1.5)
        후 = 찍기(sct, 창_안쪽(hwnd))
    전.save(폴더 / "입력_전.png")
    후.save(폴더 / "입력_후.png")
    차이 = round(평균차이(전, 후), 2)
    print(f"  ESC 전후 화면 차이: {차이}")

    답 = input("열어 둔 창이 닫혔나요? (예/아니오) > ").strip()
    return {"입력": 답 == "예", "화면차이": 차이}


def 창_기다리기(제목: str, 최대초: int, 이름: str) -> tuple[int | None, float]:
    """제목이 맞는 창이 뜰 때까지 2초마다 본다. (hwnd 또는 None, 걸린 초)"""
    시작 = time.monotonic()
    while True:
        창들 = 창_찾기(제목)
        걸린 = time.monotonic() - 시작
        if 창들:
            return 창들[0][0], 걸린
        if 걸린 >= 최대초:
            return None, 걸린
        print(f"\r  {이름} 창 기다리는 중… {걸린:.0f}/{최대초}초", end="", flush=True)
        time.sleep(2)


def 켜기_시험(프로필: dict, 폴더: Path) -> tuple[int | None, dict]:
    """프로필 '실행' 대로 게임을 켜고 게임 창이 뜨는지 본다. (게임 hwnd 또는 None, 결과)"""
    실행 = 프로필.get("실행") or {}
    결과: dict = {"켜기": None}

    이미 = 창_찾기(프로필["창제목"])
    if 이미:
        print("  게임 창이 이미 떠 있습니다. 새로 켜지 않고 그 창으로 시험합니다.")
        결과.update({"켜기": True, "이미켜짐": True})
        return 이미[0][0], 결과

    파일 = str(실행.get("파일") or "").strip()
    if not 파일 or 파일.startswith("<"):
        sys.exit("[실패] 프로필 '실행.파일'이 자리표시 그대로입니다. 게임(또는 공식 런처) exe 경로를 먼저 적어 주세요.")
    if not Path(파일).exists():
        sys.exit(f"[실패] 실행 파일이 없습니다: {파일}")

    print(f"\n켜기 시험: 다음 파일을 실행합니다.\n  {파일} {실행.get('인자') or ''}")
    print("  (공식 런처의 '자동 로그인'이 켜져 있어야 합니다. 진행하려면 '예')")
    if input("> ").strip() != "예":
        결과["이유"] = "사장님이 취소"
        return None, 결과

    명령 = [파일] + shlex.split(str(실행.get("인자") or ""), posix=False)
    subprocess.Popen(명령, cwd=str(Path(파일).parent))
    결과["실행시각"] = dt.datetime.now().isoformat(timespec="seconds")

    런처제목 = str(실행.get("런처창제목") or "").strip()
    if 런처제목:
        런처, 걸린 = 창_기다리기(런처제목, 60, "런처")
        print()
        결과["런처창"] = 런처 is not None
        결과["런처뜬초"] = round(걸린, 1)
        if 런처 is None:
            print("  런처 창이 60초 안에 뜨지 않았습니다.")
        else:
            print(f"  런처 창 뜸 ({걸린:.0f}초). 화면을 저장합니다.")
            with mss.mss() as sct:
                찍기(sct, 창_안쪽(런처)).save(폴더 / "켜기_런처.png")
            런처_시작_누르기(런처, 프로필, 결과)

    대기초 = int(실행.get("창대기초") or 180)
    hwnd, 걸린 = 창_기다리기(프로필["창제목"], 대기초, "게임")
    print()
    결과["게임창뜬초"] = round(걸린, 1)
    if hwnd is None:
        print(f"  {대기초}초 안에 게임 창이 뜨지 않았습니다. (실제 운영에서는 여기서 정지 + '확인 필요')")
        결과["켜기"] = False
        return None, 결과

    print(f"  게임 창 뜸 ({걸린:.0f}초). 로딩이 끝나면 Enter 를 눌러 주세요.")
    input()
    with mss.mss() as sct:
        찍기(sct, 창_안쪽(hwnd)).save(폴더 / "켜기_게임.png")
    답 = input("로그인·본인인증 화면 없이 게임 안으로 들어갔나요? (예/아니오) > ").strip()
    결과["로그인없이입장"] = 답 == "예"
    결과["켜기"] = True
    return hwnd, 결과


def 런처_시작_누르기(런처: int, 프로필: dict, 결과: dict) -> None:
    버튼 = (프로필.get("실행") or {}).get("런처시작버튼") or {}
    if 프로필.get("모드") != "감독" or "x" not in 버튼:
        print("  런처의 [게임 시작]은 직접 눌러 주세요.")
        결과["런처클릭"] = "사장님"
        return
    print(f"  런처 [게임 시작] 위치(x {버튼['x']}, y {버튼['y']})를 한 번 누릅니다. 진행하려면 '예'")
    if input("> ").strip() != "예":
        print("  누르지 않았습니다. 직접 눌러 주세요.")
        결과["런처클릭"] = "사장님"
        return

    import pydirectinput  # 감독 모드 런처 클릭에서만 불러온다

    앞으로(런처)
    time.sleep(1)
    영역 = 창_안쪽(런처)
    x = 영역["left"] + round(버튼["x"] * 영역["width"])
    y = 영역["top"] + round(버튼["y"] * 영역["height"])
    pydirectinput.click(x, y)
    결과["런처클릭"] = "자동"


def 좌표_보기(hwnd: int) -> None:
    import win32api

    print("마우스를 게임 화면 위 버튼·영역에 올려 보세요. 창 안쪽 비율을 보여 줍니다. 끝내려면 Ctrl+C.")
    try:
        while True:
            영역 = 창_안쪽(hwnd)
            mx, my = win32api.GetCursorPos()
            rx = (mx - 영역["left"]) / max(영역["width"], 1)
            ry = (my - 영역["top"]) / max(영역["height"], 1)
            안 = 0 <= rx <= 1 and 0 <= ry <= 1
            print(f"\r  x: {rx:.3f}  y: {ry:.3f}  {'' if 안 else '(창 밖)'}        ", end="", flush=True)
            time.sleep(0.3)
    except KeyboardInterrupt:
        print()


def main() -> None:
    ap = argparse.ArgumentParser(description="maim 게임 0단계 시험")
    ap.add_argument("--game", required=True, help="프로필 id (dokkaebi, aniimo …)")
    ap.add_argument("--input-test", action="store_true", help="ESC 1회 입력 시험 (감독 모드만)")
    ap.add_argument("--coords", action="store_true", help="마우스 위치 비율 보기 (게임 창)")
    ap.add_argument("--coords-launcher", action="store_true", help="마우스 위치 비율 보기 (런처 창)")
    ap.add_argument("--launch", action="store_true", help="게임 켜기 시험 후 캡처 시험")
    ap.add_argument("--root", help="결과 저장 루트 (없으면 MAIM_GAME_ROOT)")
    args = ap.parse_args()

    고해상도_맞추기()
    프로필 = 프로필_읽기(args.game)
    print(f"게임: {프로필['이름']}  모드: {프로필['모드']}  창제목: {프로필['창제목']}")

    if args.coords_launcher:
        런처제목 = str((프로필.get("실행") or {}).get("런처창제목") or "").strip()
        if not 런처제목:
            sys.exit("[실패] 프로필 '실행.런처창제목'이 비어 있습니다.")
        런처들 = 창_찾기(런처제목)
        if not 런처들:
            sys.exit("[실패] 런처 창을 못 찾았습니다. 런처를 켜 두고 다시 해 주세요.")
        좌표_보기(런처들[0][0])
        return

    폴더 = 저장루트(args.root) / "시험0" / f"{args.game}_{dt.datetime.now():%Y%m%d_%H%M%S}"
    결과: dict = {"게임": args.game, "모드": 프로필["모드"]}

    if args.launch:
        폴더.mkdir(parents=True, exist_ok=True)
        hwnd, 켜기결과 = 켜기_시험(프로필, 폴더)
        결과["켜기시험"] = 켜기결과
        if hwnd is None:
            (폴더 / "결과.json").write_text(json.dumps(결과, ensure_ascii=False, indent=2), encoding="utf-8")
            print(f"\n켜기 시험 실패/취소 — 결과 저장: {폴더}")
            return

    창들 = 창_찾기(프로필["창제목"])
    if not 창들:
        sys.exit("[실패] 게임 창을 못 찾았습니다. 게임을 켜고 창 제목이 프로필 '창제목'과 맞는지 보세요.")
    if len(창들) > 1:
        print("  창이 여러 개입니다. 첫 번째를 씁니다:", [t for _, t in 창들])
    hwnd, 제목 = 창들[0]
    영역 = 창_안쪽(hwnd)
    print(f"  창 찾음: '{제목}'  안쪽 {영역['width']}x{영역['height']} @ ({영역['left']},{영역['top']})")

    if args.coords:
        좌표_보기(hwnd)
        return

    폴더.mkdir(parents=True, exist_ok=True)

    print("\n캡처 시험: 3초 뒤 2초 간격으로 3장 찍습니다. 게임 창이 맨 앞에 보이게 해 주세요.")
    앞으로(hwnd)
    time.sleep(3)
    결과.update({"창제목": 제목, "창안쪽": [영역["width"], 영역["height"]],
               "시각": dt.datetime.now().isoformat(timespec="seconds")})
    결과.update(캡처_시험(hwnd, 프로필, 폴더))
    if args.input_test:
        결과.update(입력_시험(hwnd, 프로필, 폴더))

    (폴더 / "결과.json").write_text(json.dumps(결과, ensure_ascii=False, indent=2), encoding="utf-8")

    print("\n===== 결과 =====")
    if "켜기시험" in 결과:
        k = 결과["켜기시험"]
        입장 = {True: "로그인 없이 입장 ✔", False: "로그인 화면 뜸 ✘ (런처 자동 로그인 확인)", None: ""}[k.get("로그인없이입장")]
        print(f"  켜기: {'이미 켜져 있었음' if k.get('이미켜짐') else '✔ ' + str(k.get('게임창뜬초')) + '초'}  {입장}")
    print(f"  캡처: {'✔' if 결과['캡처'] else '✘ (검은 화면 — 보안 프로그램이 막는 것일 수 있음)'}")
    if 결과["멈춘화면의심"]:
        print("  ※ 세 장이 거의 같습니다. 화면이 움직이는 중이었다면 캡처가 멈춘 화면일 수 있습니다.")
    if "입력" in 결과:
        표시 = {True: "✔", False: "✘ (기록 모드로 바꿈)", None: "시험 안 함"}[결과["입력"]]
        print(f"  입력: {표시}")
    print(f"  사진·결과 저장: {폴더}")
    print("  → 이 폴더의 결과.json 과 사진을 Claude 세션에 보내 주세요.")


if __name__ == "__main__":
    main()
