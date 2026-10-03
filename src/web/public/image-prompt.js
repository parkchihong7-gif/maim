/**
 * 🖼️ 이미지 프롬프트 — 최종 검수 창의 [이미지 프롬프트] 가 쓴다. 이 프로그램은 이미지를 만들지 않는다.
 *
 * 2026-10-03 사장님 요청으로 바꿈:
 *   - 너무 AI 같은(애니·네온·과한 액션) 이미지 대신 «실제 사진을 포토샵으로 다듬은 기업 홈페이지 홍보 이미지» 수준
 *   - 모든 이미지 16:9 · 단순·사실적
 *   - 한 통으로 길게 복사하면 잘려서 → **이미지마다 따로**(짧게) 복사. 본문을 뭉텅이로 붙이지 않는다
 *   - 쓰는 이미지 AI(Gemini·ChatGPT·그 밖)에 맞춘 말투
 * 화면(app.js)과 시험 도구(tools/이미지시험.mjs)가 이 파일 하나를 같이 쓴다.
 */
(function (g) {
  const 대상들 = {
    gemini: { 이름: "Gemini", 안내: "Gemini 앱(또는 AI Studio)에 한 장씩 붙여넣으세요.",
      머리: "아래 설명대로 이미지 1장을 만들어 주세요. 비율은 가로 16:9 입니다." },
    chatgpt: { 이름: "ChatGPT", 안내: "ChatGPT 에 한 장씩 붙여넣으세요(설명만 하면 «그려 줘» 라고 한 번 더).",
      머리: "아래 설명대로 이미지를 1장 바로 생성해 주세요(설명만 하지 말고 그려 주세요). 크기는 가로 16:9 (1792×1024) 입니다." },
    other: { 이름: "그 밖의 AI", 안내: "Copilot·미드저니 등 — 한 장씩 붙여넣고, 비율 설정이 따로 있으면 16:9 로 맞추세요.",
      머리: "Create one image as described below. Aspect ratio 16:9 (landscape). 설명은 한국어입니다." },
  };

  const 이모지 = /^[\p{Extended_Pictographic}️‍\s]+/u;
  const 소제목인가 = (줄) => 줄.length > 0 && 줄.length <= 45 && /^\p{Extended_Pictographic}/u.test(줄) && !/[.。]$/.test(줄);
  const 줄들 = (글) => String(글 || "").split(/\n+/).map((x) => x.trim()).filter(Boolean);

  /** 문장 하나를 «끝까지» — 80자 안에 문장이 안 끝나면 쓰지 않는다(중간에 잘린 글을 주지 않으려고). */
  function 첫문장(글, 최대 = 80) {
    const m = String(글 || "").replace(/\s+/g, " ").match(/^.*?[.!?。]|^.*?(요|다|죠)(?=\s|$)/);
    const 문장 = m ? m[0].trim() : "";
    return 문장 && 문장.length <= 최대 ? 문장 : "";
  }

  function 짧은제목(키워드, 제목) {
    const k = String(키워드 || "").replace(/^#/, "").trim();
    if (k && k.length <= 16) return k;
    // 낱말 단위로 넷까지·14자까지. 한 글자 낱말(«이», «꼭»)로 끝나지 않게.
    const 말 = String(제목 || "").split(/\s+/).filter(Boolean);
    const 고른 = [];
    for (const w of 말) { if (고른.length >= 4 || [...고른, w].join(" ").length > 14) break; 고른.push(w); }
    while (고른.length > 1 && 고른[고른.length - 1].length < 2) 고른.pop();
    return 고른.join(" ") || String(제목 || "").slice(0, 14);
  }

  const 스타일 = [
    "- 실제 사진을 바탕으로 포토샵에서 깔끔하게 합성·보정한 듯한 편집 이미지",
    "- 기업 공식 홈페이지의 홍보 배너 수준: 단순한 구도, 넉넉한 여백, 피사체 1~2개, 자연광, 실제 색감, 얕은 심도",
    "- 주제와 바로 연결되는 실제 사물·장소·사람의 손 등을 사실적으로. 실제 화면·제품·상표는 지어내지 말고 일반적인 모습으로",
  ].join("\n");
  const 피할것 = "애니메이션·일러스트·만화·캐릭터·3D 렌더 느낌, 네온·과한 빛 번짐·번개·불꽃·반짝이 효과, 과장된 동작·역동적 액션 장면, 판타지·몽환적 배경, 과포화 색, 손가락·얼굴 왜곡, 실존 인물·실제 상표 로고";
  const 영문 = "(style keywords: photorealistic, edited stock photography, clean corporate website hero banner, natural light, minimal composition, no illustration, no anime, no neon)";

  /**
   * 이미지마다 따로 쓰는 프롬프트 목록. 대표 1장 + 본문 최대 3장.
   * @returns {{역할:string, 글:string}[]}
   */
  function 이미지프롬프트들(제목, 본문, 키워드, 대상 = "gemini") {
    const t = 대상들[대상] || 대상들.gemini;
    const 줄 = 줄들(본문);
    const 소제목자리 = 줄.map((x, i) => (소제목인가(x) ? i : -1)).filter((i) => i >= 0).slice(0, 3);
    const 주제 = String(키워드 || "").replace(/^#/, "").trim() || 짧은제목("", 제목);
    const 하나 = (역할, 장면, 글자) => [
      t.머리,
      `[블로그 글] «${제목}»`,
      `[이 이미지] ${역할} — ${장면}`,
      `[스타일]\n${스타일}`,
      `[피할 것] ${피할것}`,
      `[글자] ${글자}`,
      "[표시] 오른쪽 아래 구석에 작은 회색 글씨로 «AI 생성 이미지»",
      영문,
    ].join("\n");
    const 목록 = [{
      역할: "대표 이미지",
      글: 하나("대표 이미지(썸네일)", `«${주제}» 와 바로 연결되는 실제 사물·장소 하나를 가운데에서 약간 오른쪽에 두고, 왼쪽은 글자 자리로 비워 두기`,
        `왼쪽 여백에 짧은 한글 제목 «${짧은제목(키워드, 제목)}» 한 줄만. 굵은 고딕체, 흰색 또는 짙은 남색 단색, 그림자·테두리·빛 효과 없이`),
    }];
    소제목자리.forEach((i, n) => {
      const 소제목 = 줄[i].replace(이모지, "").trim();
      const 설명 = 첫문장(줄[i + 1] || "");
      목록.push({
        역할: `본문 ${n + 1} · ${소제목}`,
        글: 하나(`본문 이미지 ${n + 1}`, `«${소제목}» 를 보여 주는 실제 장면${설명 ? ` (글 내용: ${설명})` : ""}`, "이미지 안에 글자를 넣지 마세요"),
      });
    });
    if (목록.length === 1) {
      목록.push({ 역할: "본문 1", 글: 하나("본문 이미지 1", `«${주제}» 를 실제로 준비하거나 쓰는 생활 속 장면`, "이미지 안에 글자를 넣지 마세요") });
    }
    return 목록;
  }

  g.이미지대상들 = 대상들;
  g.이미지프롬프트들 = 이미지프롬프트들;
})(typeof window !== "undefined" ? window : globalThis);
