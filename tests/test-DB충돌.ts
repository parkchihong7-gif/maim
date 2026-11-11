/**
 * **인스턴스 둘이 동시에 떠서 서로 DB를 덮어쓰지 않는지** 시험한다.
 *
 *     npx tsx tests/test-DB충돌.ts
 *
 * 실제로 겪었다 — 밤사이 무료 이미지 키가 초기화됐다. 로그인 파일에는
 * «내가 알던 판일 때만 덮는다» 검사가 있었는데 DB 에는 없어서, 옛 DB를 들고
 * 있던 인스턴스가 60초 주기로 묻지도 않고 제 DB를 덮어 올려 새로 저장된
 * 설정이 사라졌다. 가짜 저장통으로 그 순서를 그대로 재연한다.
 *
 * 한 프로세스 안에서 "인스턴스 둘"을 재연하려고, 각 인스턴스가 올리기
 * 바로 전에 `시험용알던판적기()`로 그 인스턴스가 **마지막으로 안 판**을
 * 강제로 되돌려 둔다(실제로는 서로 다른 컨테이너의 독립된 메모리라
 * 저절로 이렇게 갈린다).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-dbconflict-"));
process.env.DATA_DIR = 임시;

const G = await import("../src/persistence/gcsState.js");
const { config } = await import("../src/config.js");

/** 판 번호(generation)와 «이 판일 때만» 조건까지 흉내 낸 가짜 저장통. */
class 가짜통 {
  글 = new Map<string, { 내용: string; gen: number }>();
  세대 = 100;
  올린횟수 = 0;
  넣기(이름: string, 내용: string) { this.글.set(이름, { 내용, gen: ++this.세대 }); }
  private 파일꼴(이름: string) {
    const 통 = this;
    return {
      name: 이름,
      get metadata() { return { generation: String(통.글.get(이름)?.gen ?? "") }; },
      async download({ destination }: { destination: string }) {
        const 것 = 통.글.get(이름);
        if (!것) throw Object.assign(new Error("없음"), { code: 404 });
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
    const 지금 = this.글.get(opts.destination);
    const 조건 = opts.preconditionOpts?.ifGenerationMatch;
    if (조건 !== undefined && (지금?.gen ?? 0) !== 조건) {
      throw Object.assign(new Error("precondition failed"), { code: 412 });
    }
    this.올린횟수++;
    this.넣기(opts.destination, fs.readFileSync(로컬, "utf8"));
    return [this.파일꼴(opts.destination)];
  }
}

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

const dbRel = "app.db";
const 통 = new 가짜통() as unknown as Parameters<typeof G.DB올리기>[0];
const 스냅 = path.join(임시, "snap.db");

function 올려보기(내용: string) {
  fs.writeFileSync(config.paths.dbFile, 내용);
  fs.writeFileSync(스냅, 내용);
  return G.DB올리기(통, 스냅, dbRel);
}

console.log("\n① A와 B 둘 다 똑같이 v1을 내려받아 안다(버킷에 처음 올리는 쪽 — ifGenerationMatch: 0)");
await 올려보기("DB-v1(이미지키 없음)");
참("v1이 버킷에 올라갔다", (통 as unknown as 가짜통).글.get(dbRel)?.내용 === "DB-v1(이미지키 없음)");

console.log("\n② B — 사장님이 이미지 키를 저장한 뒤, 먼저 60초 주기로 올린다(제가 아는 v1 판과 버킷이 맞음 → 성공)");
await 올려보기("DB-v2(이미지키 저장됨)");
참("버킷이 B의 v2로 바뀌었다", (통 as unknown as 가짜통).글.get(dbRel)?.내용 === "DB-v2(이미지키 저장됨)");

console.log("\n③ A — B가 올린 걸 모른 채, 자긴 여전히 v1 판을 안다고 믿고(강제로 되돌림) 제 걸 올리려 한다");
G.시험용알던판적기(dbRel, "101", config.paths.dbFile); // A의 독립된 메모리를 재연 — 아직 v1 판(=101)인 줄 안다
const 전 = (통 as unknown as 가짜통).올린횟수;
await 올려보기("DB-v1(이미지키 없음)-A가 또 올림");
참("버킷은 B의 v2가 그대로 — A의 옛 DB로 덮이지 않았다(이미지 키가 안 사라진다)",
  (통 as unknown as 가짜통).글.get(dbRel)?.내용 === "DB-v2(이미지키 저장됨)");
참("A의 올리기는 충돌로 조용히 막혔다(실제로 올리진 않았다)",
  (통 as unknown as 가짜통).올린횟수 === 전);

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
