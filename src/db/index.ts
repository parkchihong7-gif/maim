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
