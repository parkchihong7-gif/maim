import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let db: Database.Database | undefined;

/** 이 마이그레이션 글이 만들겠다고 한 표들이 **실제로 있는가.** */
function 표가다있나(database: Database.Database, sql: string): boolean {
  const 이름들 = [...sql.matchAll(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["'`]?(\w+)["'`]?/gi)]
    .map((m) => m[1]);
  return 이름들.every((이름) => !!database
    .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?")
    .get(이름));
}

/**
 * **없을 때만** 칸을 붙인다.
 *
 * `.sql` 로 두지 않는 이유가 있다. 위 실행기는 "적혀 있어도 표가 없으면 다시
 * 돌린다" 로 짜여 있고, 그게 성립하는 건 마이그레이션이 전부
 * `CREATE TABLE IF NOT EXISTS` 라 두 번 돌려도 해롭지 않기 때문이다.
 * `ALTER TABLE ... ADD COLUMN` 에는 `IF NOT EXISTS` 가 없어서 두 번째에
 * "duplicate column name" 으로 죽는다. 그러면 서버가 아예 안 뜬다.
 *
 * 그래서 칸은 SQL 이 아니라 여기서 붙인다. 먼저 있는지 보고 없을 때만 붙이니
 * 몇 번을 돌려도 같다.
 */
function 칸붙이기(database: Database.Database, 표: string, 칸: string, 정의: string) {
  const 있나 = (database.prepare(`PRAGMA table_info(${표})`).all() as { name: string }[])
    .some((c) => c.name === 칸);
  if (있나) return;
  database.exec(`ALTER TABLE ${표} ADD COLUMN ${칸} ${정의}`);
}

function runMigrations(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const migrationsDir = path.join(import.meta.dirname, "migrations");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name),
  );

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    // **장부만 믿지 않는다.** 한 번 데였다.
    //
    // 디스크가 모자라 쓰기가 잘린 적이 있었다. 그때 마이그레이션이
    // "적용했다"고 장부에는 적혔는데 표는 안 만들어졌다. 그 뒤로는 장부를
    // 보고 건너뛰니 그 표는 **영영 안 생긴다.** 실제로 로그인이 계속
    // `no such table: keyserver_sessions` 로 죽었다.
    //
    // 그래서 적혀 있어도 **그 파일이 만들겠다고 한 표가 실제로 있는지**
    // 본다. 없으면 다시 돌린다. 마이그레이션은 전부
    // `CREATE TABLE IF NOT EXISTS` 라 두 번 돌려도 해롭지 않다.
    if (applied.has(file) && 표가다있나(database, sql)) continue;
    const applyMigration = database.transaction(() => {
      database.exec(sql);
      database.prepare(
        "INSERT OR IGNORE INTO _migrations (name) VALUES (?)").run(file);
    });
    applyMigration();
  }

  // ── 자리 나누기 ────────────────────────────────────────────────
  //
  // 이 프로그램은 한 사람이 쓰는 전제로 만들어졌다. 접속키를 두 사람에게
  // 주면 서로의 카테고리와 초안이 다 보였고, 한 사람 몫만 지울 수도 없었다.
  //
  //   owner_key = ''      주인(관리자). **원래 있던 글은 전부 여기로 간다**
  //   owner_key = 1차키   기간을 두고 맛보러 온 체험 회원
  //
  // 기본값을 빈 값으로 두는 것이 중요하다. 이미 쌓여 있던 줄들이 그대로
  // 주인 것이 되어, 이 칸이 생겨도 주인 화면은 어제와 똑같이 보인다.
  칸붙이기(database, "categories", "owner_key", "TEXT NOT NULL DEFAULT ''");
  칸붙이기(database, "posts", "owner_key", "TEXT NOT NULL DEFAULT ''");
  // 세션에 1차키를 적어 둔다. 지울 때 "누구 것" 을 이것으로 안다.
  // 2차키가 아닌 이유는 tenancy.ts 에 적어 두었다 — 2차키는 기기마다 달라서
  // 한 사람의 글이 세 자리로 흩어진다.
  칸붙이기(database, "keyserver_sessions", "key1", "TEXT NOT NULL DEFAULT ''");

  // ── 카테고리를 더 또렷하게 ───────────────────────────────────
  //
  // 주제 키워드 한 줄만으로는 AI 가 엉뚱한 글을 썼다. 고유명사나 뜻이 여럿인
  // 말이면(«스크래치» 가 코딩인지 자동차 흠집인지) 검색에 먼저 걸린 쪽으로
  // 흘렀다. 그래서 뜻을 좁히는 말·빼야 할 말·참고할 주소를 같이 받는다.
  칸붙이기(database, "categories", "must_keywords", "TEXT");      // 함께 들어갈 말 (뜻을 좁힘)
  칸붙이기(database, "categories", "exclude_keywords", "TEXT");   // 빼야 할 말 (다른 뜻)
  칸붙이기(database, "categories", "reference_urls", "TEXT");     // 이 카테고리 참고 주소 (줄마다 하나)
  칸붙이기(database, "categories", "main_url", "TEXT");           // 이 카테고리 대표 주소 (하나, 가장 먼저 연다)
  // 주제 키워드를 한 번 쓰고 비울지(0), 계속 쓸지(1). 예전에는 늘 한 번 쓰고
  // 비웠다 — 두 번째 글부터 키워드 없이 써서 주제가 흐려졌다.
  칸붙이기(database, "categories", "keyword_keep", "INTEGER NOT NULL DEFAULT 0");

  // ── 포스팅 예약 ──────────────────────────────────────────────
  //
  // 카테고리마다 **하루에 몇 편**을 준비할지. 예전에는 활성 카테고리
  // 전부를 한 편씩 돌렸다. 카테고리가 아홉이면 매일 아홉 편이 나오는데,
  // 그만큼 올리는 사람은 없다. 쌓이기만 하고 Claude 한도만 쓴다.
  //
  // 기본값 1 로 둔다. 이 칸이 생겨도 어제와 똑같이 돈다.
  칸붙이기(database, "categories", "daily_count", "INTEGER NOT NULL DEFAULT 1");
  // **하루 편수는 화면에서 뺐다.** 한 카테고리에서 하루 여러 편을 쓰는 일이
  // 없어서다 — 이제 켜진 카테고리마다 하루 한 편, 전체는 하루 상한까지.
  // 예전에 0(쉼)으로 두셨던 것은 «꺼짐» 과 같은 뜻이니 그렇게 옮긴다.
  // 0 을 적는 길이 없어졌으므로 몇 번을 돌아도 한 번만 바뀐다.
  database.exec("UPDATE categories SET active = 0, daily_count = 1 WHERE daily_count = 0");

  // ── 자료 메모 ────────────────────────────────────────────────
  //
  // 첫 글을 쓸 때 대표·참고 주소를 열어 읽은 것을 짧게 남겨 둔다. 두 번째
  // 글부터는 주소를 다시 열지 않고 이 메모를 바탕으로, 최근 소식만 검색해서
  // 쓴다. 주소를 열고 읽는 데 글 한 편 시간의 절반 넘게 들었다(6~9분).
  칸붙이기(database, "categories", "research_brief", "TEXT");
  칸붙이기(database, "categories", "brief_sig", "TEXT");        // 메모를 만들 때의 주소·설명 지문
  칸붙이기(database, "categories", "brief_at", "TEXT");         // 메모를 만든 때 (ISO)

  // ── 네이버 키워드 (🔎 탭) ─────────────────────────────────────
  //
  // 키워드는 탭에서 **미리** 모은다. 글쓰기는 kw_apply 를 켠 카테고리에서만
  // 보관함을 읽는다 — 기본은 꺼짐(0), 꺼져 있으면 예전과 똑같다.
  칸붙이기(database, "categories", "kw_apply", "INTEGER NOT NULL DEFAULT 0");
  칸붙이기(database, "categories", "kw_refreshed_at", "TEXT");  // 마지막으로 다 모은 때 (ISO)
  칸붙이기(database, "categories", "kw_error", "TEXT");         // 마지막으로 모으다 난 탈
  칸붙이기(database, "categories", "kw_job", "TEXT");
  칸붙이기(database, "categories", "kw_seeds", "TEXT");         // 직접 정한 씨앗 (JSON 배열) — 비면 이름·주제에서
  칸붙이기(database, "keyword_pool", "trend_json", "TEXT");      // 검색어트렌드 12개월 {months, dir, change, at}           // 모으다 멈춘 자리 (JSON) — [이어서 모으기]

  // ── 글 쓰는 방식 (카테고리 폼 ⑦) — 비워 두면 예전처럼 자동. src/claude/글방식.ts ──
  칸붙이기(database, "categories", "write_mode", "TEXT");      // info / experience
  칸붙이기(database, "categories", "structure", "TEXT");       // auto / 1~10
  칸붙이기(database, "categories", "length_pref", "TEXT");     // short / default / long
  칸붙이기(database, "categories", "tone_strength", "INTEGER"); // 0 / 50 / 100
  칸붙이기(database, "categories", "my_note", "TEXT");         // 내 경험·요청

  // ── 최종 검수 — 원래 초안(content)은 그대로 두고 최종본을 따로 ──
  칸붙이기(database, "posts", "final_content", "TEXT");
  칸붙이기(database, "posts", "final_at", "TEXT");
  칸붙이기(database, "posts", "review_json", "TEXT");
  칸붙이기(database, "posts", "review_count", "INTEGER NOT NULL DEFAULT 0");

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_categories_owner ON categories (owner_key);
    CREATE INDEX IF NOT EXISTS idx_posts_owner ON posts (owner_key);
  `);
}

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(config.paths.dbFile);
  // WAL 모드는 별도의 -wal/-shm 파일과 공유 메모리/파일 잠금에 의존하는데, Cloud Run의
  // GCS 볼륨 마운트(FUSE) 같은 네트워크 파일시스템에서는 이 잠금이 제대로 지원되지
  // 않아 DB가 깨질 위험이 있다. 이 앱은 쓰기 빈도가 매우 낮은 개인용 도구이므로
  // 성능 손해 없이 기본 롤백 저널 모드로 안전하게 간다.
  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}
