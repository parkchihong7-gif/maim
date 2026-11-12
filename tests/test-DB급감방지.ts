/**
 * **DB가 갑자기 뚝 떨어지게 작아지면 올리지 않는지** 시험한다.
 *
 *     npx tsx tests/test-DB급감방지.ts
 *
 * 2026-11-11에 실제로 겪었다 — 멀쩡하던 DB(4.58MB)가 60초 뒤 올린 판에서
 * 0바이트로 바뀌어 올라갔고(메모리 부족으로 쓰다 잘린 것으로 추정), 그 뒤
 * 서버가 5시간 넘게 멈췄다가 빈 DB로 새로 시작하면서 몇 달치 글·카테고리가
 * 통째로 사라졌다(소프트 삭제 덕에 복구는 했다). test-DB충돌.ts가 다루는
 * "다른 인스턴스가 먼저 올렸다"는 경우와 달리, 이건 **충돌이 아니라 이
 * 인스턴스 혼자서 깨진 파일을 그대로 올리려는 경우**라 판 번호 검사만으론
 * 못 막는다 — 크기를 직접 비교하는 이 안전장치가 그 자리를 막는다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-dbshrink-"));
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
  // DB올리기()는 적어두기()에서 config.paths.dbFile 의 크기·수정시각을 알던판에
  // 기록한다(스냅샷 자체가 아니라, 실제로 계속 쓰이는 진짜 DB 파일을 본다) —
  // 그래서 시험에서도 스냅샷과 함께 이 파일을 같은 내용으로 맞춰 둬야 한다.
  fs.writeFileSync(config.paths.dbFile, 내용);
  fs.writeFileSync(스냅, 내용);
  return G.DB올리기(통, 스냅, dbRel);
}

console.log("\n① 정상적으로 큰 DB를 먼저 올린다(4.58MB 흉내 — 실제로는 글자 수로 대신한다)");
const 정상내용 = "x".repeat(5_000_000);
await 올려보기(정상내용);
참("정상 DB가 버킷에 올라갔다", (통 as unknown as 가짜통).글.get(dbRel)?.내용.length === 5_000_000);

console.log("\n② 60초 뒤, 같은 인스턴스가(충돌 없이) 0바이트짜리 깨진 스냅샷을 올리려 한다");
const 전 = (통 as unknown as 가짜통).올린횟수;
await 올려보기(""); // 0바이트
참("버킷은 정상 DB 그대로 — 0바이트로 덮이지 않았다", (통 as unknown as 가짜통).글.get(dbRel)?.내용.length === 5_000_000);
참("올리기 자체를 시도하지 않았다(올린횟수 안 늘어남)", (통 as unknown as 가짜통).올린횟수 === 전);

console.log("\n③ 정상적인 소폭 변화(글 몇 편 늘어난 정도)는 그대로 올라간다");
const 전2 = (통 as unknown as 가짜통).올린횟수;
await 올려보기("x".repeat(5_200_000));
참("약간 커진 정상 변화는 올라간다", (통 as unknown as 가짜통).글.get(dbRel)?.내용.length === 5_200_000);
참("실제로 올리기를 시도했다", (통 as unknown as 가짜통).올린횟수 === 전2 + 1);

fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
