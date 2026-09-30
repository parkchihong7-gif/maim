/**
 * **새로 한 AI 로그인이 옛 서버에게 덮이지 않는지** 시험한다.
 *
 *     npx tsx tests/test-로그인보존.ts
 *
 * 실제로 겪었다 — Codex 가 401 Unauthorized 로 멈췄다. 서버가 60초마다
 * 로컬 파일을 전부 버킷에 도로 올려서, 사장님이 새로 올린 로그인이 옛
 * 것으로 덮였다. 가짜 저장통으로 그 순서를 그대로 재연한다.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const 임시 = fs.mkdtempSync(path.join(os.tmpdir(), "maim-login-"));
process.env.DATA_DIR = 임시;

const G = await import("../src/persistence/gcsState.js");
const { config } = await import("../src/config.js");
const { 멈춘까닭 } = await import("../src/ai/run.js");
const { 엔진 } = await import("../src/ai/engines.js");

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
const 로그인 = "home/.codex/auth.json";
const 로컬 = path.join(config.paths.dataDir, 로그인);
const 통 = new 가짜통();
G.시험용통바꾸기(통);
const 버킷값 = () => 통.글.get(로그인)?.내용;
const 로컬값 = () => fs.readFileSync(로컬, "utf8");

console.log("\n① 서버가 켜질 때 옛 로그인을 받는다");
통.넣기(로그인, "옛-로그인");
await G.downloadState();
참("로컬에 옛 로그인", 로컬값() === "옛-로그인");

console.log("\n② 사장님이 새로 로그인해 저장통에 올린다 → 60초 업로드가 덮지 않는다");
통.넣기(로그인, "새-로그인");
const 전 = 통.올린횟수;
await G.uploadState();
참("버킷의 새 로그인이 그대로", 버킷값() === "새-로그인");
참("바뀌지 않은 로컬 파일은 아예 안 올렸다", 통.올린횟수 === 전);

console.log("\n③ AI 를 부르기 전에 저장통과 맞추면, 다시 켜지 않아도 새 로그인을 쓴다");
const 받은수 = await G.로그인맞추기(".codex", true);
참("새 로그인 1개를 받았다", 받은수 === 1);
참("로컬도 새 로그인", 로컬값() === "새-로그인");

console.log("\n④ AI 도구가 표를 갱신하면(로컬이 바뀜) 그건 올린다");
await new Promise((r) => setTimeout(r, 15));
fs.writeFileSync(로컬, "새-로그인-갱신");
await G.uploadState();
참("버킷에 갱신된 표", 버킷값() === "새-로그인-갱신");

console.log("\n⑤ 옛 판을 들고 있던 서버가 제 것을 올리려 하면 버킷을 믿는다");
통.넣기(로그인, "또-새로-로그인");            // 그사이 사람이 또 올렸다
await new Promise((r) => setTimeout(r, 15));
fs.writeFileSync(로컬, "옛-서버의-갱신");      // 이 서버는 모른 채 제 것을 바꿨다
await G.uploadState();
참("버킷은 사람이 올린 것 그대로", 버킷값() === "또-새로-로그인");
참("로컬도 버킷 것으로 맞췄다", 로컬값() === "또-새로-로그인");

console.log("\n⑥ 401 이면 «로그인이 풀렸다» 고 사람 말로 알려 준다");
const 실제로그 = `WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "/tmp"
Reading additional input from stdin...
2026-09-30T07:59:07.920499Z ERROR codex_api::endpoint::responses_websocket: failed to connect to websocket: HTTP error: 401 Unauthorized, url: wss://api.openai.com/v1/responses`;
const 말 = 멈춘까닭(엔진("codex"), 1, 실제로그);
참("로그인이 풀렸다고 말한다", 말.includes("로그인이 풀렸습니다"));
참("무엇을 하면 되는지 (codex login · 연결 테스트)", 말.includes("codex login") && 말.includes("연결 테스트"));
참("WARNING 줄은 덜어 냈다", !말.includes("PATH aliases"));
참("다른 오류는 그대로 보여 준다", 멈춘까닭(엔진("codex"), 2, "disk full").includes("disk full"));

G.시험용통바꾸기(undefined);
fs.rmSync(임시, { recursive: true, force: true });
console.log(틀린것 === 0 ? "\n전부 통과했습니다.\n" : `\n${틀린것}건 틀렸습니다.\n`);
process.exit(틀린것 === 0 ? 0 : 1);
