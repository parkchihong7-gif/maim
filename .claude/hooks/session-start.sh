#!/bin/bash
set -euo pipefail

# 실제 배포되는 브랜치는 claude/game-play-ontn8y 하나뿐이다(CLAUDE.md 0번 항목 참고).
# 그런데 GitHub 저장소의 "기본 브랜치" 설정은 아직 claude/great-brown-j376u0 로 남아
# 있어서, 어떤 새 세션(게임 플레이 작업·블로그 포스팅 확장판 등 주제를 안 가리고)이
# 브랜치를 안 정하고 시작하면 옛 내용에서 시작해 또 새 브랜치로 갈라질 위험이 있다.
# 그래서 세션이 시작할 때마다 여기서 한 번 더 game-play-ontn8y 로 맞춰 둔다.
#
# 이 스크립트는 로컬(사람이 직접 쓰는 환경)에서는 아무 일도 안 한다 — 원격(클라우드)
# 세션에서만, 그리고 커밋 안 된 변경이 전혀 없을 때만 안전하게 브랜치를 바꾼다.
#
# (변수 이름은 일부러 영문으로 뒀다 — bash는 로케일에 따라 한글 변수 이름을
# 식별자로 못 받아들이는 환경이 있어서, 이 저장소의 TS/JS 코드와 달리 여기서는
# 안전하게 영문만 쓴다.)

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

TARGET_BRANCH="game-play-ontn8y"
CURRENT_BRANCH="$(git branch --show-current 2>/dev/null || echo "")"

if [ "$CURRENT_BRANCH" != "$TARGET_BRANCH" ]; then
  echo "[maim] 지금 브랜치(\"$CURRENT_BRANCH\")는 실제 배포 브랜치가 아닙니다 — \"$TARGET_BRANCH\"로 맞춥니다." >&2
  if git fetch origin "claude/$TARGET_BRANCH" --quiet 2>/dev/null; then
    if git diff --quiet 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
      if git checkout -B "$TARGET_BRANCH" "origin/claude/$TARGET_BRANCH" --quiet 2>/dev/null; then
        echo "[maim] \"$TARGET_BRANCH\"로 전환했습니다." >&2
      else
        echo "[maim] 브랜치 전환에 실패했습니다 — 꼭 CLAUDE.md 0번 항목을 읽고 수동으로 \"git checkout $TARGET_BRANCH\" 하세요." >&2
      fi
    else
      echo "[maim] 커밋 안 된 변경이 있어 자동으로 못 옮겼습니다 — CLAUDE.md 0번 항목을 꼭 읽으세요." >&2
    fi
  else
    echo "[maim] origin/claude/$TARGET_BRANCH 를 못 받아왔습니다 — 네트워크를 확인하거나 수동으로 전환하세요." >&2
  fi
fi

npm install
