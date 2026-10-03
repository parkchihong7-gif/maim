// 사장님 시험(10-03): Gemini 402 «선불 크레딧 바닥» 이 영어 원문 그대로 나왔다 — 사람 말로 바꿔 알린다.
import assert from "node:assert/strict";
import { 멈춘까닭 } from "../src/ai/run.js";
import { ENGINES } from "../src/ai/engines.js";

const g = ENGINES.gemini;
const 돈 = 멈춘까닭(g, 146, `Ripgrep is not available.\n_ApiError: {"error":{"code":402,"message":"Your prepayment credits are depleted.","status":"RESOURCE_EXHAUSTED"}}`);
assert.match(돈, /크레딧/);
assert.match(돈, /aistudio\.google\.com\/apikey/);
assert.match(돈, /ai\.studio\/projects/);
assert.match(돈, /\[원문\].*402/);
assert.doesNotMatch(돈, /사용 한도/);

const 한도 = 멈춘까닭(g, 1, `{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Quota exceeded"}}`);
assert.match(한도, /사용 한도/);

const 기타 = 멈춘까닭(g, 2, "something else");
assert.match(기타, /2 로 멈췄습니다/);
console.log("✅ 멈춘 까닭 — 402·429 를 사람 말로");
