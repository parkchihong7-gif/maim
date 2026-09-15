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
        .then(() => window.prompt("대시보드 토큰이 필요합니다 (DASHBOARD_TOKEN):"))
        .finally(() => {
          dashboardTokenPromptPromise = null;
        });
    }
    const entered = await dashboardTokenPromptPromise;
    if (entered) {
      setDashboardToken(entered);
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

async function refreshAll() {
  // 초안 품질 체크리스트가 히스토리 데이터(historyCache)로 "최근 글과 주제
  // 중복" 여부를 계산하므로, 큐보다 히스토리를 먼저 받아온다.
  await refreshHistory();
  // 카테고리를 수정하는 중에는 15초 자동 새로고침이 입력 중인 값을 서버의
  // 최신 값으로 덮어써버리지 않도록 그동안은 카테고리 목록만 건너뛴다.
  const tasks = [refreshQueue()];
  if (editingCategoryId === null) tasks.push(refreshCategories());
  await Promise.all(tasks);
}

// --- ⚙️ 관리자 설정: AI 커넥트 연결 / 블로그 주제 설정 / 포스팅 방향 설정 ---
// 설정 섹션은 기본 접힘 상태라 15초 자동 새로고침 대상에 넣지 않고, 처음
// 펼칠 때만 불러온다(자주 안 바뀌는 값이라 폴링할 이유가 없음).

let postingDirectionPresets = [];
let selectedPreset = "balanced";
// Claude CLI 로그인 여부는 저장된 값이 아니라 "연결 테스트" 버튼을 눌렀을 때만
// 확인 가능한 라이브 상태라서, 페이지를 새로고침하면 다시 초기화된다.
let claudeTestedOk = false;

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

function renderPresetGrid() {
  const grid = document.getElementById("preset-grid");
  if (!grid || postingDirectionPresets.length === 0) return;
  grid.innerHTML = postingDirectionPresets
    .map(
      (p) => `
      <div class="preset-card${p.id === selectedPreset ? " selected" : ""}" data-action="select-preset" data-preset="${p.id}">
        <strong>${escapeHtml(p.label)}</strong>
        <p class="muted">${escapeHtml(p.description)}</p>
      </div>`,
    )
    .join("");
}

function renderFinalDirectionSummary() {
  const el = document.getElementById("final-direction-summary");
  if (!el) return;
  const preset = postingDirectionPresets.find((p) => p.id === selectedPreset);
  const refinement = document.getElementById("posting-direction-refinement").value.trim();
  const parts = [`톤 프리셋: ${preset ? preset.label : selectedPreset}`];
  if (refinement) parts.push(`보강 지시: ${refinement}`);
  el.textContent = parts.join(" / ");
}

async function refreshSettings() {
  const s = await api("/api/settings");

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
    } else if (action === "admin-settings-toggle") {
      const section = document.getElementById("admin-settings");
      const willShow = section.hidden;
      section.hidden = !willShow;
      btn.textContent = willShow ? "⚙️ 관리자 설정 닫기" : "⚙️ 관리자 설정";
      if (willShow) await refreshSettings();
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
