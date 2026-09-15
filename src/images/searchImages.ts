import fs from "node:fs";
import path from "node:path";
import { getUnsplashKey, getPexelsKey, getPixabayKey } from "../db/repositories/settings.js";

interface UnsplashSearchResponse {
  results: { id: string; urls: { regular: string }; links: { html: string } }[];
}

interface PexelsSearchResponse {
  photos: { id: number; src: { large: string }; url: string }[];
}

interface PixabaySearchResponse {
  hits: { id: number; largeImageURL: string; pageURL: string }[];
}

/** 검색 결과 1건 — 다운로드 URL과 함께, 나중에 출처를 증빙할 수 있는 정보를 담는다. */
export interface ImageCandidate {
  url: string;
  sourceSite: "unsplash" | "pexels" | "pixabay";
  sourceId: string;
  sourceUrl: string;
  license: string;
}

async function searchUnsplash(query: string, count: number, page: number): Promise<ImageCandidate[]> {
  const key = getUnsplashKey();
  if (!key) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${key}` },
  });
  if (!res.ok) throw new Error(`Unsplash 검색 실패: HTTP ${res.status}`);
  const data = (await res.json()) as UnsplashSearchResponse;
  return (data.results ?? []).map((r) => ({
    url: r.urls.regular,
    sourceSite: "unsplash" as const,
    sourceId: r.id,
    sourceUrl: r.links.html,
    license: "Unsplash License (unsplash.com/license)",
  }));
}

async function searchPexels(query: string, count: number, page: number): Promise<ImageCandidate[]> {
  const key = getPexelsKey();
  if (!key) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}&page=${page}`;
  const res = await fetch(url, {
    headers: { Authorization: key },
  });
  if (!res.ok) throw new Error(`Pexels 검색 실패: HTTP ${res.status}`);
  const data = (await res.json()) as PexelsSearchResponse;
  return (data.photos ?? []).map((p) => ({
    url: p.src.large,
    sourceSite: "pexels" as const,
    sourceId: String(p.id),
    sourceUrl: p.url,
    license: "Pexels License (pexels.com/license)",
  }));
}

async function searchPixabay(query: string, count: number, page: number): Promise<ImageCandidate[]> {
  const key = getPixabayKey();
  if (!key) return [];
  // Pixabay는 per_page가 최소 3 이상이어야 에러 없이 응답한다.
  const perPage = Math.max(count, 3);
  const url = `https://pixabay.com/api/?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&image_type=photo&per_page=${perPage}&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay 검색 실패: HTTP ${res.status}`);
  const data = (await res.json()) as PixabaySearchResponse;
  return (data.hits ?? []).map((h) => ({
    url: h.largeImageURL,
    sourceSite: "pixabay" as const,
    sourceId: String(h.id),
    sourceUrl: h.pageURL,
    license: "Pixabay Content License (pixabay.com/service/license/)",
  }));
}

/** 세 무료 소스(Unsplash/Pexels/Pixabay)를 동시에 검색해서 결과를 합친다.
 * 키가 없는 소스는 조용히 건너뛰고(그 소스만 0건), 한 소스가 에러(잘못된 키,
 * 요청 한도 초과 등)여도 다른 소스 결과는 그대로 살아남는다 — 소스가 하나
 * 늘어난 만큼 "셋 다 동시에 실패"할 확률이 낮아져 이미지 확보 성공률이 올라간다. */
async function fetchImageCandidates(query: string, count: number, page: number): Promise<ImageCandidate[]> {
  const perSource = Math.ceil(count / 3);
  const [unsplash, pexels, pixabay] = await Promise.all([
    searchUnsplash(query, perSource, page).catch((err) => {
      console.warn("Unsplash 검색 실패:", (err as Error).message);
      return [];
    }),
    searchPexels(query, perSource, page).catch((err) => {
      console.warn("Pexels 검색 실패:", (err as Error).message);
      return [];
    }),
    searchPixabay(query, perSource, page).catch((err) => {
      console.warn("Pixabay 검색 실패:", (err as Error).message);
      return [];
    }),
  ]);
  return [...unsplash, ...pexels, ...pixabay].slice(0, count);
}

async function downloadTo(url: string, filePath: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buf);
    return true;
  } catch (err) {
    console.warn(`이미지 다운로드 실패 (${url}):`, (err as Error).message);
    return false;
  }
}

/** 로컬에 다운로드된 이미지 후보 1건 — 파일 경로 + 출처 정보. */
export interface DownloadedCandidate {
  filePath: string;
  sourceSite: ImageCandidate["sourceSite"];
  sourceId: string;
  sourceUrl: string;
  license: string;
}

/**
 * 무료 스톡 이미지 API(Unsplash/Pexels/Pixabay)에서 후보를 검색해 로컬에 다운로드한다.
 * image_query는 영어 키워드로 요청되므로 매칭률이 좋다.
 */
export async function searchAndDownloadCandidates(
  query: string,
  destDir: string,
  count = 6,
  page = 1,
): Promise<DownloadedCandidate[]> {
  // 재생성 시 이전 후보가 섞여서 다시 선택되는 일이 없도록 매번 깨끗하게 비운다.
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const candidates = await fetchImageCandidates(query, count, page);
  if (candidates.length === 0) {
    throw new Error(
      `이미지 후보를 찾지 못했습니다 (query="${query}"). UNSPLASH_ACCESS_KEY / PEXELS_API_KEY / PIXABAY_API_KEY 설정을 확인하세요.`,
    );
  }

  const downloaded: DownloadedCandidate[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const filePath = path.join(destDir, `candidate_${i}.jpg`);
    if (await downloadTo(candidates[i].url, filePath)) {
      downloaded.push({ filePath, ...candidates[i] });
    }
  }

  if (downloaded.length === 0) {
    throw new Error(`이미지 후보 다운로드에 모두 실패했습니다 (query="${query}").`);
  }

  return downloaded;
}

/** query 전체 -> 뒤에서부터 단어를 하나씩 줄인 짧은 쿼리. */
function buildSpecificVariants(query: string): string[] {
  const words = query.trim().split(/\s+/).filter(Boolean);
  const variants = [query];
  for (let n = words.length - 1; n >= 1; n--) {
    variants.push(words.slice(0, n).join(" "));
  }
  return [...new Set(variants)];
}

// 아무리 특이한 주제라도 최소 3장은 확보하기 위한 범용 대표 키워드 목록.
// Unsplash/Pexels 둘 중 하나라도 키가 유효하면 이 키워드들은 사실상 항상
// 충분한 결과를 반환한다(회사 소개, 뉴스, 라이프스타일 등 어떤 주제든
// 폭넓게 어울리는 이미지들).
const GENERIC_FALLBACK_TERMS = [
  "lifestyle",
  "abstract background",
  "nature landscape",
  "business",
  "technology",
  "city skyline",
  "people working",
  "modern minimal",
];

/**
 * 원래 쿼리로 후보가 부족하면 점점 넓은(짧은) 키워드로 먼저 시도하고, 그래도
 * minCount에 못 미치면 GENERIC_FALLBACK_TERMS로 "강제로" 채운다. 범용 키워드
 * 단계는 구체적 변형 단계와 별도의 시도 예산을 갖기 때문에, 앞 단계에서
 * 시도 횟수를 다 써버려도 범용 키워드 검색 기회 자체는 항상 보장된다 —
 * 그래서 (API 키가 하나라도 유효한 한) 이미지 검색 자체가 완전히 실패하는
 * 경우가 아니면 사실상 항상 minCount장을 확보한다.
 */
export async function searchWithFallback(
  primaryQuery: string,
  destDir: string,
  minCount: number,
  startPage = 1,
): Promise<DownloadedCandidate[]> {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  const downloaded: DownloadedCandidate[] = [];
  let fileIndex = 0;

  const tryVariants = async (variants: string[], maxAttempts: number) => {
    let attempts = 0;
    outer: for (const variant of variants) {
      for (let page = startPage; page < startPage + 2; page++) {
        if (downloaded.length >= minCount || attempts >= maxAttempts) break outer;
        attempts++;
        const candidates = await fetchImageCandidates(variant, Math.max(minCount * 2, 6), page).catch(() => []);
        for (const candidate of candidates) {
          if (downloaded.length >= minCount * 2) break;
          const filePath = path.join(destDir, `candidate_${fileIndex++}.jpg`);
          if (await downloadTo(candidate.url, filePath)) downloaded.push({ filePath, ...candidate });
        }
      }
    }
  };

  // 1단계: 원래 쿼리와 그 변형들로 시도(최대 5회) — 주제와 정확히 맞는 사진을 우선 노린다.
  await tryVariants(buildSpecificVariants(primaryQuery), 5);

  // 2단계: 그래도 부족하면 범용 키워드로 "강제 등록"에 필요한 만큼 채운다.
  // 1단계와 별개의 시도 예산을 쓰므로, 1단계가 시도를 전부 소진했어도
  // 이 단계는 항상 온전히 실행된다.
  if (downloaded.length < minCount) {
    await tryVariants(GENERIC_FALLBACK_TERMS, GENERIC_FALLBACK_TERMS.length * 2);
  }

  if (downloaded.length === 0) {
    throw new Error(
      `여러 키워드로 시도했지만 이미지 후보를 찾지 못했습니다 (query="${primaryQuery}"). UNSPLASH_ACCESS_KEY / PEXELS_API_KEY / PIXABAY_API_KEY 설정을 확인하세요.`,
    );
  }
  if (downloaded.length < minCount) {
    console.warn(
      `[searchWithFallback] "${primaryQuery}" -> 목표 ${minCount}장에 못 미치는 ${downloaded.length}장만 확보됨`,
    );
  }
  console.log(`[searchWithFallback] "${primaryQuery}" -> ${downloaded.length}장 확보`);
  return downloaded;
}
