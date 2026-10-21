"""🧪 가상 게임 — 진짜 게임 없이 집 PC 프로그램 전체 흐름을 시험한다 (회사 PC·클라우드에서도 돈다).

진짜 게임 창 대신 그림을 만들어 돌려준다. 장면이 정해진 순서(시나리오)대로 넘어가고,
퀘스트 표시·미니맵·지역명 자리(프로필 «영역» 비율)에 글자가 바뀌어 변화 감지가 실제처럼 걸린다.

  감독 모드: [자동진행] 버튼이 눌려야 장면이 넘어간다. [지도열기]→지도 화면, [창닫기]→닫힘,
             [임무창열기]→목록 화면. 누른 버튼은 모두 기록된다(화이트리스트 확인용).
  기록 모드: 사람이 플레이하는 것처럼 혼자 넘어간다(입력 0건).

시나리오 (퀘스트 3개):
  1. 도깨비 시장 입장 (메인) — 받음 → 이동 3 → 도착 → 대화 → 전투 → 보스 → 처치 → 보상 → 완료
  2. 잃어버린 장부 (서브)   — 받음 → 이동 → **같은 화면에서 멈춤**(막힘 → 직접 플레이 대기 시험)
  3. 장터의 소문 (메인)     — 1번과 같은 꼴
  --금지 를 주면 1번 중간에 «상점» 팝업이 끼어든다(금지 화면 → 즉시 정지 시험).

서버의 가짜 AI(tools/fake-claude.mjs)는 사진을 못 보니, 판단 요청에 «가상힌트» 로 지금 장면을 같이 보낸다.
진짜 게임에서는 힌트가 없고, 진짜 AI 가 사진만 보고 판단한다.
"""

from __future__ import annotations

import random
import time
import zlib
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

크기 = (1280, 720)

색 = {
    "퀘스트받음": (59, 74, 107), "이동중": (58, 96, 84), "도착": (70, 90, 60), "대화": (91, 74, 122),
    "전투": (110, 60, 50), "보스등장": (107, 43, 43), "보스처치": (150, 70, 50), "보상": (122, 91, 30),
    "퀘스트완료": (40, 110, 80), "지도": (47, 93, 80), "목록": (40, 50, 70), "상점": (120, 30, 90),
    "로딩": (20, 20, 25), "기타": (60, 60, 60),
}


def _글꼴(크기: int):
    for 이름 in ["malgun.ttf", "C:/Windows/Fonts/malgun.ttf", "NanumGothic.ttf",
                 "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
                 "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
                 "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
                 "/System/Library/Fonts/AppleSDGothicNeo.ttc"]:
        try:
            return ImageFont.truetype(이름, 크기)
        except OSError:
            continue
    try:
        return ImageFont.load_default(크기)
    except TypeError:
        return ImageFont.load_default()


def 퀘스트단계(이름: str, 종류: str, 지역: str, 막힘: bool = False, 금지: bool = False) -> list[dict]:
    q = {"이름": 이름, "종류": 종류}
    단계 = [
        {"장면": "퀘스트받음", "설명": f"{지역} 입구에서 «{이름}» 의뢰를 받음", "행동": "임무수락", "단계": "시작"},
        {"장면": "이동중", "설명": f"{지역}으로 가는 길 — 마을 광장", "행동": "대기", "중간": True},
        {"장면": "이동중", "설명": "다리 건너 갈림길", "행동": "대기", "중간": True},
    ]
    if 막힘:
        단계.append({"장면": "이동중", "설명": "목적지를 못 찾고 같은 자리", "행동": "대기", "멈춤": True})
        return [{**s, "퀘스트": {**q, "단계": s.get("단계", "진행")}} for s in 단계]
    if 금지:
        단계.append({"장면": "팝업", "설명": "상점 창이 열림", "행동": "대기", "보이는글": "상점, 구매, 결제", "그림": "상점"})
    단계 += [
        {"장면": "이동중", "설명": "숲길 진입", "행동": "대기"},
        {"장면": "도착", "설명": f"{지역} 도착", "행동": "대기"},
        {"장면": "대화", "설명": "관리인과 대화", "행동": "대기"},
        {"장면": "전투", "설명": "길을 막는 도깨비와 전투", "행동": "대기"},
        {"장면": "보스등장", "설명": "관문 도깨비 등장", "행동": "대기"},
        {"장면": "보스처치", "설명": "관문 도깨비 처치", "행동": "대기"},
        {"장면": "보상", "설명": "퀘스트 보상 창", "행동": "보상받기", "단계": "보상"},
        {"장면": "퀘스트완료", "설명": f"«{이름}» 완료", "행동": "다음퀘스트", "단계": "완료"},
    ]
    return [{**s, "퀘스트": {**q, "단계": s.get("단계", "진행")}} for s in 단계]


def 시나리오(금지: bool = False) -> list[list[dict]]:
    return [
        퀘스트단계("도깨비 시장 입장", "메인", "북쪽 돌다리", 금지=금지),
        퀘스트단계("잃어버린 장부", "서브", "장터 뒷골목", 막힘=True),
        퀘스트단계("장터의 소문", "메인", "동쪽 숲"),
    ]


목록힌트 = [
    {"이름": "장터의 소문", "종류": "메인", "상태": "진행가능", "조건": "", "확신": 0.92},
    {"이름": "도깨비 시장 입장", "종류": "메인", "상태": "진행중", "조건": "", "확신": 0.95},
    {"이름": "잃어버린 장부", "종류": "서브", "상태": "진행가능", "조건": "", "확신": 0.88},
    {"이름": "붉은 ■■의 …", "종류": "메인", "상태": "진행가능", "조건": "", "확신": 0.42},
    {"이름": "도깨비 순찰대 합류", "종류": "서브", "상태": "조건미달", "조건": "레벨 30 필요", "확신": 0.86},
    {"이름": "첫 번째 의뢰", "종류": "메인", "상태": "완료", "조건": "", "확신": 0.9},
]


class 가상게임:
    def __init__(self, 프로필: dict, 간격초: float = 3.0, 금지: bool = False, 시계=time.monotonic, 로그=print):
        self.프로필 = 프로필
        self.감독 = 프로필.get("모드") == "감독"
        self.간격 = 간격초
        self.시계 = 시계
        self.로그 = 로그
        self.퀘스트들 = 시나리오(금지)
        self.qi, self.si = 0, 0
        self.켜짐 = False
        self.켠때 = 0.0
        self.덮개: str | None = None       # "지도" | "목록" | None
        self.자동 = not self.감독           # 기록 모드는 사람이 플레이 → 혼자 넘어감
        self.마지막넘김 = 시계()
        self.누른기록: list[str] = []
        self.쪽 = 0
        self.글꼴 = {n: _글꼴(n) for n in (22, 28, 40, 64)}

    # ── 창 흉내 ──
    def 켜기(self) -> None:
        self.켜짐 = True
        self.켠때 = self.시계()
        self.마지막넘김 = self.시계()
        self.로그("  [가상 게임] 켜짐 — 로딩 3초")

    def 창있나(self) -> bool:
        return self.켜짐

    def 로딩중(self) -> bool:
        return self.켜짐 and self.시계() - self.켠때 < 3

    # ── 입력 (감독 모드 누르기.py 가 부른다) ──
    def 누름(self, 이름: str) -> None:
        self.누른기록.append(이름)
        if 이름 == "지도열기":
            self.덮개 = "지도"
        elif 이름 == "임무창열기":
            self.덮개 = "목록"
            self.쪽 = 0
        elif 이름 == "목록다음":
            self.쪽 += 1
        elif 이름 == "창닫기":
            self.덮개 = None
        elif 이름 in ("자동진행", "임무수락", "보상받기"):
            self.자동 = True
            # 막힌 퀘스트에서 [임무창열기]로 목록을 본 뒤 [자동진행]을 누르면 다음 퀘스트로 넘어간다
            # (게임의 «다음 임무 자동 진행» 흉내 — main.py 의 막힘 처리 순서와 같다).
            if 이름 == "자동진행" and self._지금().get("멈춤") and "임무창열기" in self.누른기록[-4:-1]:
                self._다음퀘스트()

    def _지금(self) -> dict:
        if self.qi >= len(self.퀘스트들):
            return {"장면": "기타", "설명": "모든 퀘스트를 마침", "행동": "정지", "이유": "가상 게임 시나리오를 다 마쳤습니다", "퀘스트": None, "끝": True}
        return self.퀘스트들[self.qi][self.si]

    def _다음퀘스트(self) -> None:
        self.qi += 1
        self.si = 0
        self.마지막넘김 = self.시계()

    def _넘기기(self) -> None:
        """시간이 되면 다음 장면으로. 멈춤 장면은 넘어가지 않는다(막힘 시험)."""
        if not self.켜짐 or self.덮개 or not self.자동 or self.로딩중():
            return
        if self.시계() - self.마지막넘김 < self.간격:
            return
        s = self._지금()
        if s.get("끝") or s.get("멈춤"):
            return
        self.마지막넘김 = self.시계()
        if self.si + 1 < len(self.퀘스트들[self.qi]):
            self.si += 1
        else:
            self._다음퀘스트()
        if self.감독 and self._지금().get("장면") == "퀘스트받음":
            self.자동 = False   # 새 퀘스트는 [임무수락]/[자동진행]을 눌러야 시작

    def 사람이넘김(self) -> None:
        """기록 모드에서 «사람이 막힌 퀘스트를 포기하고 다음으로» — 시험용."""
        self._다음퀘스트()

    # ── 화면 ──
    def 힌트(self) -> dict:
        if self.로딩중():
            return {"장면": "로딩", "설명": "로딩 화면", "행동": "대기"}
        if self.덮개 == "지도":
            s = self._지금()
            return {"장면": "지도", "설명": f"지도 — 목적지 표시 ({s.get('설명', '')[:14]})", "행동": "창닫기", "퀘스트": s.get("퀘스트")}
        if self.덮개 == "목록":
            return {"장면": "목록", "설명": "퀘스트 목록 창", "행동": "창닫기", "퀘스트": None}
        s = dict(self._지금())
        for k in ("멈춤", "그림", "끝"):
            s.pop(k, None)
        return s

    def 목록힌트(self) -> list[dict]:
        return 목록힌트

    def 찍기(self) -> Image.Image:
        self._넘기기()
        img = Image.new("RGB", 크기, (20, 20, 25))
        d = ImageDraw.Draw(img)
        W, H = 크기
        if self.로딩중():
            d.text((W // 2 - 120, H // 2 - 30), "LOADING 로딩 중…", fill=(200, 200, 210), font=self.글꼴[40])
            d.rectangle((W * 0.3, H * 0.6, W * (0.3 + 0.4 * (self.시계() - self.켠때) / 3), H * 0.62), fill=(120, 140, 220))
            return img
        s = self._지금()
        그림 = s.get("그림") or self.덮개 or s.get("장면", "기타")
        d.rectangle((0, 0, W, H), fill=색.get(그림, 색["기타"]))
        # 배경 무늬 — 장면·단계마다 큰 도형이 달라 화면 해시가 실제 게임처럼 크게 바뀐다
        r = random.Random(zlib.crc32(f"{self.qi}-{self.si}-{그림}".encode()))
        for _ in range(7):
            x, y = r.randint(0, W), r.randint(0, H)
            크기2 = r.randint(80, 320)
            밝기 = r.choice([25, 70, 140, 210])
            모양 = (x, y, x + 크기2, y + 크기2 * r.choice([1, 2]) // 2)
            (d.ellipse if r.random() < 0.5 else d.rectangle)(모양, fill=(밝기, 밝기, min(255, 밝기 + 30)))
        if self.덮개 == "지도":
            d.rectangle((W * 0.1, H * 0.1, W * 0.9, H * 0.9), fill=(222, 214, 180), outline=(80, 60, 30), width=6)
            d.text((W * 0.14, H * 0.13), "MAP 지도", fill=(60, 40, 20), font=self.글꼴[40])
            d.ellipse((W * 0.6, H * 0.4, W * 0.63, H * 0.45), fill=(200, 30, 30))
            d.text((W * 0.64, H * 0.4), "목적지", fill=(120, 20, 20), font=self.글꼴[28])
            return img
        if self.덮개 == "목록":
            d.rectangle((W * 0.2, H * 0.15, W * 0.8, H * 0.85), fill=(30, 36, 52), outline=(150, 160, 200), width=4)
            d.text((W * 0.22, H * 0.17), f"QUEST LIST 퀘스트 목록 ({self.쪽 + 1}쪽)", fill=(230, 230, 240), font=self.글꼴[28])
            for i, r in enumerate(목록힌트[self.쪽 * 6:(self.쪽 + 1) * 6]):
                d.text((W * 0.23, H * 0.26 + i * 52), f"[{r['종류']}] {r['이름']}  — {r['상태']} {r['조건']}", fill=(220, 220, 230), font=self.글꼴[22])
            return img
        # 가운데 큰 장면 글자
        d.text((W * 0.08, H * 0.40), f"{s.get('장면')}", fill=(255, 255, 255), font=self.글꼴[64])
        d.text((W * 0.08, H * 0.55), s.get("설명", ""), fill=(235, 235, 235), font=self.글꼴[28])
        d.text((W * 0.08, H * 0.92), f"VIRTUAL GAME · q{self.qi + 1} s{self.si + 1}", fill=(200, 200, 200), font=self.글꼴[22])
        영역 = self.프로필.get("영역") or {}
        q = s.get("퀘스트") or {}
        if "퀘스트표시" in 영역:
            r = 영역["퀘스트표시"]
            box = (r["x"] * W, r["y"] * H, (r["x"] + r["w"]) * W, (r["y"] + r["h"]) * H)
            d.rectangle(box, fill=(10, 10, 14))
            d.text((box[0] + 10, box[1] + 10), f"[{q.get('종류', '')}] {q.get('이름', '')}", fill=(255, 220, 120), font=self.글꼴[22])
            d.text((box[0] + 10, box[1] + 50), f"단계 {self.si + 1} · {s.get('장면')}", fill=(230, 230, 230), font=self.글꼴[22])
        if "미니맵" in 영역:
            r = 영역["미니맵"]
            box = (r["x"] * W, r["y"] * H, (r["x"] + r["w"]) * W, (r["y"] + r["h"]) * H)
            d.rectangle(box, fill=(30, 50, 40), outline=(200, 200, 200), width=2)
            px = box[0] + (box[2] - box[0]) * (0.15 + 0.07 * self.si) % (box[2] - box[0])
            d.ellipse((px, box[1] + 30 + 8 * self.si, px + 14, box[1] + 44 + 8 * self.si), fill=(250, 250, 90))
        if "지역명" in 영역:
            r = 영역["지역명"]
            d.text((r["x"] * W, r["y"] * H), s.get("설명", "")[:12], fill=(255, 255, 255), font=self.글꼴[22])
        if 그림 == "상점":
            d.rectangle((W * 0.3, H * 0.2, W * 0.7, H * 0.8), fill=(250, 240, 250), outline=(120, 30, 90), width=6)
            d.text((W * 0.33, H * 0.25), "SHOP 상점 · 구매 · 결제", fill=(120, 30, 90), font=self.글꼴[28])
        return img


def 그림저장(게임: 가상게임, 폴더: Path, 몇: int = 6) -> list[Path]:
    """시험용 — 가상 게임 화면 몇 장을 파일로 남긴다(pytest·눈으로 확인)."""
    폴더.mkdir(parents=True, exist_ok=True)
    out = []
    for i in range(몇):
        p = 폴더 / f"virtual_{i + 1}.png"
        게임.찍기().save(p)
        out.append(p)
    return out
