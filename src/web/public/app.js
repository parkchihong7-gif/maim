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

async function refreshCategories() {
  const categories = await api("/api/categories");
  const tbody = document.querySelector("#category-table tbody");
  tbody.innerHTML = "";
  for (const c of categories) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td><span class="badge ${c.active ? "badge-active" : "badge-inactive"}">${c.active ? "활성" : "비활성"}</span></td>
      <td>
        <button class="btn-primary" data-action="generate" data-id="${c.id}">지금 생성</button>
        <button class="btn-danger" data-action="delete-category" data-id="${c.id}">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

let readyPosts = [];

function getImagePaths(post) {
  if (!post.image_paths_json) return [];
  try {
    const parsed = JSON.parse(post.image_paths_json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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
    const imagesHtml =
      imagePaths.length > 0
        ? `<div class="post-images">${imagePaths
            .map(
              (_, idx) =>
                `<img class="post-thumb" src="/api/posts/${p.id}/image/${idx}?t=${Date.now()}" alt="이미지 ${idx + 1}" />`,
            )
            .join("")}</div>`
        : `<p class="muted">이미지 없음</p>`;
    card.innerHTML = `
      <div class="post-card-header">
        <strong>${escapeHtml(p.title ?? "(제목 없음)")}</strong>
        <span class="badge">${escapeHtml(p.category_name)}</span>
      </div>
      ${imagesHtml}
      <p class="post-preview">${escapeHtml((p.content ?? "").slice(0, 150))}...</p>
      <p class="muted">${tags.join(" ")}</p>
      <div class="post-card-actions">
        <button class="btn-secondary" data-action="copy" data-id="${p.id}">복사하기</button>
        <button class="btn-secondary" data-action="regenerate-image" data-id="${p.id}">이미지 재생성</button>
        <button class="btn-success" data-action="mark-published" data-id="${p.id}">발행 완료로 표시</button>
      </div>`;
    container.appendChild(card);
  }
}

async function refreshHistory() {
  const items = await api("/api/history?limit=30");
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
  await Promise.all([refreshCategories(), refreshQueue(), refreshHistory()]);
}

document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  await api("/api/categories", {
    method: "POST",
    body: JSON.stringify({
      name: form.name.value,
      requiresSearch: true,
      promptHint: form.promptHint.value,
    }),
  });
  form.reset();
  await refreshCategories();
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
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

function safeRefreshAll() {
  refreshAll().catch((err) => console.error("[maim] refreshAll 실패:", err));
}

safeRefreshAll();
setInterval(safeRefreshAll, 15000);
