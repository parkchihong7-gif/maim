/**
 * **저장통에 이미 올라간 생성 이미지는, 오래 안 바뀌면 로컬에서 지우는지** 시험한다.
 *
 *     npx tsx tests/test-생성이미지로컬정리.ts
 *
 * 2026-11-11 DB 사고(메모리 부족으로 쓰다 잘림) 뒤 추가 — generated/ 가 로컬
 * (컨테이너 메모리를 깎아 쓰는 /tmp)에 끝없이 쌓이는 것도 같은 위험 요인이다.
 * 이미 올라간 게 확인되고 6시간 넘게 안 바뀐 파일만 지우고, 아직 안 올라갔거나
 * 최근에 바뀐 파일·로그인 파일은 그대로 두는지까지 확인한다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-genclean-"));
process.env.DATA_DIR = 임시;

const G = await import("../src/persistence/gcsState.js");
const { config } = await import("../src/config.js");

class 가짜통 {
  글 = new Map<string, { 내용: string; gen: number }>();
  세대 = 100;
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
  async upload(로컬: string, opts: { destination: string }) {
    this.넣기(opts.destination, fs.readFileSync(로컬, "utf8"));
    return [this.파일꼴(opts.destination)];
  }
}

let 틀린것 = 0;
function 참(말: string, 값: boolean) {
  if (값) console.log(`   ✅ ${말}`);
  else { console.log(`   ❌ ${말}`); 틀린것 += 1; }
}

const 통 = new 가짜통();
G.시험용통바꾸기(통);

const root = config.paths.dataDir;
const 사진 = path.join(root, "generated", "123", "1.jpg");
fs.mkdirSync(path.dirname(사진), { recursive: true });
fs.writeFileSync(사진, "사진내용");
// 7시간 전에 찍힌(=그 뒤로 안 바뀐) 사진이라고 가정 — 수정 시각을 미리 되돌려 둔다.
const 일곱시간전 = new Date(Date.now() - 7 * 60 * 60 * 1000);
fs.utimesSync(사진, 일곱시간전, 일곱시간전);

console.log("\n① 처음 올리기 — 저장통에 올라간다(파일 내용은 그대로, 시각만 과거)");
await G.uploadState();
참("사진이 버킷에 올라갔다", 통.글.has("generated/123/1.jpg"));
참("방금 올린 거라 로컬엔 아직 남아있다", fs.existsSync(사진));

console.log("\n② 한번 더 돌면(이번엔 바뀐 게 없음) — 오래 안 바뀐 걸 확인하고 로컬에서 지운다");
await G.uploadState();
참("오래 안 바뀐 생성 이미지는 로컬에서 지워진다", !fs.existsSync(사진));
참("버킷의 내용은 그대로 남아있다(지운 건 로컬뿐)", 통.글.get("generated/123/1.jpg")?.내용 === "사진내용");

console.log("\n③ 로그인 파일은 아무리 오래돼도(안 바뀌어도) 이 정리 대상이 아니다");
const 로그인 = path.join(root, "home", ".codex", "auth.json");
fs.mkdirSync(path.dirname(로그인), { recursive: true });
fs.writeFileSync(로그인, "로그인내용");
fs.utimesSync(로그인, 일곱시간전, 일곱시간전);
await G.uploadState(); // 올리기
await G.uploadState(); // 안 바뀐 걸 확인하는 두번째 돌기 — 그래도 지우면 안 된다
참("오래된 로그인 파일은 로컬에 그대로 남는다", fs.existsSync(로그인));

G.시험용통바꾸기(undefined);
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
