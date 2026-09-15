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

// refreshAll()이 카테고리/큐/히스토리를 동시에 불러오다 보니 토큰이 없을 때
// 401이 한꺼번에 여러 번 돌아온다. 이 값이 없으면 새로 prompt()를 띄우고,
// 이미 떠 있으면 그 결과를 같이 기다려서 창이 여러 개 겹쳐 뜨지 않게 한다.
let dashboardTokenPromptPromise = null;

const DEVICE_LABEL_KO = { pc: "PC", laptop: "노트북", mobile: "휴대폰" };

/** 입력값(마스터 토큰 / 1차 초대 코드 / 2차 기기 코드)을 교환한다. 마스터·2차 코드는
 * 곧바로 세션 토큰({token})을, 1차 코드는 기기별 2차 코드 3개({tier:1, deviceCodes})를
 * 돌려준다. 이 호출 자체는 로그인 전이라 토큰이 없는 게 당연하므로 인증 훅의 예외 대상이다. */
async function redeemToken(value) {
  const res = await fetch("/api/auth/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "인증에 실패했습니다.");
  return data;
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
    // window.prompt()는 동기/블로킹이라, 이 요청이 401을 받은 시점과 그 처리를
    // 실제로 실행하는 시점 사이에 "먼저 온" 다른 요청의 prompt가 이미 뜨고
    // 닫혔을 수 있다. 그러면 dashboardTokenPromptPromise는 이미 null로
    // 리셋된 뒤라 아래 없이는 이 요청도 새 창을 또 띄운다. 그러니 새 창을
    // 띄우기 전에 "혹시 그새 다른 요청이 이미 토큰을 받아왔는지"부터 확인한다.
    const latestToken = getDashboardToken();
    if (latestToken && latestToken !== token) {
      return api(path, options);
    }
    if (!dashboardTokenPromptPromise) {
      dashboardTokenPromptPromise = Promise.resolve()
        .then(async () => {
          let lastError = "";
          for (;;) {
            const entered = window.prompt(
              (lastError ? `${lastError}\n\n` : "") + "대시보드 토큰 또는 접속 코드를 입력하세요:",
            );
            if (!entered) return null;
            try {
              const result = await redeemToken(entered);
              if (result.token) return result.token;
              if (result.tier === 1 && result.deviceCodes) {
                // 1차(초대) 코드는 그 자체로 로그인되지 않는다 — 기기별 2차 코드
                // 3개를 발급받았다고 보여주고, 그중 하나를 다시 입력받는다.
                const lines = result.deviceCodes
                  .map((d) => `${DEVICE_LABEL_KO[d.device_label] || d.device_label}: ${d.code}`)
                  .join("\n");
                alert(
                  `1차 초대 코드가 확인됐습니다. 기기별 코드 3개가 발급됐어요 — 꼭 기록해두세요(다시 보여주지 않습니다):\n\n${lines}\n\n지금 이 기기에서 로그인하려면, 위 코드 중 이 기기에 맞는 코드 하나를 아래 입력창에 입력하세요.`,
                );
                lastError = "";
                continue;
              }
              lastError = "예상치 못한 응답입니다. 다시 시도해주세요.";
            } catch (err) {
              lastError = err.message;
            }
          }
        })
        .finally(() => {
          dashboardTokenPromptPromise = null;
        });
    }
    const sessionToken = await dashboardTokenPromptPromise;
    if (sessionToken) {
      setDashboardToken(sessionToken);
      return api(path, options);
    }
    throw new Error("대시보드 토큰이 필요합니다.");
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
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
        <td colspan="4">
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

    card.innerHTML = `
      <div class="post-card-header">
        <strong class="post-title-toggle" data-action="toggle-content" data-id="${p.id}">${escapeHtml(p.title ?? "(제목 없음)")}</strong>
        <span class="badge">${escapeHtml(p.category_name)}</span>
      </div>
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
  const okCount = [claudeTestedOk, unsplashOk, pexelsOk].filter(Boolean).length;
  const aiEl = document.getElementById("stat-ai-status");
  const aiHint = document.getElementById("stat-ai-hint");
  if (okCount === 3) {
    aiEl.textContent = "정상";
    aiHint.textContent = "Claude·이미지 API 모두 연결됨";
  } else if (lastSettingsSnapshot === null) {
    aiEl.textContent = "확인 필요";
    aiHint.textContent = "관리자 설정에서 확인하세요";
  } else {
    aiEl.textContent = "설정 필요";
    aiHint.textContent = `${okCount}/3 연결됨 — 관리자 설정에서 확인`;
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
  const done = [claudeTestedOk, unsplashDone, pexelsDone].filter(Boolean).length;
  const el = document.getElementById("setup-progress");
  if (el) el.textContent = `3단계 중 ${done}단계 완료`;
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

async function refreshAccessCodes() {
  const section = document.getElementById("access-codes-section");
  if (!isMasterSession) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const tree = await api("/api/auth/codes");
  const container = document.getElementById("access-codes-list");
  container.innerHTML = tree
    .map((t1) => {
      const childrenHtml =
        t1.deviceCodes.length > 0
          ? `<div class="access-code-children">${t1.deviceCodes
              .map(
                (d) => `
              <div class="access-code-row access-code-child">
                <span class="muted">${escapeHtml(DEVICE_LABEL_KO[d.device_label] || d.device_label)}</span>
                <code>${escapeHtml(d.code)}</code>
                <span class="badge ${d.redeemed ? "badge-inactive" : "badge-active"}">${d.redeemed ? "사용됨" : "미사용"}</span>
              </div>`,
              )
              .join("")}</div>`
          : "";
      return `
        <div class="access-code-group">
          <div class="access-code-row">
            <code>${escapeHtml(t1.code)}</code>
            <span class="badge ${t1.redeemed ? "badge-inactive" : "badge-active"}">${t1.redeemed ? "등록됨" : "미등록"}</span>
          </div>
          ${childrenHtml}
        </div>`;
    })
    .join("");
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
  await refreshAccessCodes();
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
  if (view === "settings") await refreshSettings();
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
      }),
    });
    form.reset();
    await refreshCategories();
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;

  try {
    if (action === "generate") {
      btn.disabled = true;
      btn.textContent = "생성 중...";
      await api("/api/run/generate", {
        method: "POST",
        body: JSON.stringify({ categoryId: Number(id) }),
      });
      await refreshQueue();
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
      if (!name || !promptHint) {
        alert("이름과 설명은 비워둘 수 없습니다.");
        return;
      }
      await api(`/api/categories/${id}`, {
        method: "PUT",
        body: JSON.stringify({ name, promptHint, topicKeyword: topicKeyword || null }),
      });
      editingCategoryId = null;
      await refreshCategories();
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
    } else if (action === "reset-access-codes") {
      if (!confirm("기존 접속 코드 10개를 모두 폐기하고 새로 발급할까요? 이미 나눠준 코드는 즉시 무효화됩니다.")) return;
      await api("/api/auth/codes/reset", { method: "POST" });
      await refreshAccessCodes();
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
