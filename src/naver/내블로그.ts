/**
 * **내 블로그의 공개 글 가져오기** — 🎨 내 블로그 분석에서 사람이 [불러와 분석하기] 를 누를 때만.
 *
 *   목록  https://rss.blog.naver.com/{아이디}.xml   (공개 RSS — 제목·요약·카테고리·날짜, 보통 최근 50개)
 *   본문  https://blog.naver.com/PostView.naver?blogId=…&logNo=…   (최근 몇 편만, 글자만 뽑는다)
 *
 * 키도 로그인도 쓰지 않는다. 공개 글만 읽고, **원문은 저장하지 않는다** — 분석에 한 번 쓰고 버린다.
 * 본문을 못 가져오면 RSS 요약만으로 분석한다. 실패해도 예외 대신 `{ ok:false, why }`.
 */
import { 가짜모드, 가짜자료 } from "./키.js";
import { 태그빼기 } from "./블로그검색.js";

export interface 내글 { title: string; category: string; date: string; summary: string; body: string; logNo: string }
export type 내글결과 = { ok: true; blogId: string; posts: 내글[]; bodyCount: number } | { ok: false; why: string };

/** 목록에서 몇 편까지 보나, 본문은 몇 편까지 가져오나. */
export const 최대글 = 30;
export const 본문편수 = 8;
const 한번한도ms = 8_000;
const 본문전체한도ms = 40_000;

/** blog.naver.com/abc, m.blog.naver.com/abc/123, PostList.naver?blogId=abc, abc → abc */
export function 블로그아이디(입력: string): string | null {
  const 말 = String(입력 ?? "").trim();
  if (!말) return null;
  const q = 말.match(/[?&]blogId=([A-Za-z0-9_-]{2,40})/);
  if (q) return q[1];
  const u = 말.match(/(?:^|\/\/)(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_-]{2,40})(?:[/?#]|$)/);
  if (u && !/\.naver$/i.test(u[1])) return u[1];
  if (/^[A-Za-z0-9_-]{2,40}$/.test(말)) return 말;
  return null;
}

const 엔티티 = (s: string) => 태그빼기(s.replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))));
const 칸 = (조각: string, 이름: string) => {
  const m = 조각.match(new RegExp(`<${이름}[^>]*>([\\s\\S]*?)</${이름}>`));
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim() : "";
};

export function RSS읽기(xml: string): 내글[] {
  const 글들: 내글[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const 조각 = m[1];
    const 주소 = 칸(조각, "link");
    const 날 = new Date(칸(조각, "pubDate"));
    글들.push({
      title: 엔티티(칸(조각, "title")),
      category: 엔티티(칸(조각, "category")),
      date: Number.isNaN(날.getTime()) ? "" : 날.toISOString().slice(0, 10),
      summary: 엔티티(칸(조각, "description")).replace(/\s+/g, " ").slice(0, 400),
      body: "",
      logNo: (주소.match(/\/(\d{6,})(?:[?#]|$)/) ?? 주소.match(/logNo=(\d+)/) ?? [])[1] ?? "",
    });
    if (글들.length >= 최대글) break;
  }
  return 글들;
}

/** PostView HTML 에서 본문 글자만. 문단은 줄바꿈으로 남긴다. */
export function 본문뽑기(html: string): string {
  const 시작 = html.indexOf("se-main-container");
  let 몸 = 시작 >= 0 ? html.slice(시작) : (html.match(/id="postViewArea"[\s\S]*/)?.[0] ?? "");
  if (!몸) return "";
  const 끝 = 몸.search(/se-viewer-footer|post_footer_contents|class="post-btn/);
  if (끝 > 0) 몸 = 몸.slice(0, Math.max(0, 몸.lastIndexOf("<", 끝)));  // 바닥글 태그가 열리는 곳에서 자른다
  몸 = 몸.replace(/<(script|style)[\s\S]*?<\/\1>/g, "")
    .replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|div|li|h\d)>/g, "\n");
  return 엔티티(몸.replace(/^[^>]*>/, "")).split("\n").map((x) => x.replace(/[​\s]+/g, " ").trim())
    .filter(Boolean).join("\n").slice(0, 6000);
}

async function 가져오기(주소: string): Promise<string | null> {
  try {
    const res = await fetch(주소, { headers: { "User-Agent": "Mozilla/5.0 (maim blog style reader)" }, signal: AbortSignal.timeout(한번한도ms) });
    return res.ok ? await res.text() : null;
  } catch { return null; }
}

export async function 내글가져오기(입력: string): Promise<내글결과> {
  const blogId = 블로그아이디(입력);
  if (!blogId) return { ok: false, why: "블로그 주소를 알아보지 못했습니다. blog.naver.com/아이디 꼴로 넣어 주세요." };

  if (가짜모드()) {
    const 자료 = 가짜자료()?.myblog;
    if (!자료 || 자료.fail) return { ok: false, why: String(자료?.fail ?? "가짜 모드: 내 블로그 자료가 없습니다.") };
    const posts = (자료.posts as 내글[]).slice(0, 최대글).map((p, i) => ({ ...p, logNo: p.logNo || String(i + 1) }));
    return { ok: true, blogId, posts, bodyCount: posts.filter((p) => p.body).length };
  }

  const xml = await 가져오기(`https://rss.blog.naver.com/${blogId}.xml`);
  if (!xml || !xml.includes("<item>")) {
    return { ok: false, why: "공개 글 목록(RSS)을 받지 못했습니다. 블로그 아이디가 맞는지, 글이 «전체 공개» 인지 확인해 주세요." };
  }
  const posts = RSS읽기(xml);
  if (posts.length === 0) return { ok: false, why: "공개 글이 없습니다." };

  // 본문은 최근 몇 편만, 셋씩 나눠서, 전체 시간을 못 박아서.
  const 마감 = Date.now() + 본문전체한도ms;
  const 대상 = posts.filter((p) => p.logNo).slice(0, 본문편수);
  for (let i = 0; i < 대상.length && Date.now() < 마감; i += 3) {
    await Promise.all(대상.slice(i, i + 3).map(async (p) => {
      const html = await 가져오기(`https://blog.naver.com/PostView.naver?blogId=${blogId}&logNo=${p.logNo}&redirect=Dlog&widgetTypeCall=true`);
      if (html) p.body = 본문뽑기(html);
    }));
  }
  return { ok: true, blogId, posts, bodyCount: posts.filter((p) => p.body.length >= 200).length };
}

export interface 블로그숫자 {
  글수: number; 본문수: number; 기간: string; 주당: number | null;
  카테고리: { 이름: string; 수: number }[];
  제목평균: number; 제목숫자: number; 제목물음: number;
  본문평균: number | null; 문단평균: number | null; 요체: number | null; 이모지: number | null;
}

const 비율 = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

/** AI 없이 셈하는 숫자. 진단의 «근거» 로 화면에 그대로 보인다. */
export function 숫자세기(posts: 내글[]): 블로그숫자 {
  const 날들 = posts.map((p) => p.date).filter(Boolean).sort();
  const 일수 = 날들.length >= 2 ? (Date.parse(날들[날들.length - 1]) - Date.parse(날들[0])) / 86_400_000 : 0;
  const 카 = new Map<string, number>();
  for (const p of posts) if (p.category) 카.set(p.category, (카.get(p.category) ?? 0) + 1);
  const 본문들 = posts.map((p) => p.body).filter((b) => b.length >= 200);
  const 문장끝 = 본문들.join("\n").match(/[가-힣](요|다)[.!?~]?(?=\s|$)/gm) ?? [];
  const 문단들 = 본문들.flatMap((b) => b.split("\n")).filter((x) => x.length > 0);
  return {
    글수: posts.length,
    본문수: 본문들.length,
    기간: 날들.length ? `${날들[0]} ~ ${날들[날들.length - 1]}` : "",
    주당: 일수 >= 7 ? Math.round((posts.length / (일수 / 7)) * 10) / 10 : null,
    카테고리: [...카].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([이름, 수]) => ({ 이름, 수 })),
    제목평균: posts.length ? Math.round(posts.reduce((s, p) => s + [...p.title].length, 0) / posts.length) : 0,
    제목숫자: 비율(posts.filter((p) => /\d/.test(p.title)).length, posts.length),
    제목물음: 비율(posts.filter((p) => /\?/.test(p.title)).length, posts.length),
    본문평균: 본문들.length ? Math.round(본문들.reduce((s, b) => s + b.replace(/\s/g, "").length, 0) / 본문들.length) : null,
    문단평균: 문단들.length ? Math.round(문단들.reduce((s, x) => s + x.length, 0) / 문단들.length) : null,
    요체: 문장끝.length ? 비율(문장끝.filter((x) => /요/.test(x)).length, 문장끝.length) : null,
    이모지: 본문들.length ? 비율(본문들.filter((b) => /\p{Extended_Pictographic}/u.test(b)).length, 본문들.length) : null,
  };
}
