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

async function api(path, options) {
  const token = getDashboardToken();
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-dashboard-token": token } : {}),
    },
    ...options,
  });

  if (res.status === 401) {
    const entered = window.prompt("대시보드 토큰이 필요합니다 (DASHBOARD_TOKEN):");
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
      <td>${c.requires_search ? "예" : "아니오"}</td>
      <td>${c.active ? "활성" : "비활성"}</td>
      <td>
        <button data-action="generate" data-id="${c.id}">지금 생성</button>
        <button data-action="delete-category" data-id="${c.id}">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

let readyPosts = [];

async function refreshQueue() {
  const { remainingToday, dailyCap, items } = await api("/api/queue");
  document.getElementById("cap-indicator").textContent = `오늘 ${
    dailyCap - remainingToday
  }/${dailyCap} 생성`;

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
    card.innerHTML = `
      <div class="post-card-header">
        <strong>${escapeHtml(p.title ?? "(제목 없음)")}</strong>
        <span class="badge">${escapeHtml(p.category_name)}</span>
      </div>
      ${p.image_path ? `<img class="post-thumb" src="/api/posts/${p.id}/image" alt="대표 이미지" />` : `<p class="muted">이미지 없음</p>`}
      <p class="post-preview">${escapeHtml((p.content ?? "").slice(0, 150))}...</p>
      <p class="muted">${tags.join(" ")}</p>
      <div class="post-card-actions">
        <button data-action="copy" data-id="${p.id}">복사하기</button>
        <button data-action="mark-published" data-id="${p.id}">발행 완료로 표시</button>
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
      <td>${p.status}</td>
      <td>${p.published_at ?? "-"}</td>
      <td>${escapeHtml(p.error_message ?? "")}</td>`;
    tbody.appendChild(tr);
  }
}

async function refreshSettings() {
  const settings = await api("/api/settings");
  const form = document.getElementById("settings-form");
  form.postsPerDay.value = settings.postsPerDay ?? 5;
}

async function refreshAll() {
  await Promise.all([refreshCategories(), refreshQueue(), refreshHistory(), refreshSettings()]);
}

document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  await api("/api/categories", {
    method: "POST",
    body: JSON.stringify({
      name: form.name.value,
      requiresSearch: form.requiresSearch.checked,
      promptHint: form.promptHint.value,
    }),
  });
  form.reset();
  await refreshCategories();
});

document.getElementById("settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify({ postsPerDay: form.postsPerDay.value }),
  });
  await refreshSettings();
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
  }
});

refreshAll();
setInterval(refreshAll, 15000);
