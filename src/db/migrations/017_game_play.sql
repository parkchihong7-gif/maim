-- 🕹️ 게임 플레이 — 집 PC 가 게임 화면을 찍어 보내고, 퀘스트별 공략 글을 만든다(GAME_PLAN.md 7·15번).
-- 전부 **주인 자리만** 쓴다(라우트에서 주인 아니면 404). 그래서 owner_key 칸이 없다.
-- 이벤트 기록은 game_play_log — game_events 는 🎮 출시 달력이 이미 쓴다.
-- posts.source·posts.game_quest_id·categories.game_id 칸은 db/index.ts 칸붙이기에서 붙인다.

CREATE TABLE IF NOT EXISTS game_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT '기록',          -- 감독 | 기록
  profile_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  mission_id INTEGER,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  end_reason TEXT,
  minutes_used REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS game_quests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '기타',           -- 메인 | 서브 | 기타
  status TEXT NOT NULL DEFAULT '진행중',       -- 진행중 | 완료 | 직접플레이대기 | 글완료
  stuck_reason TEXT,
  last_shot_id INTEGER,
  checklist_json TEXT,                         -- 이 퀘스트에 필요한 장면 [{장면, 개수}] (비면 종류별 기본 틀)
  shot_order_json TEXT,                        -- 앨범에서 사람이 바꾼 순서 [shot_id…]
  ref_links_json TEXT,                         -- 참고 글 [{url, kind, state}]
  ref_brief TEXT,
  ref_brief_at TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  done_at TEXT,
  post_id INTEGER,
  UNIQUE (game_id, name)
);

CREATE TABLE IF NOT EXISTS game_shots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  session_id INTEGER,
  quest_id INTEGER,
  scene TEXT NOT NULL DEFAULT '기타',
  caption TEXT,
  source TEXT NOT NULL DEFAULT 'auto',          -- auto | f9 | upload | list
  gcs_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  taken_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_in_post INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0,           -- 앨범에서 뺀 것(지우지는 않음)
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_game_shots_quest ON game_shots (quest_id, taken_at);
CREATE INDEX IF NOT EXISTS idx_game_shots_game ON game_shots (game_id, taken_at);

CREATE TABLE IF NOT EXISTS game_missions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  title TEXT NOT NULL,
  quest_id INTEGER,
  targets_json TEXT NOT NULL DEFAULT '[]',      -- [{종류:"목록순서",개수:3} | {종류:"메인",개수:3} | {퀘스트:"이름"}]
  checklist_json TEXT,                          -- 퀘스트마다 필요한 장면 (비면 종류별 기본 틀)
  progress_json TEXT NOT NULL DEFAULT '{}',     -- {quest_ids:[…]}
  status TEXT NOT NULL DEFAULT '대기',           -- 대기 | 진행중 | 준비됨 | 글완료
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_play_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  game_id TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  detail_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_game_play_log_at ON game_play_log (at);

CREATE TABLE IF NOT EXISTS game_agent (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_seen_at TEXT,
  agent_version TEXT,
  current_game TEXT,
  state TEXT,
  detail_json TEXT,
  pending_command TEXT,
  session_id INTEGER
);

CREATE TABLE IF NOT EXISTS game_quest_list (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT '기타',            -- 메인 | 서브 | 일일 | 기타
  status TEXT NOT NULL DEFAULT '확인필요',       -- 진행중 | 진행가능 | 조건미달 | 완료 | 확인필요
  condition_text TEXT,
  game_order INTEGER NOT NULL DEFAULT 0,
  sort_key INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  evidence_shot_ids TEXT NOT NULL DEFAULT '[]',
  quest_id INTEGER,
  seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_game_quest_list_game ON game_quest_list (game_id, sort_key);

CREATE TABLE IF NOT EXISTS post_game_shots (
  post_id INTEGER NOT NULL,
  shot_id INTEGER NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (post_id, shot_id)
);
