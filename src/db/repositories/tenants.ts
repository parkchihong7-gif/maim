/**
 * **체험 회원 한 사람 몫을 통째로 지우는 곳.**
 *
 * 왜 필요한가
 *   체험 키는 기간이 짧다(기본 하루). 기간이 끝났거나 주인이 중간에 끊으면,
 *   그 사람이 이 서버에 쌓아 둔 것은 남아 있을 이유가 없다. 남겨 두면
 *   남의 글을 계속 들고 있는 셈이고, 서버도 쓸데없이 무거워진다.
 *
 * 되돌릴 수 없다
 *   지우면 끝이다. 내보내기도 두지 않았다 — 하루짜리 맛보기에 붙들어 둘
 *   것이 없다는 판단이다. 그래서 **주인 자리는 아예 못 지우게** 막아 둔다.
 *   빈 owner_key 하나가 실수로 넘어오면 서버의 글이 전부 날아간다.
 */

import fs from "node:fs";
import path from "node:path";
import { getDb } from "../index.js";
import { config } from "../../config.js";

export interface 자리요약 {
  ownerKey: string;
  holderName: string;
  deviceCount: number;
  categories: number;
  posts: number;
  lastSeen: string | null;
}

/** 지금 이 서버에 자리를 잡고 있는 체험 회원들. 주인 자리는 빼고 센다. */
export function listTenants(): 자리요약[] {
  const db = getDb();
  return db.prepare(`
    SELECT
      s.key1                              AS ownerKey,
      MAX(s.holder_name)                  AS holderName,
      COUNT(DISTINCT s.token)             AS deviceCount,
      MAX(s.checked_at)                   AS lastSeen,
      (SELECT COUNT(*) FROM categories c WHERE c.owner_key = s.key1) AS categories,
      (SELECT COUNT(*) FROM posts p      WHERE p.owner_key = s.key1) AS posts
    FROM keyserver_sessions s
    WHERE s.key1 <> ''
    GROUP BY s.key1
    ORDER BY lastSeen DESC
  `).all() as 자리요약[];
}

export interface 지운결과 {
  posts: number;
  categories: number;
  images: number;
  sessions: number;
  files: number;
}

/**
 * 1차키 하나가 이 서버에 남긴 것을 전부 지운다.
 *
 * 순서가 있다. 이미지 기록 → 글 → 카테고리. 글이 카테고리를 참조하므로
 * (`foreign_keys = ON`) 거꾸로 하면 지워지지 않는다.
 */
export function purgeTenant(ownerKey: string): 지운결과 {
  const 키 = (ownerKey || "").trim();
  // **주인 자리는 못 지운다.** 빈 값이 실수로 흘러들면 서버의 글이 전부
  // 날아간다. 여기서 막지 않으면 막을 곳이 없다.
  if (!키) {
    throw new Error("주인 자리(owner_key='')는 지울 수 없습니다. 지울 1차키를 넣어 주세요.");
  }

  const db = getDb();

  // 파일은 트랜잭션 밖이다. 먼저 어느 글의 것인지 받아 둔다.
  const 글번호 = (db.prepare("SELECT id FROM posts WHERE owner_key = ?").all(키) as { id: number }[])
    .map((r) => r.id);

  let 결과: 지운결과 = { posts: 0, categories: 0, images: 0, sessions: 0, files: 0 };

  const 지우기 = db.transaction(() => {
    결과.images = db.prepare(
      "DELETE FROM image_downloads WHERE post_id IN (SELECT id FROM posts WHERE owner_key = ?)",
    ).run(키).changes;
    결과.posts = db.prepare("DELETE FROM posts WHERE owner_key = ?").run(키).changes;
    결과.categories = db.prepare("DELETE FROM categories WHERE owner_key = ?").run(키).changes;
    결과.sessions = db.prepare("DELETE FROM keyserver_sessions WHERE key1 = ?").run(키).changes;
  });
  지우기();

  // 받아 둔 글번호로 이미지 폴더를 치운다. 줄만 지우고 파일을 두면 디스크가
  // 계속 찬다 — Cloud Run 의 /tmp 는 메모리를 깎아 쓰는 자리라 더 아프다.
  for (const id of 글번호) {
    const 폴더 = path.join(config.paths.generatedDir, String(id));
    try {
      if (fs.existsSync(폴더)) { fs.rmSync(폴더, { recursive: true, force: true }); 결과.files++; }
    } catch (탈) {
      console.error(`[tenants] ${폴더} 를 지우지 못했습니다:`, (탈 as Error).message);
    }
  }

  return 결과;
}

/** 체험 회원이 **오늘** 만든 글의 수. 하루 상한을 세는 데 쓴다. */
export function todayPostCount(ownerKey: string): number {
  if (!ownerKey) return 0;
  const row = getDb().prepare(
    `SELECT COUNT(*) AS n FROM posts
     WHERE owner_key = ? AND date(created_at, 'localtime') = date('now', 'localtime')`,
  ).get(ownerKey) as { n: number };
  return row.n;
}


/**
 * **체험으로 들어오신 분의 자리를 차려 둔다.**
 *
 * 칸막이를 친 뒤로, 체험 키로 들어가면 화면이 **텅 비어 있다.** 남의
 * 카테고리가 안 보이는 것은 맞지만, 맛보러 오신 분 입장에서는 «아무것도
 * 없네, 고장인가» 다. 맛보기가 아예 성립하지 않는다.
 *
 * 그래서 처음 들어오실 때 카테고리 셋을 깔아 둔다. 바로 [지금 생성] 을
 * 눌러 보실 수 있다.
 *
 * **이미 뭔가 있으면 건드리지 않는다.** 두 번째 기기로 들어오셨거나 이미
 * 만들어 쓰고 계신 분의 자리에 남의 카테고리를 끼워 넣으면 안 된다.
 */
const 맛보기_카테고리 = [
  { name: "부동산 이야기",
    hint: "전월세·매매·청약처럼 사람들이 실제로 검색하는 부동산 주제. "
        + "법이나 제도를 다룰 때는 시행일과 달라진 점을 분명히 적는다." },
  { name: "생활 절세",
    hint: "연말정산·종합소득세·부가세처럼 때가 되면 다들 찾는 세금 주제. "
        + "숫자는 반드시 기준 연도를 함께 적는다." },
  { name: "일상 기록",
    hint: "겪은 일을 담담하게 적는 글. 정보보다 사람 냄새가 앞서는 쪽." },
];

export function 체험자리_차려주기(ownerKey: string): number {
  const 키 = (ownerKey || "").trim();
  if (!키) return 0;   // 주인 자리에는 손대지 않는다

  const db = getDb();
  const 이미 = (db.prepare("SELECT COUNT(*) AS n FROM categories WHERE owner_key = ?")
    .get(키) as { n: number }).n;
  if (이미 > 0) return 0;

  const 깔기 = db.transaction(() => {
    const 넣기 = db.prepare(
      `INSERT INTO categories (name, requires_search, prompt_hint, active, daily_count, owner_key)
       VALUES (?, 0, ?, 1, 1, ?)`);
    for (const c of 맛보기_카테고리) 넣기.run(c.name, c.hint, 키);
  });
  깔기();
  console.log(`[체험] ${키} 의 자리에 카테고리 ${맛보기_카테고리.length}개를 깔았습니다.`);
  return 맛보기_카테고리.length;
}
