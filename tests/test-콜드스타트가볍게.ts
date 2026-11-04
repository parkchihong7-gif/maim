/**
 * **최초 접속이 가벼워졌는지** 시험한다 — 서버를 열기 전엔 DB 하나만 받고,
 * 로그인 폴더(home/)에 쌓인 자잘한 캐시(세션 대화 기록·bash 스냅샷 등)는
 * 건너뛰며, 서버가 연 뒤 받는 "나머지"가 이미 받아 둔 DB 를 덮지 않는지 본다.
 *
 *     npx tsx tests/test-콜드스타트가볍게.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-cold-"));
process.env.DATA_DIR = 임시;

const G = await import("../src/persistence/gcsState.js");
const { config } = await import("../src/config.js");

/** 판 번호(generation)까지 흉내 낸 가짜 저장통 — test-로그인보존.ts 와 같은 모양. */
class 가짜통 {
  글 = new Map<string, { 내용: string; gen: number }>();
  세대 = 100;
  받은이름들: string[] = [];
  넣기(이름: string, 내용: string) { this.글.set(이름, { 내용, gen: ++this.세대 }); }
  private 파일꼴(이름: string) {
    const 통 = this;
    return {
      name: 이름,
      get metadata() { return { generation: String(통.글.get(이름)?.gen ?? "") }; },
      async download({ destination }: { destination: string }) {
        const 것 = 통.글.get(이름);
        if (!것) throw Object.assign(new Error("없음"), { code: 404 });
        통.받은이름들.push(이름);
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, 것.내용);
      },
      async getMetadata() { return [{ generation: String(통.글.get(이름)?.gen ?? "") }]; },
    };
  }
  async getFiles(opts: { prefix?: string } = {}) {
    return [[...this.글.keys()].filter((k) => !opts.prefix || k.startsWith(opts.prefix))
      .map((k) => this.파일꼴(k))];
  }
  file(이름: string) { return this.파일꼴(이름); }
  async upload(로컬: string, opts: { destination: string; preconditionOpts?: { ifGenerationMatch?: number } }) {
    this.넣기(opts.destination, fs.readFileSync(로컬, "utf8"));
    return [this.파일꼴(opts.destination)];
  }
}

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

const dbRel = path.relative(config.paths.dataDir, config.paths.dbFile);
const 통 = new 가짜통();
G.시험용통바꾸기(통);

console.log("\n① downloadEssentialState — DB 하나만, 로그인 폴더는 안 건드린다");
통.넣기(dbRel, "옛-DB");
통.넣기("home/.codex/auth.json", "로그인");
await G.downloadEssentialState();
참("DB 는 받았다", fs.readFileSync(config.paths.dbFile, "utf8") === "옛-DB");
참("로그인 폴더는 아직 안 받았다", !fs.existsSync(path.join(config.paths.dataDir, "home/.codex/auth.json")));
참("정확히 DB 하나만 내려받았다", 통.받은이름들.length === 1 && 통.받은이름들[0] === dbRel);

console.log("\n② 버킷에 DB 가 아직 없어도(새 서버) 탈 없이 지나간다");
const 새통 = new 가짜통();
G.시험용통바꾸기(새통);
let 탈남 = false;
try { await G.downloadEssentialState(); } catch { 탈남 = true; }
참("오류 없이 넘어간다", !탈남);

console.log("\n③ downloadState — 로그인 폴더는 받되, DB 는 다시 받지 않는다(그사이 들어온 쓰기를 지키려고)");
G.시험용통바꾸기(통);
// 서버가 이미 열려 DB 에 새 글이 써졌다고 흉내 — 로컬 DB 는 바뀌었는데 버킷은 옛 판 그대로.
fs.writeFileSync(config.paths.dbFile, "DB-더쓴것");
통.받은이름들 = [];
await G.downloadState();
참("로컬 DB 는 그대로(버킷의 옛 DB 로 덮이지 않았다)", fs.readFileSync(config.paths.dbFile, "utf8") === "DB-더쓴것");
참("DB 를 다시 내려받지 않았다", !통.받은이름들.includes(dbRel));
참("로그인 폴더는 받았다", fs.readFileSync(path.join(config.paths.dataDir, "home/.codex/auth.json"), "utf8") === "로그인");

console.log("\n④ Claude CLI 가 쌓는 캐시(세션 기록·스냅샷 등)는 받지 않는다");
const 통2 = new 가짜통();
통2.넣기(dbRel, "DB");
통2.넣기("home/.claude/settings.json", "설정");
통2.넣기("home/.claude/projects/abc/0001.jsonl", "대화 기록 ".repeat(500));
통2.넣기("home/.claude/shell-snapshots/snap-1.sh", "echo hi");
통2.넣기("home/.claude/statsig/cache-1", "{}");
통2.넣기("home/.claude/todos/t1.json", "[]");
통2.넣기("home/.claude/ide/lock", "1");
통2.넣기("home/.claude/backups/old.json", "{}");
G.시험용통바꾸기(통2);
await G.downloadEssentialState();
await G.downloadState();
const home루트 = path.join(config.paths.dataDir, "home/.claude");
참("로그인에 쓰는 settings.json 은 받는다", fs.existsSync(path.join(home루트, "settings.json")));
참("대화 기록(projects/)은 안 받는다", !fs.existsSync(path.join(home루트, "projects")));
참("bash 스냅샷은 안 받는다", !fs.existsSync(path.join(home루트, "shell-snapshots")));
참("사용량 캐시(statsig/)는 안 받는다", !fs.existsSync(path.join(home루트, "statsig")));
참("할 일 캐시(todos/)는 안 받는다", !fs.existsSync(path.join(home루트, "todos")));
참("ide/ 는 안 받는다", !fs.existsSync(path.join(home루트, "ide")));
참("백업은 전부터 안 받았다", !fs.existsSync(path.join(home루트, "backups")));

console.log("\n⑤ uploadState — 로컬에 쌓인 캐시 폴더는 훑지도(readdir) 않고 건너뛴다");
// 이 시험은 DB 올리기 자체를 보려는 게 아니다 — ③에서 글자만 써 넣은 가짜 DB 라
// 진짜 SQLite 로 뜨려 하면 알아듣기 어려운 오류 로그만 남는다. 지우고 본다.
fs.rmSync(config.paths.dbFile, { force: true });
fs.mkdirSync(path.join(home루트, "projects", "xyz"), { recursive: true });
fs.writeFileSync(path.join(home루트, "projects", "xyz", "0002.jsonl"), "또 다른 대화 기록");
fs.writeFileSync(path.join(home루트, "settings.json"), "설정-바뀜");
await G.uploadState();
참("캐시 폴더 안의 새 파일은 버킷에 안 올라갔다", !통2.글.has("home/.claude/projects/xyz/0002.jsonl"));
참("설정 파일(로그인에 쓰는 것)은 바뀐 대로 올라갔다", 통2.글.get("home/.claude/settings.json")?.내용 === "설정-바뀜");

G.시험용통바꾸기(undefined);
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
