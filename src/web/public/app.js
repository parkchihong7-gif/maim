async function api(path, options) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

async function refreshAuth() {
  const status = await api("/api/auth/status");
  const badge = document.getElementById("auth-status");
  const detail = document.getElementById("auth-detail");
  badge.textContent =
    status.naverLoginStatus === "connected" ? "네이버 연결됨" : "네이버 미연결";
  detail.textContent = `배포 모드: ${status.deploymentMode} / 세션 파일: ${
    status.hasSavedSession ? "있음" : "없음"
  } / 마지막 로그인: ${status.naverLoginAt ?? "-"}`;

  const loginBtn = document.getElementById("btn-login");
  const isVps = status.deploymentMode === "vps";
  loginBtn.disabled = status.loginInProgress || isVps;
  loginBtn.textContent = status.loginInProgress ? "로그인 대기 중..." : "로그인";
  loginBtn.hidden = isVps;

  document.getElementById("export-session-box").hidden = isVps;
  document.getElementById("import-session-box").hidden = !isVps;
}

async function refreshCategories() {
  const categories = await api("/api/categories");
  const tbody = document.querySelector("#category-table tbody");
  tbody.innerHTML = "";
  for (const c of categories) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${c.requires_search ? "예" : "아니오"}</td>
      <td>${c.active ? "활성" : "비활성"}</td>
      <td>
        <button data-action="generate" data-id="${c.id}">지금 생성</button>
        <button data-action="delete-category" data-id="${c.id}">삭제</button>
      </td>`;
    tbody.appendChild(tr);
  }
}

async function refreshQueue() {
  const { remainingToday, dailyCap, items } = await api("/api/queue");
  document.getElementById("cap-indicator").textContent = `오늘 ${
    dailyCap - remainingToday
  }/${dailyCap} 사용`;

  const tbody = document.querySelector("#queue-table tbody");
  tbody.innerHTML = "";
  for (const p of items) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.id}</td>
      <td>${p.category_name}</td>
      <td>${p.title ?? ""}</td>
      <td>${p.status}</td>
      <td><button data-action="publish" data-id="${p.id}">지금 발행</button></td>`;
    tbody.appendChild(tr);
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
      <td>${p.category_name}</td>
      <td>${p.title ?? ""}</td>
      <td>${p.status}</td>
      <td>${p.published_at ?? "-"}</td>
      <td>${p.error_message ?? ""}</td>`;
    tbody.appendChild(tr);
  }
}

async function refreshSettings() {
  const settings = await api("/api/settings");
  const form = document.getElementById("settings-form");
  form.postsPerDay.value = settings.postsPerDay ?? 5;
  form.publishWindowStart.value = settings.publishWindowStart ?? "09:00";
  form.publishWindowEnd.value = settings.publishWindowEnd ?? "22:00";
}

async function refreshAll() {
  await Promise.all([
    refreshAuth(),
    refreshCategories(),
    refreshQueue(),
    refreshHistory(),
    refreshSettings(),
  ]);
}

document.getElementById("btn-login").addEventListener("click", async () => {
  await api("/api/auth/login", { method: "POST" });
  await refreshAuth();
});

document.getElementById("export-session-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const passphrase = e.target.passphrase.value;
  window.location.href = `/api/auth/export-session?passphrase=${encodeURIComponent(passphrase)}`;
});

document.getElementById("import-session-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const file = form.file.files[0];
  const passphrase = form.passphrase.value;
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const fileBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

  await api("/api/auth/import-session", {
    method: "POST",
    body: JSON.stringify({ fileBase64, passphrase }),
  });
  form.reset();
  await refreshAuth();
});

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
    body: JSON.stringify({
      postsPerDay: form.postsPerDay.value,
      publishWindowStart: form.publishWindowStart.value,
      publishWindowEnd: form.publishWindowEnd.value,
    }),
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
    } else if (action === "publish") {
      btn.disabled = true;
      btn.textContent = "발행 중...";
      await api("/api/run/publish", {
        method: "POST",
        body: JSON.stringify({ postId: Number(id) }),
      });
      await refreshQueue();
      await refreshHistory();
    } else if (action === "delete-category") {
      await api(`/api/categories/${id}`, { method: "DELETE" });
      await refreshCategories();
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
    if (action === "generate") btn.textContent = "지금 생성";
    if (action === "publish") btn.textContent = "지금 발행";
  }
});

refreshAll();
setInterval(refreshAll, 15000);
