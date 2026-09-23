function getDashboardToken() {
  try {
    return localStorage.getItem("maim-dashboard-token") || "";
  } catch {
    return "";
  }
}

function setDashboardToken(token) {
  try {
    localStorage.setItem("maim-dashboard-token", token);
  } catch {
    // 브라우저 저장소를 못 쓰는 환경이면 이번 세션 동안은 토큰 없이 요청이 계속 실패한다.
  }
}

/** 기기 이름을 한글로. 2차키가 어느 기기 것인지 화면에 쓸 때 쓴다. */
const DEVICE_LABEL_KO = { pc: "PC", laptop: "노트북", mobile: "휴대폰" };

/**
 * 1차·2차 인증키를 통합 관리자 대시보드 장부에 확인시킨다.
 *
 * 이 프로그램은 예전에 자기 접속 코드를 따로 만들어 썼다. 모양은 같았지만
 * 장부가 달라서, 대시보드에서 판 키가 여기서는 안 통했다. 이제 장부는 하나다.
 *
 * 로그인 전이라 토큰이 없는 게 당연하므로 인증 훅의 예외 대상이다.
 */
async function redeemToken(value, value2) {
  const res = await fetch("/api/auth/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, value2 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(로그인_오류(res, data));
  return data;
}

/**
 * 왜 안 됐는지 **사람이 읽을 수 있게.**
 *
 * 한 번 데였다. 서버 안에서 터지면 Fastify 가 `error: "Internal Server Error"`
 * 를 주는데, 우리는 그 글자를 그대로 화면에 찍었다. 쓰는 분도 고치는 사람도
 * 무엇이 잘못인지 알 길이 없었다. 진짜 이유는 `message` 에 따로 담겨 온다.
 */
function 로그인_오류(res, data) {
  const 뻔한말 = ["Internal Server Error", "Bad Request", "Unauthorized"];
  const 쓸것 = [data.error, data.detail, data.message]
    .filter((x) => x && !뻔한말.includes(x));
  if (쓸것.length) { return [...new Set(쓸것)].join(" — "); }
  return `인증에 실패했습니다. (${res.status})`;
}

// ── 로그인 관문 ────────────────────────────────────────────────────
//
// 예전에는 window.prompt() 로 받았다. 파는 물건의 첫 화면이 브라우저 기본
// 창이면 곤란하고, 키가 두 개가 되면서 창이 두 번 떠야 해서 더 그랬다.

/** 관문이 열려 있는 동안의 약속. 401 이 여러 개 와도 관문은 하나만 뜬다. */
let gatePromise = null;

function openGate(먼저할말) {
  if (gatePromise) return gatePromise;
  const gate = document.getElementById("gate");
  const key1 = document.getElementById("gate-key1");
  const key2 = document.getElementById("gate-key2");
  const msg = document.getElementById("gate-msg");
  const go = document.getElementById("gate-go");
  if (!gate) return Promise.resolve(null);   // 옛 화면에서 열었을 때

  gate.hidden = false;
  msg.className = "gate-msg";
  msg.textContent = 먼저할말 || "";
  key1.focus();

  gatePromise = new Promise((resolve) => {
    async function 들어가기() {
      const a = key1.value.trim();
      const b = key2.value.trim();
      if (!a) { msg.textContent = "1차 인증키를 넣어 주세요."; key1.focus(); return; }
      go.disabled = true;
      msg.className = "gate-msg working";
      msg.textContent = "확인 중...";
      try {
        const 답 = await redeemToken(a, b);
        if (!답.token) { throw new Error("예상치 못한 응답입니다. 다시 시도해주세요."); }
        gate.hidden = true;
        key1.value = ""; key2.value = "";
        msg.textContent = "";
        떼어내기();
        resolve(답.token);
      } catch (err) {
        msg.className = "gate-msg";
        msg.textContent = err.message;
        // 2차키를 안 넣어 걸렸으면 그 칸으로 데려다 준다.
        (b ? key1 : key2).focus();
      } finally {
        go.disabled = false;
      }
    }
    function 엔터(e) { if (e.key === "Enter") { e.preventDefault(); 들어가기(); } }
    function 떼어내기() {
      go.removeEventListener("click", 들어가기);
      key1.removeEventListener("keydown", 엔터);
      key2.removeEventListener("keydown", 엔터);
      gatePromise = null;
    }
    go.addEventListener("click", 들어가기);
    key1.addEventListener("keydown", 엔터);
    key2.addEventListener("keydown", 엔터);
  });
  return gatePromise;
}

// ── 이 기기가 아직 주인인가 ────────────────────────────────────────
//
// 같은 2차키로 다른 기기에서 들어오면 먼저 있던 기기가 끊긴다. 그것을
// 알아채려면 주기적으로 물어야 한다 — 안 물으면 끊긴 줄도 모르고 계속 쓴다.
const HEARTBEAT_MS = 60_000;
let heartbeatTimer = null;

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(async () => {
    const token = getDashboardToken();
    if (!token) return;
    try {
      const res = await fetch("/api/auth/heartbeat", { headers: { "x-dashboard-token": token } });
      if (res.status === 401) {
        const data = await res.json().catch(() => ({}));
        setDashboardToken("");
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
        const 새토큰 = await openGate(data.error || "접속이 종료되었습니다. 다시 들어와 주세요.");
        if (새토큰) { setDashboardToken(새토큰); startHeartbeat(); }
      }
    } catch { /* 인터넷이 잠깐 끊긴 것. 다음 차례에 다시 묻는다 */ }
  }, HEARTBEAT_MS);
}

async function api(path, options = {}) {
  const token = getDashboardToken();
  const res = await fetch(path, {
    headers: {
      // body가 없는데 Content-Type: application/json을 붙이면 Fastify가
      // "본문이 비어있는데 JSON이라니" 하며 400 Bad Request로 거부한다.
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-dashboard-token": token } : {}),
    },
    ...options,
  });

  if (res.status === 401) {
    // 화면이 여러 API 를 한꺼번에 부르므로 401 도 한꺼번에 온다. 관문을
    // 열기 전에 "혹시 그새 다른 요청이 이미 통과했는지" 부터 본다 —
    // 안 그러면 이미 들어왔는데 관문이 또 뜬다.
    // (관문 자체도 `gatePromise` 로 하나만 뜨게 잡아 둔다.)
    const latestToken = getDashboardToken();
    if (latestToken && latestToken !== token) {
      return api(path, options);
    }
    const sessionToken = await openGate();
    if (sessionToken) {
      setDashboardToken(sessionToken);
      startHeartbeat();
      return api(path, options);
    }
    throw new Error("접속키가 필요합니다.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 서버가 JSON 에러 대신 순수 오류(예: Cloud Run이 너무 오래 걸린 요청을
    // 강제로 끊었을 때의 504)를 돌려주면 data.error가 비어있다 — 그때도
    // 상태 코드/문구는 남겨서 "요청 실패"만 뜨고 끝나지 않게 한다.
    throw new Error(data.error || `요청 실패 (${res.status} ${res.statusText || ""})`.trim());
  }
  return data;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function buildCopyText(post) {
  const tags = post.tags_json ? JSON.parse(post.tags_json) : [];
  const parts = [post.title ?? "", "", post.content ?? ""];
  if (tags.length > 0) parts.push("", tags.join(" "));
  return parts.join("\n");
}

let categoriesCache = [];
// 수정 중인 카테고리 id. null이면 전부 보기 모드, 값이 있으면 그 행만
// 이름/설명/주제 키워드를 함께 고칠 수 있는 입력 폼으로 바뀐다.
let editingCategoryId = null;

function renderCategories(categories) {
  const tbody = document.querySelector("#category-table tbody");
  tbody.innerHTML = "";
  for (const c of categories) {
    const tr = document.createElement("tr");
    if (c.id === editingCategoryId) {
      tr.innerHTML = `
        <td colspan="5">
          <div class="category-edit-form">
            <label>이름
              <input class="edit-name" value="${escapeHtml(c.name)}" />
            </label>
            <label>카테고리 설명(프롬프트 힌트)
              <textarea class="edit-hint" rows="3">${escapeHtml(c.prompt_hint ?? "")}</textarea>
            </label>
            <label>주제 키워드(선택 — 있으면 생성 시 관련 최신 뉴스를 최우선 검색·반영)
              <input class="edit-keyword" placeholder="예: 2026 최저임금 인상" value="${escapeHtml(c.topic_keyword ?? "")}" />
            </label>
            <label>하루 편수 (0~10 — 0이면 이 카테고리는 쉽니다)
              <input class="edit-daily" type="number" min="0" max="10" value="${Number(c.daily_count ?? 1)}" />
            </label>
            <div class="category-edit-actions">
              <button class="btn-primary" data-action="save-category" data-id="${c.id}">저장</button>
              <button class="btn-secondary" data-action="cancel-edit-category" data-id="${c.id}">취소</button>
            </div>
          </div>
        </td>`;
    } else {
      tr.innerHTML = `
        <td>${escapeHtml(c.name)}</td>
        <td><span class="badge ${c.active ? "badge-active" : "badge-inactive"}">${c.active ? "활성" : "비활성"}</span></td>
        <td>${Number(c.daily_count ?? 1) === 0
              ? '<span class="muted">쉼</span>'
              : `<strong>${Number(c.daily_count ?? 1)}</strong>편`}</td>
        <td>${c.topic_keyword ? escapeHtml(c.topic_keyword) : '<span class="muted">-</span>'}</td>
        <td>
          <button class="btn-primary" data-action="generate" data-id="${c.id}">지금 생성</button>
          <button class="btn-secondary" data-action="edit-category" data-id="${c.id}">수정</button>
          <button class="btn-danger" data-action="delete-category" data-id="${c.id}">삭제</button>
        </td>`;
    }
    tbody.appendChild(tr);
  }
}

async function refreshCategories() {
  const categories = await api("/api/categories");
  categoriesCache = categories;
  renderCategories(categories);
}

let readyPosts = [];
let historyCache = [];
// 펼쳐서 보고 있는 초안 id들. refreshQueue()가 15초마다 카드 전체를 다시
// 그리는데, 이 상태를 기억해두지 않으면 내용을 읽는 중에도 다음 자동
// 새로고침 때 매번 다시 접혀버린다.
const expandedPostIds = new Set();

function getImagePaths(post) {
  if (!post.image_paths_json) return [];
  try {
    const parsed = JSON.parse(post.image_paths_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getImageAlts(post) {
  if (!post.image_alts_json) return [];
  try {
    const parsed = JSON.parse(post.image_alts_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function getTitleVariants(post) {
  if (!post.title_variants_json) return [];
  try {
    const parsed = JSON.parse(post.title_variants_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// --- 초안 품질 체크리스트 (전부 클라이언트에서 계산, 서버 호출 없음) ---

function normalizeWords(text) {
  return (text || "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 1);
}

function jaccardSimilarity(wordsA, wordsB) {
  const setA = new Set(wordsA);
  const setB = new Set(wordsB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

/** 이미 작성 완료(ready/published)된 다른 글들과 제목 주제가 겹치는지 대략 확인한다. */
function findSimilarHistoryTitle(post) {
  const words = normalizeWords(post.title);
  let best = { title: null, score: 0 };
  for (const h of historyCache) {
    if (h.id === post.id) continue;
    if (h.status !== "ready" && h.status !== "published") continue;
    if (!h.title) continue;
    const score = jaccardSimilarity(words, normalizeWords(h.title));
    if (score > best.score) best = { title: h.title, score };
  }
  return best;
}

const BANNED_FORMATTING_REGEX = /(^#{1,6}\s)|(^\*\s)|■|▶/m;

function buildQualityChecklist(post) {
  const content = post.content ?? "";
  const len = content.length;
  const tags = post.tags_json ? JSON.parse(post.tags_json) : [];
  const keyword = tags[0] ? tags[0].replace(/^#/, "") : null;
  const keywordCount = keyword ? content.split(keyword).length - 1 : 0;
  const hasBanned = BANNED_FORMATTING_REGEX.test(content);
  const similar = findSimilarHistoryTitle(post);
  const isDuplicate = similar.score >= 0.5;

  return [
    { ok: len >= 1500, label: len >= 1500 ? `글자수 ${len}자` : `글자수 부족 (${len}자)` },
    { ok: !hasBanned, label: hasBanned ? "서식 기호 잔존" : "서식 기호 없음" },
    {
      ok: keyword ? keywordCount >= 2 : false,
      label: keyword ? `키워드 "${keyword}" 본문 ${keywordCount}회` : "태그 없음",
    },
    {
      ok: !isDuplicate,
      label: isDuplicate ? `최근 글과 주제 유사: "${similar.title}"` : "최근 글과 주제 중복 없음",
    },
  ];
}

async function refreshQueue() {
  const { items } = await api("/api/queue");

  readyPosts = items;
  const container = document.getElementById("ready-list");
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML = `<p class="muted">준비된 초안이 없습니다. 카테고리 목록에서 "지금 생성"을 눌러보세요.</p>`;
    return;
  }

  for (const p of items) {
    const card = document.createElement("div");
    card.className = "post-card";
    const tags = p.tags_json ? JSON.parse(p.tags_json) : [];
    const imagePaths = getImagePaths(p);
    const imageAlts = getImageAlts(p);
    // <img src>는 브라우저가 커스텀 헤더 없이 직접 요청하므로, api()가 붙이는
    // x-dashboard-token 헤더가 안 실린다. 토큰이 설정된 배포(Cloud Run 등)에서
    // 이미지가 항상 401로 막혀 안 보이지 않도록 쿼리 파라미터로도 붙여준다.
    const imgToken = getDashboardToken();
    const tokenQuery = imgToken ? `?token=${encodeURIComponent(imgToken)}` : "";
    // 재생성은 기존 이미지를 덮어쓰지 않고 항상 새 인덱스로 추가하므로, 같은
    // 인덱스의 파일은 한 번 만들어지면 절대 안 바뀐다 — 캐시 버스터가 필요
    // 없고(서버도 오래 캐시하도록 응답), 매 15초 자동 새로고침마다 이미 받은
    // 이미지를 또 통째로 재다운로드하며 화면이 깜빡이는 문제도 사라진다.
    const anyAlt = imageAlts.some(Boolean);
    const imagesHtml =
      imagePaths.length > 0
        ? `<div class="post-images-section">
            <div class="post-images">${imagePaths
              .map((_, idx) => {
                const src = `/api/posts/${p.id}/image/${idx}${tokenQuery}`;
                const safeSrc = escapeHtml(src);
                const alt = imageAlts[idx] || "";
                const safeAlt = escapeHtml(alt || `이미지 ${idx + 1}`);
                const altBlock = alt
                  ? `<div class="post-image-alt-box">
                       <span class="post-image-alt-label">대체텍스트(alt) — 복사해서 네이버 에디터에 붙여넣으세요</span>
                       <p class="post-image-alt-text">${escapeHtml(alt)}</p>
                     </div>`
                  : `<p class="post-image-alt-missing muted">대체텍스트 없음 (이미지 재생성 시 자동 생성됩니다)</p>`;
                return `
                  <div class="post-image-item">
                    <img class="post-thumb" src="${safeSrc}" alt="${safeAlt}" />
                    <div class="post-image-actions">
                      <button class="btn-secondary btn-copy-image" data-action="copy-image" data-src="${safeSrc}">이미지 복사</button>
                      ${alt ? `<button class="btn-secondary btn-copy-image" data-action="copy-alt" data-alt="${escapeHtml(alt)}">대체텍스트 복사</button>` : ""}
                    </div>
                    ${altBlock}
                  </div>`;
              })
              .join("")}</div>
            ${anyAlt ? `<p class="muted post-image-hint">💡 이미지를 네이버 에디터에 붙여넣은 뒤, 위 파란 박스 안의 문구를 복사해 에디터의 "대체텍스트" 입력란에 붙여넣으면 검색엔진이 이미지 내용을 인식하는 데 도움이 됩니다.</p>` : ""}
          </div>`
        : `<div class="post-images-section"><p class="muted">이미지 없음</p></div>`;

    const checklistHtml = `<div class="post-quality-checklist">${buildQualityChecklist(p)
      .map((item) => `<span class="badge ${item.ok ? "badge-active" : "badge-failed"}">${item.ok ? "✅" : "⚠"} ${escapeHtml(item.label)}</span>`)
      .join("")}</div>`;

    const isExpanded = expandedPostIds.has(p.id);
    const tagsHtml =
      tags.length > 0
        ? `<div class="post-tags">${tags.map((t) => `<span class="post-tag">${escapeHtml(t)}</span>`).join("")}</div>`
        : "";

    const TITLE_VARIANT_LABELS = ["질문형", "숫자/사실형", "공감형"];
    const titleVariants = getTitleVariants(p);
    const titleVariantsHtml =
      titleVariants.length > 0
        ? `<div class="title-variants">
            <p class="muted title-variants-label">💡 후킹 제목 후보 (마음에 드는 걸 복사해서 실제 제목으로 써보세요)</p>
            ${titleVariants
              .map(
                (t, idx) => `
              <div class="title-variant-row">
                <span class="badge">${escapeHtml(TITLE_VARIANT_LABELS[idx] || `후보 ${idx + 1}`)}</span>
                <span class="title-variant-text">${escapeHtml(t)}</span>
                <button class="btn-secondary btn-copy-image" data-action="copy-title-variant" data-title="${escapeHtml(t)}">복사하기</button>
              </div>`,
              )
              .join("")}
          </div>`
        : "";

    card.innerHTML = `
      <div class="post-card-header">
        <strong class="post-title-toggle" data-action="toggle-content" data-id="${p.id}">${escapeHtml(p.title ?? "(제목 없음)")}</strong>
        <span class="badge">${escapeHtml(p.category_name)}</span>
      </div>
      ${titleVariantsHtml}
      <div class="post-card-actions">
        <button class="btn-secondary" data-action="copy" data-id="${p.id}">복사하기</button>
        <button class="btn-secondary" data-action="regenerate-image" data-id="${p.id}">이미지 재생성</button>
        <button class="btn-success" data-action="mark-published" data-id="${p.id}">발행 완료로 표시</button>
      </div>
      ${checklistHtml}
      <p class="post-preview${isExpanded ? "" : " collapsed"}">${escapeHtml(p.content ?? "")}</p>
      ${tagsHtml}
      ${imagesHtml}`;
    container.appendChild(card);
  }
}

async function refreshHistory() {
  const items = await api("/api/history?limit=30");
  historyCache = items;
  const tbody = document.querySelector("#history-table tbody");
  tbody.innerHTML = "";
  for (const p of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${escapeHtml(p.category_name)}</td>
      <td>${escapeHtml(p.title ?? "")}</td>
      <td><span class="badge badge-${p.status}">${p.status}</span></td>
      <td>${p.published_at ?? "-"}</td>
      <td>${escapeHtml(p.error_message ?? "")}</td>`;
    tbody.appendChild(tr);
  }
}

// --- 홈: 통계 카드 / 최근 활동 / 최근 발행 요약 ---
// 전부 이미 불러온 categoriesCache/readyPosts/historyCache로만 계산한다
// (홈 화면만을 위한 별도 API 호출은 없음).

/** SQLite의 datetime('now')는 UTC로 "YYYY-MM-DD HH:MM:SS" 형식이라 'Z'를 붙여 UTC로 파싱한다. */
function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const then = new Date(dateStr.replace(" ", "T") + "Z");
  const diffMs = Date.now() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}시간 전`;
  const diffDay = Math.floor(diffHour / 24);
  const remHour = diffHour % 24;
  return remHour > 0 ? `${diffDay}일 ${remHour}시간 전` : `${diffDay}일 전`;
}

function renderHomeStats() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = historyCache.filter((p) => (p.created_at || "").startsWith(todayStr)).length;
  document.getElementById("stat-today-count").textContent = todayCount;

  document.getElementById("stat-ready-count").textContent = readyPosts.length;
  document.getElementById("stat-ready-hint").textContent =
    readyPosts.length < 3 ? "3건 이상 준비를 권장해요" : "충분히 준비됐어요";

  const activeCount = categoriesCache.filter((c) => c.active).length;
  document.getElementById("stat-active-categories").textContent = `${activeCount}/${categoriesCache.length}`;

  const unsplashOk = lastSettingsSnapshot?.unsplash_access_key_set;
  const pexelsOk = lastSettingsSnapshot?.pexels_api_key_set;
  const pixabayOk = lastSettingsSnapshot?.pixabay_api_key_set;
  const imageSourceCount = [unsplashOk, pexelsOk, pixabayOk].filter(Boolean).length;
  const aiEl = document.getElementById("stat-ai-status");
  const aiHint = document.getElementById("stat-ai-hint");
  // "정상"의 기준은 이미지 소스 3개를 전부 연결하는 게 아니라(하나만 있어도
  // 이미지 검색 자체는 동작함), Claude 연결 + 이미지 소스 최소 1개다 —
  // 실제로 이 둘이 이 앱이 정상 동작하기 위한 최소 조건이기 때문이다.
  if (claudeTestedOk && imageSourceCount > 0) {
    aiEl.textContent = "정상";
    aiHint.textContent = `Claude 연결됨 · 이미지 소스 ${imageSourceCount}/3개 연결됨`;
  } else if (lastSettingsSnapshot === null) {
    aiEl.textContent = "확인 필요";
    aiHint.textContent = "관리자 설정에서 확인하세요";
  } else {
    aiEl.textContent = "설정 필요";
    const missing = [];
    if (!claudeTestedOk) missing.push("Claude 연결 테스트 필요");
    if (imageSourceCount === 0) missing.push("이미지 API 키 없음");
    aiHint.textContent = missing.join(" · ") || "관리자 설정에서 확인하세요";
  }
}

const ACTIVITY_STATUS_LABEL = { draft: "초안 생성 중", ready: "초안 준비 완료", published: "발행 완료 표시", failed: "생성 실패" };
const ACTIVITY_STATUS_ICON = { draft: "📝", ready: "✅", published: "🎉", failed: "⚠️" };

function renderActivityFeed() {
  const feed = document.getElementById("activity-feed");
  if (!feed) return;
  const items = historyCache.slice(0, 6);
  if (items.length === 0) {
    feed.innerHTML = `<p class="muted">아직 활동이 없습니다.</p>`;
    return;
  }
  feed.innerHTML = items
    .map(
      (p) => `
      <div class="activity-item">
        <span class="activity-icon">${ACTIVITY_STATUS_ICON[p.status] || "•"}</span>
        <div class="activity-body">
          <p class="activity-title">${escapeHtml(ACTIVITY_STATUS_LABEL[p.status] || p.status)} · ${escapeHtml(p.category_name)}</p>
          <p class="muted activity-sub">${escapeHtml(p.title || "(제목 없음)")}</p>
        </div>
        <span class="muted activity-time">${formatRelativeTime(p.published_at || p.created_at)}</span>
      </div>`,
    )
    .join("");
}

function renderHomeHistoryTable() {
  const tbody = document.querySelector("#home-history-table tbody");
  if (!tbody) return;
  const items = historyCache.slice(0, 5);
  if (items.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">아직 발행 이력이 없습니다.</td></tr>`;
    return;
  }
  tbody.innerHTML = items
    .map(
      (p) => `
      <tr>
        <td><span class="badge badge-${p.status}">${p.status}</span></td>
        <td>${escapeHtml(p.category_name)}</td>
        <td>${escapeHtml(p.title || "—")}</td>
        <td>${
          p.error_message
            ? `<button class="btn-danger btn-copy-image" data-action="show-error" data-error="${escapeHtml(p.error_message)}">오류 보기</button>`
            : '<span class="muted">-</span>'
        }</td>
      </tr>`,
    )
    .join("");
}

function renderHome() {
  renderHomeStats();
  renderActivityFeed();
  renderHomeHistoryTable();
}

async function refreshAll() {
  // 초안 품질 체크리스트가 히스토리 데이터(historyCache)로 "최근 글과 주제
  // 중복" 여부를 계산하므로, 큐보다 히스토리를 먼저 받아온다.
  await refreshHistory();
  // 카테고리를 수정하는 중에는 15초 자동 새로고침이 입력 중인 값을 서버의
  // 최신 값으로 덮어써버리지 않도록 그동안은 카테고리 목록만 건너뛴다.
  const tasks = [refreshQueue()];
  if (editingCategoryId === null) tasks.push(refreshCategories());
  await Promise.all(tasks);
  renderHome();
}

// --- ⚙️ 관리자 설정: AI 커넥트 연결 / 블로그 주제 설정 / 포스팅 방향 설정 ---
// 설정 섹션은 기본 접힘 상태라 15초 자동 새로고침 대상에 넣지 않고, 처음
// 펼칠 때만 불러온다(자주 안 바뀌는 값이라 폴링할 이유가 없음).

let postingDirectionPresets = [];
let selectedPreset = "balanced";
// Claude CLI 로그인 여부는 저장된 값이 아니라 "연결 테스트" 버튼을 눌렀을 때만
// 확인 가능한 라이브 상태라서, 페이지를 새로고침하면 다시 초기화된다.
let claudeTestedOk = false;
let isMasterSession = false;
// 홈 화면의 "AI 연결 상태" 카드가 참고하는 마지막 GET /api/settings 응답.
// null이면 아직 한 번도 안 불러온 것(부팅 직후).
let lastSettingsSnapshot = null;

function setStepBadge(step, done) {
  const el = document.querySelector(`[data-badge="${step}"]`);
  if (!el) return;
  el.textContent = done ? "✅" : "○";
}

function updateSetupProgress() {
  const unsplashDone = document.querySelector('[data-badge="unsplash"]')?.textContent === "✅";
  const pexelsDone = document.querySelector('[data-badge="pexels"]')?.textContent === "✅";
  const pixabayDone = document.querySelector('[data-badge="pixabay"]')?.textContent === "✅";
  const done = [claudeTestedOk, unsplashDone, pexelsDone, pixabayDone].filter(Boolean).length;
  const el = document.getElementById("setup-progress");
  if (el) el.textContent = `4단계 중 ${done}단계 완료`;
}

async function loadPresetsIfNeeded() {
  if (postingDirectionPresets.length > 0) return;
  postingDirectionPresets = await api("/api/settings/posting-direction-presets");
}

async function reloadPresets() {
  postingDirectionPresets = await api("/api/settings/posting-direction-presets");
}

function renderPresetGrid() {
  const grid = document.getElementById("preset-grid");
  if (!grid || postingDirectionPresets.length === 0) return;
  const cards = postingDirectionPresets
    .map(
      (p) => `
      <div class="preset-card${p.id === selectedPreset ? " selected" : ""}" data-action="select-preset" data-preset="${p.id}">
        ${p.custom ? `<button class="preset-delete" data-action="delete-preset" data-preset="${p.id}" title="이 프리셋 삭제">✕</button>` : ""}
        <strong>${escapeHtml(p.label)}</strong>
        <p class="muted">${escapeHtml(p.description)}</p>
      </div>`,
    )
    .join("");
  grid.innerHTML =
    cards + `<div class="preset-card preset-card-add" data-action="show-add-preset-form">+<span>새 프리셋 추가</span></div>`;
}

function renderFinalDirectionSummary() {
  const el = document.getElementById("final-direction-summary");
  if (!el) return;
  const preset = postingDirectionPresets.find((p) => p.id === selectedPreset);
  const refinement = document.getElementById("posting-direction-refinement").value.trim();
  const typeInput = document.querySelector('input[name="blog_type"]:checked');
  const typeLabel = typeInput ? (typeInput.value === "business" ? "기업 블로그" : "개인 블로그") : "지정 안 함";
  const topicSelect = document.getElementById("blog-topic-select");
  const topicLabel =
    topicSelect && topicSelect.value !== "all" ? topicSelect.selectedOptions[0]?.textContent : "전체(주제 선택 없음)";

  el.innerHTML = `
    <p><strong>지금 이 블로그의 글은 다음 기준으로 작성됩니다:</strong></p>
    <ul class="final-direction-list">
      <li><strong>블로그 유형:</strong> ${escapeHtml(typeLabel)}</li>
      <li><strong>주제 분야:</strong> ${escapeHtml(topicLabel || "전체(주제 선택 없음)")}</li>
      <li><strong>톤 프리셋:</strong> ${escapeHtml(preset ? preset.label : selectedPreset)}${
        preset ? ` — ${escapeHtml(preset.description)}` : ""
      }</li>
      ${preset && preset.instruction ? `<li><strong>AI에게 실제로 전달되는 지시문:</strong> "${escapeHtml(preset.instruction)}"</li>` : ""}
      <li><strong>추가 보강 지시사항:</strong> ${refinement ? escapeHtml(refinement) : "없음"}</li>
    </ul>`;
}

async function refreshSettings() {
  const [s, who] = await Promise.all([api("/api/settings"), api("/api/auth/whoami")]);
  isMasterSession = !!who.isMaster;
  lastSettingsSnapshot = s;

  setStepBadge("unsplash", s.unsplash_access_key_set);
  document.querySelector('[data-current="unsplash_access_key"]').textContent = s.unsplash_access_key_set
    ? `현재 저장된 값: ${s.unsplash_access_key}`
    : "아직 설정되지 않았습니다.";

  setStepBadge("pexels", s.pexels_api_key_set);
  document.querySelector('[data-current="pexels_api_key"]').textContent = s.pexels_api_key_set
    ? `현재 저장된 값: ${s.pexels_api_key}`
    : "아직 설정되지 않았습니다.";

  setStepBadge("pixabay", s.pixabay_api_key_set);
  document.querySelector('[data-current="pixabay_api_key"]').textContent = s.pixabay_api_key_set
    ? `현재 저장된 값: ${s.pixabay_api_key}`
    : "아직 설정되지 않았습니다.";

  setStepBadge("claude", claudeTestedOk);
  updateSetupProgress();

  const typeRadio = document.querySelector(`input[name="blog_type"][value="${s.blog_type}"]`);
  if (typeRadio) typeRadio.checked = true;
  document.getElementById("blog-topic-select").value = s.blog_topic || "all";

  selectedPreset = s.posting_direction_preset || "balanced";
  document.getElementById("posting-direction-refinement").value = s.posting_direction_refinement || "";
  await loadPresetsIfNeeded();
  renderPresetGrid();
  renderFinalDirectionSummary();
  renderHomeStats();
}

// --- 사이드바 뷰 전환 (홈/블로그 관리/포스팅/발행 이력/관리자 설정/사용법) ---

let currentView = "home";

async function switchView(view) {
  currentView = view;
  document.querySelectorAll("[data-view-panel]").forEach((el) => {
    el.hidden = el.dataset.viewPanel !== view;
  });
  document.querySelectorAll(".sidebar-nav-item").forEach((navBtn) => {
    navBtn.classList.toggle("active", navBtn.dataset.view === view);
  });
  if (view === "settings") { await refreshSettings(); await refreshSchedule(); }
  if (view === "home") renderHome();
}

document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await api("/api/categories", {
      method: "POST",
      body: JSON.stringify({
        name: form.name.value,
        requiresSearch: true,
        promptHint: form.promptHint.value,
        topicKeyword: form.topicKeyword.value || null,
        dailyCount: Number(form.dailyCount.value),
      }),
    });
    form.reset();
    await refreshCategories();
    await refreshSchedule();
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  // data-action이 붙은 요소는 전부 JS가 직접 처리하는 가짜 링크/버튼이라,
  // <a href="#">의 기본 동작(페이지 맨 위로 이동)이 실행되면 안 된다.
  // 이걸 안 막아주면 [매뉴얼 보기]/[최종 포스팅 기준] 보기] 같은 펼침 링크를
  // 눌렀을 때 실제로는 펼쳐졌는데 화면이 페이지 맨 위로 튀어서 마치
  // "눌러도 그대로 있다가 바로 닫히는 것"처럼 보이는 문제가 있었다.
  e.preventDefault();
  const { action, id } = btn.dataset;

  try {
    if (action === "generate") {
      btn.disabled = true;
      btn.textContent = "생성 중...";
      const result = await api("/api/run/generate", {
        method: "POST",
        body: JSON.stringify({ categoryId: Number(id) }),
      });
      await refreshQueue();
      // 글은 정상적으로 만들어졌지만 이미지 첨부만 실패한 경우, 서버가
      // 200 OK로 imageError 필드만 실어서 돌려준다 — 이걸 그냥 무시하면
      // 이미지 없는 초안이 조용히 생겨서 "이미지 생성이 안 된다"처럼 보인다.
      if (result.imageError) {
        alert(`글은 생성됐지만 이미지 첨부에 실패했습니다: ${result.imageError}\n\n포스팅 카드의 "이미지 재생성" 버튼으로 다시 시도해보세요.`);
      }
    } else if (action === "copy") {
      const post = readyPosts.find((p) => p.id === Number(id));
      if (post) {
        await navigator.clipboard.writeText(buildCopyText(post));
        const original = btn.textContent;
        btn.textContent = "복사됨!";
        setTimeout(() => {
          btn.textContent = original;
        }, 1500);
      }
    } else if (action === "regenerate-image") {
      btn.disabled = true;
      btn.textContent = "재생성 중...";
      const updated = await api(`/api/posts/${id}/regenerate-image`, { method: "POST" });
      if (updated.error) throw new Error(updated.error);
      await refreshQueue();
    } else if (action === "mark-published") {
      await api(`/api/posts/${id}/mark-published`, { method: "POST" });
      await refreshQueue();
      await refreshHistory();
    } else if (action === "delete-category") {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      await refreshCategories();
    } else if (action === "edit-category") {
      editingCategoryId = Number(id);
      renderCategories(categoriesCache);
    } else if (action === "cancel-edit-category") {
      editingCategoryId = null;
      renderCategories(categoriesCache);
    } else if (action === "save-category") {
      const row = btn.closest("tr");
      const name = row.querySelector(".edit-name").value.trim();
      const promptHint = row.querySelector(".edit-hint").value.trim();
      const topicKeyword = row.querySelector(".edit-keyword").value.trim();
      const dailyCount = Number(row.querySelector(".edit-daily").value);
      if (!name || !promptHint) {
        alert("이름과 설명은 비워둘 수 없습니다.");
        return;
      }
      await api(`/api/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, promptHint, topicKeyword: topicKeyword || null, dailyCount }),
      });
      editingCategoryId = null;
      await refreshCategories();
      // 편수를 바꾸면 «내일 몇 편» 이 달라진다. 설정 화면을 안 열어도 맞게 둔다.
      await refreshSchedule();
    } else if (action === "toggle-content") {
      const postId = Number(id);
      const preview = btn.closest(".post-card").querySelector(".post-preview");
      if (expandedPostIds.has(postId)) {
        expandedPostIds.delete(postId);
        preview.classList.add("collapsed");
      } else {
        expandedPostIds.add(postId);
        preview.classList.remove("collapsed");
      }
    } else if (action === "copy-image") {
      const src = btn.dataset.src;
      const res = await fetch(src);
      if (!res.ok) throw new Error(`이미지를 불러오지 못했습니다 (${res.status})`);
      const blob = await res.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      const pngBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
      const original = btn.textContent;
      btn.textContent = "복사됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } else if (action === "copy-alt") {
      await navigator.clipboard.writeText(btn.dataset.alt);
      const original = btn.textContent;
      btn.textContent = "복사됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } else if (action === "copy-title-variant") {
      await navigator.clipboard.writeText(btn.dataset.title);
      const original = btn.textContent;
      btn.textContent = "복사됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } else if (action === "download-image-log") {
      const token = getDashboardToken();
      const url = `/api/image-downloads/csv${token ? `?token=${encodeURIComponent(token)}` : ""}`;
      window.location.href = url;
    } else if (action === "switch-view") {
      e.preventDefault();
      await switchView(btn.dataset.view);
    } else if (action === "show-error") {
      alert(btn.dataset.error || "오류 메시지가 없습니다.");
    } else if (action === "save-setting") {
      const key = btn.dataset.key;
      const input = document.getElementById(btn.dataset.input);
      const value = input.value.trim();
      if (!value) {
        alert("값을 입력해주세요.");
        return;
      }
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      input.value = "";
      await refreshSettings();
      const original = btn.textContent;
      btn.textContent = "저장됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } else if (action === "test-claude") {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "테스트 중...";
      const resultEl = document.querySelector('[data-result="claude"]');
      try {
        const res = await api("/api/settings/test-claude", { method: "POST" });
        claudeTestedOk = !!res.ok;
        setStepBadge("claude", claudeTestedOk);
        updateSetupProgress();
        if (resultEl) {
          resultEl.textContent = res.ok ? "✅ 연결 성공" : `❌ 실패: ${res.error || "알 수 없는 오류"}`;
        }
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    } else if (action === "select-preset") {
      selectedPreset = btn.dataset.preset;
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ posting_direction_preset: selectedPreset }),
      });
      renderPresetGrid();
      renderFinalDirectionSummary();
    } else if (action === "save-posting-direction") {
      const refinement = document.getElementById("posting-direction-refinement").value;
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ posting_direction_refinement: refinement }),
      });
      renderFinalDirectionSummary();
      const original = btn.textContent;
      btn.textContent = "저장됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } else if (action === "toggle-final-direction") {
      renderFinalDirectionSummary();
      const el = document.getElementById("final-direction-summary");
      el.hidden = !el.hidden;
      btn.textContent = el.hidden ? "[최종 포스팅 기준] 보기" : "[최종 포스팅 기준] 닫기";
    } else if (action === "preview-post") {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "생성 중...";
      const resultEl = document.getElementById("preview-post-result");
      resultEl.innerHTML = `<p class="muted">샘플을 생성하는 중입니다 (수십 초 정도 걸릴 수 있어요)...</p>`;
      try {
        const res = await api("/api/settings/preview-post", { method: "POST" });
        if (res.error) throw new Error(res.error);
        resultEl.innerHTML = `<div class="post-card"><strong>${escapeHtml(res.title)}</strong><p class="post-preview">${escapeHtml(res.content)}</p></div>`;
      } catch (err) {
        resultEl.innerHTML = "";
        alert(err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    } else if (action === "toggle-manual") {
      const key = btn.dataset.manual;
      const panel = document.querySelector(`[data-manual-panel="${key}"]`);
      if (!panel) return;
      panel.hidden = !panel.hidden;
      btn.textContent = panel.hidden ? "[매뉴얼 보기]" : "[매뉴얼 닫기]";
    } else if (action === "copy-code") {
      const target = document.getElementById(btn.dataset.target);
      await navigator.clipboard.writeText(target.textContent);
      const original = btn.textContent;
      btn.textContent = "복사됨!";
      setTimeout(() => {
        btn.textContent = original;
      }, 1500);
    } else if (action === "show-add-preset-form") {
      document.getElementById("preset-add-form").hidden = false;
    } else if (action === "cancel-new-preset") {
      document.getElementById("preset-add-form").hidden = true;
      document.getElementById("preset-add-label").value = "";
      document.getElementById("preset-add-description").value = "";
      document.getElementById("preset-add-instruction").value = "";
    } else if (action === "save-new-preset") {
      const label = document.getElementById("preset-add-label").value.trim();
      const description = document.getElementById("preset-add-description").value.trim();
      const instruction = document.getElementById("preset-add-instruction").value.trim();
      if (!label || !instruction) {
        alert("프리셋 이름과 AI 지시문은 필수입니다.");
        return;
      }
      const created = await api("/api/settings/posting-direction-presets", {
        method: "POST",
        body: JSON.stringify({ label, description, instruction }),
      });
      document.getElementById("preset-add-form").hidden = true;
      document.getElementById("preset-add-label").value = "";
      document.getElementById("preset-add-description").value = "";
      document.getElementById("preset-add-instruction").value = "";
      await reloadPresets();
      selectedPreset = created.id;
      await api("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ posting_direction_preset: selectedPreset }),
      });
      renderPresetGrid();
      renderFinalDirectionSummary();
    } else if (action === "delete-preset") {
      if (!confirm("이 프리셋을 삭제할까요?")) return;
      await api(`/api/settings/posting-direction-presets/${btn.dataset.preset}`, { method: "DELETE" });
      if (selectedPreset === btn.dataset.preset) selectedPreset = "balanced";
      await reloadPresets();
      renderPresetGrid();
      renderFinalDirectionSummary();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    if (action === "generate") {
      btn.disabled = false;
      btn.textContent = "지금 생성";
    }
    if (action === "regenerate-image") {
      btn.disabled = false;
      btn.textContent = "이미지 재생성";
    }
  }
});

document.querySelectorAll('input[name="blog_type"]').forEach((radio) => {
  radio.addEventListener("change", async () => {
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ blog_type: radio.value }) });
    } catch (err) {
      alert(err.message);
    }
  });
});

document.getElementById("blog-topic-select").addEventListener("change", async (e) => {
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ blog_topic: e.target.value }) });
  } catch (err) {
    alert(err.message);
  }
});

function safeRefreshAll() {
  refreshAll().catch((err) => console.error("[maim] refreshAll 실패:", err));
}

safeRefreshAll();
setInterval(safeRefreshAll, 15000);

// 홈 화면의 "AI 연결 상태" 카드가 처음부터 정확한 값을 보여주도록, 설정
// 섹션을 열기 전이라도 한 번 가볍게 불러와둔다(전부 로컬 DB 조회라 저렴함).
refreshSettings()
  .then(renderHome)
  .catch((err) => console.error("[maim] 초기 설정 조회 실패:", err));


// 이미 토큰을 들고 있는 브라우저도 확인을 시작해야 한다. 안 그러면 다른
// 기기가 같은 2차키로 들어왔을 때, 화면을 새로 열기 전까지 끊긴 줄 모른다.
if (getDashboardToken()) { startHeartbeat(); }


// ─────────────────────────────────────────── 포스팅 예약 설정
//
// 설정만 있고 결과가 안 보이면, 맞게 넣었는지 **다음 날 아침까지** 알 수가
// 없다. 그래서 «지금 이대로면 내일 무엇이 몇 편 나오는가» 를 그대로 보여 준다.

async function refreshSchedule() {
  const 칸 = document.getElementById("schedule-orders");
  if (!칸) return;
  let s;
  try {
    s = await api("/api/schedule");
  } catch {
    return;   // 로그인 전이거나 잠깐 못 닿은 것. 다음 차례에 다시 그린다
  }

  칸.innerHTML = s.orders.map((o) => `
    <label class="schedule-order">
      <input type="radio" name="schedule_order" value="${o.id}" ${o.id === s.order ? "checked" : ""} />
      <span>${escapeHtml(o.label)}</span>
    </label>`).join("");

  const 수 = document.getElementById("schedule-planned");
  const 말 = document.getElementById("schedule-note");
  if (수) 수.textContent = s.planned;
  if (말) {
    말.textContent = s.trimmed > 0
      ? `카테고리 편수를 모두 더하면 ${s.planned + s.trimmed}편인데, 하루 상한이 ${s.dailyCap}편이라 ${s.trimmed}편은 잘립니다.`
      : s.planned === 0
        ? "지금은 아무것도 준비되지 않습니다. [블로그 관리]에서 카테고리의 하루 편수를 1 이상으로 올려 주세요."
        : "지금 설정대로면 내일 아침에 이만큼 준비됩니다.";
  }

  // 자명종이 꺼졌나. 한 번도 안 돌았거나 36시간이 넘었으면 알린다.
  // 36시간으로 두는 이유는, 하루에 한 번 도는 일이라 24시간을 갓 넘긴 것만
  // 으로는 «늦은 것» 인지 «꺼진 것» 인지 가릴 수 없기 때문이다.
  const 종 = document.getElementById("schedule-alarm");
  if (종) {
    const 마지막 = s.lastRun ? Date.parse(s.lastRun) : NaN;
    const 잠잠 = Number.isNaN(마지막) || (Date.now() - 마지막) > 36 * 60 * 60 * 1000;
    종.hidden = !잠잠;
    const 말 = 종.querySelector("strong");
    if (말) {
      말.textContent = Number.isNaN(마지막)
        ? "⏰ 자동 준비가 한 번도 돌지 않았습니다"
        : `⏰ 자동 준비가 ${new Date(마지막).toLocaleString("ko-KR")} 이후로 멈춰 있습니다`;
    }
  }

  const 미리 = document.getElementById("schedule-preview");
  if (미리) {
    미리.innerHTML = s.preview.length === 0
      ? '<li class="muted">준비할 것이 없습니다</li>'
      : s.preview.map((x) => `<li>${escapeHtml(x.name)}${x.nth > 1 ? ` <span class="muted">(${x.nth}편째)</span>` : ""}</li>`).join("");
  }
}

document.addEventListener("change", async (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.name !== "schedule_order") return;
  try {
    await api("/api/schedule", { method: "PUT", body: JSON.stringify({ order: el.value }) });
    await refreshSchedule();
  } catch (err) {
    alert("차례를 바꾸지 못했습니다: " + (err && err.message ? err.message : err));
  }
});
