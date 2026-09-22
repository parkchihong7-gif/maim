#!/usr/bin/env python3
"""깨진 SQLite 에서 **읽을 수 있는 것만** 건져 새 파일로 옮긴다.

`.recover` 가 안 되는 곳에서 쓴다. 구글 클라우드 셸의 sqlite3 는
`sqlite_dbpage` 없이 빌드돼 있어 `.recover` 가 거절당한다.

방법은 단순하다. 표 하나씩, 여러 줄씩 끊어 읽는다. 어떤 덩이에서 터지면
그 덩이만 버리고 **한 줄씩** 다시 시도한다. 깨진 자리만 잃고 나머지는 산다.

    python3 건지기.py 깨진.db 새.db
"""
import sqlite3
import sys

덩이 = 200


def 건지기(원본: str, 새것: str) -> int:
    헌것 = sqlite3.connect(f"file:{원본}?mode=ro", uri=True)
    헌것.text_factory = bytes          # 글자가 깨져 있어도 멈추지 않게
    새 = sqlite3.connect(새것)

    만들것 = []
    try:
        만들것 = list(헌것.execute(
            "SELECT type, name, sql FROM sqlite_master "
            "WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"))
    except sqlite3.DatabaseError as 탈:
        print(f"✗ 표 목록조차 못 읽습니다 — {탈}")
        return 0

    표들 = []
    for 종류, 이름, 만드는글 in 만들것:
        이름 = 이름.decode() if isinstance(이름, bytes) else 이름
        만드는글 = 만드는글.decode() if isinstance(만드는글, bytes) else 만드는글
        종류 = 종류.decode() if isinstance(종류, bytes) else 종류
        try:
            새.execute(만드는글)
            if 종류 == "table":
                표들.append(이름)
        except sqlite3.Error as 탈:
            print(f"  · {이름} 은(는) 만들지 못했습니다 — {탈}")

    산줄 = 0
    for 표 in 표들:
        칸수 = len(list(헌것.execute(f'PRAGMA table_info("{표}")')))
        자리표 = ",".join("?" * 칸수)
        놓친것, 이표 = 0, 0
        건너뜀 = 0
        while True:
            try:
                줄들 = list(헌것.execute(
                    f'SELECT * FROM "{표}" LIMIT {덩이} OFFSET {건너뜀}'))
            except sqlite3.DatabaseError:
                # 이 덩이가 깨졌다. 한 줄씩 다시 해 본다.
                줄들 = []
                for n in range(덩이):
                    try:
                        줄들 += list(헌것.execute(
                            f'SELECT * FROM "{표}" LIMIT 1 OFFSET {건너뜀 + n}'))
                    except sqlite3.DatabaseError:
                        놓친것 += 1
            if not 줄들:
                break
            for 줄 in 줄들:
                try:
                    새.execute(f'INSERT OR IGNORE INTO "{표}" VALUES ({자리표})', 줄)
                    이표 += 1
                except sqlite3.Error:
                    놓친것 += 1
            건너뜀 += 덩이
            if len(줄들) < 덩이 and 놓친것 == 0:
                break
        새.commit()
        산줄 += 이표
        말 = f"  {표:24} {이표:6,}줄"
        if 놓친것:
            말 += f"   (못 건진 것 {놓친것}줄)"
        print(말)

    새.close()
    헌것.close()
    return 산줄


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("쓰는 법: python3 건지기.py 깨진.db 새.db")
    모두 = 건지기(sys.argv[1], sys.argv[2])
    print(f"\n모두 {모두:,}줄을 건졌습니다 → {sys.argv[2]}")
