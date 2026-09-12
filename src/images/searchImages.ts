import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

interface UnsplashSearchResponse {
  results: { urls: { regular: string } }[];
}

interface PexelsSearchResponse {
  photos: { src: { large: string } }[];
}

async function searchUnsplash(query: string, count: number): Promise<string[]> {
  if (!config.unsplashAccessKey) return [];
  const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}`;
  const res = await fetch(url, {
    headers: { Authorization: `Client-ID ${config.unsplashAccessKey}` },
  });
  if (!res.ok) throw new Error(`Unsplash 검색 실패: HTTP ${res.status}`);
  const data = (await res.json()) as UnsplashSearchResponse;
  return (data.results ?? []).map((r) => r.urls.regular);
}

async function searchPexels(query: string, count: number): Promise<string[]> {
  if (!config.pexelsApiKey) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`;
  const res = await fetch(url, {
    headers: { Authorization: config.pexelsApiKey },
  });
  if (!res.ok) throw new Error(`Pexels 검색 실패: HTTP ${res.status}`);
  const data = (await res.json()) as PexelsSearchResponse;
  return (data.photos ?? []).map((p) => p.src.large);
}

/**
 * 무료 스톡 이미지 API(Unsplash/Pexels)에서 후보를 검색해 로컬에 다운로드한다.
 * image_query는 영어 키워드로 요청되므로 매칭률이 좋다.
 */
export async function searchAndDownloadCandidates(
  query: string,
  destDir: string,
  count = 6,
): Promise<string[]> {
  fs.mkdirSync(destDir, { recursive: true });

  const perSource = Math.ceil(count / 2);
  const [unsplashUrls, pexelsUrls] = await Promise.all([
    searchUnsplash(query, perSource).catch((err) => {
      console.warn("Unsplash 검색 실패:", (err as Error).message);
      return [];
    }),
    searchPexels(query, perSource).catch((err) => {
      console.warn("Pexels 검색 실패:", (err as Error).message);
      return [];
    }),
  ]);

  const urls = [...unsplashUrls, ...pexelsUrls].slice(0, count);
  if (urls.length === 0) {
    throw new Error(
      `이미지 후보를 찾지 못했습니다 (query="${query}"). UNSPLASH_ACCESS_KEY / PEXELS_API_KEY 설정을 확인하세요.`,
    );
  }

  const filePaths: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]);
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      const filePath = path.join(destDir, `candidate_${i}.jpg`);
      fs.writeFileSync(filePath, buf);
      filePaths.push(filePath);
    } catch (err) {
      console.warn(`이미지 다운로드 실패 (${urls[i]}):`, (err as Error).message);
    }
  }

  if (filePaths.length === 0) {
    throw new Error(`이미지 후보 다운로드에 모두 실패했습니다 (query="${query}").`);
  }

  return filePaths;
}
