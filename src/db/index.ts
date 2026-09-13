import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

let db: Database.Database | undefined;

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
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    const applyMigration = database.transaction(() => {
      database.exec(sql);
      database.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
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
