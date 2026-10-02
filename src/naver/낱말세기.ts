/**
 * 제목·본문에서 자주 나오는 낱말 — 형태소 분석기 없이 가볍게.
 * 띄어쓰기로 나누고 흔한 조사·어미를 떼고, 두 글자 이상만 센다. «근거» 로 화면에 보이는 정도의 용도다.
 */
const 조사 = /(으로서|으로써|에서는|에게서|이라는|이라고|에서|에게|으로|부터|까지|처럼|보다|하고|이랑|라는|라고|이나|에는|과의|와의|은|는|이|가|을|를|의|에|로|와|과|도|만|요|죠)$/;
const 버릴말 = new Set(("그리고 그래서 하지만 그런데 이번 오늘 정말 진짜 너무 아주 많이 바로 이제 같은 위한 대한 관련 정리 방법 이렇게 저렇게 "
  + "있는 없는 하는 되는 있습니다 합니다 됩니다 있어요 해요 돼요 했어요 그냥 모든 가장 다른 이런 저런 그런 우리 제가 저는 여러분 포스팅 블로그 "
  + "오늘은 이웃 공감 댓글 사진 출처 확인 경우 때문 정도 하나 둘 셋").split(/\s+/));

export function 낱말들(글: string): string[] {
  return String(글 ?? "")
    .replace(/[^가-힣A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w.replace(조사, "") : w))
    .filter((w) => w.length >= 2 && !버릴말.has(w) && !/^\d+$/.test(w));
}

/** 자주 나온 낱말 n개. 글마다 한 번만 세려면 글을 배열로 준다(«몇 글에 나왔나»). */
export function 자주낱말(글들: string[], n = 15, 빼기: string[] = []): { word: string; count: number }[] {
  const 뺄 = new Set(빼기.flatMap((x) => 낱말들(x)));
  const 셈 = new Map<string, number>();
  for (const 글 of 글들) for (const w of new Set(낱말들(글))) if (!뺄.has(w)) 셈.set(w, (셈.get(w) ?? 0) + 1);
  return [...셈].filter(([, c]) => c >= 2 || 글들.length <= 2).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, n).map(([word, count]) => ({ word, count }));
}
