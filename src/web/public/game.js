/**
 * 🕹️ 게임 스샷 탭 (관리자 접속 + 게임 블로그만) — 2026-10-21 개편.
 *
 *   스샷       날짜·게임별 앨범. 사진을 누르면 이미지가 복사된다 → 네이버 에디터에 Ctrl+V. 메모·지우기·«기타» 등록
 *   게임 목록  게임 이름 + 창 제목 글자. 집 PC 는 단축키를 누른 순간 맨 앞 창 제목으로 게임을 찾는다
 *   설정       단축키 · 🔑 집 PC 연결 토큰 · 보관 날수
 * 📝 포스팅 카드의 [+ 스샷 더 넣기]·[🔄 스샷 바꾸기] 와 카테고리 폼 ⑧ 연결 게임 목록도 여기서 처리한다.
 *
 * app.js 의 api()·escapeHtml()·getDashboardToken()·refreshQueue() 를 그대로 쓴다.
 */
(() => {
  const esc = (t) => escapeHtml(String(t ?? ""));
  const G = {
    tab: "shots", status: null, games: null, settings: null, token: null, timer: null, 바쁨: false,
    거름: { game: "", day: "today", unused: false, page: 1 }, album: null, sel: new Set(), 고칠게임: null,
    pick: null,
  };
  const 앨범쪽 = 48;
  const 이미지 = (url) => { const t = getDashboardToken(); return t ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : url; };
  const 시분 = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const 월일 = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };
  const 오늘인가 = (iso) => new Date(iso).toDateString() === new Date().toDateString();
  const 판 = (n) => document.querySelector(`[data-g-pane="${n}"]`);
  const 날짜글 = { today: "오늘", yesterday: "어제", "7d": "지난 7일", all: "전체" };
  const 게임이름 = (id) => (id === "etc" ? "기타" : G.games?.items.find((g) => g.id === id)?.이름 ?? id);

  // ── 이미지 복사 — 클릭한 그 순간(사용자 동작) 안에서 클립보드에 넣어야 해서 Promise 를 그대로 넘긴다 ──
  async function PNG로(url) {
    const res = await fetch(이미지(`${url}?raw=1`));
    if (!res.ok) throw new Error(`이미지를 불러오지 못했습니다 (${res.status})`);
    const bitmap = await createImageBitmap(await res.blob());
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    canvas.getContext("2d").drawImage(bitmap, 0, 0);
    return new Promise((ok) => canvas.toBlob(ok, "image/png"));
  }
  async function 복사(url, 칸) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": PNG로(url) })]);
    } catch {
      // Promise 를 못 받는 브라우저 — 다 받아 놓고 다시
      await navigator.clipboard.write([new ClipboardItem({ "image/png": await PNG로(url) })]);
    }
    칸?.classList.add("copied");
    setTimeout(() => 칸?.classList.remove("copied"), 1200);
  }

  // ── 불러오기 ─────────────────────────────────────────
  async function 상태읽기() {
    G.status = await api("/api/game/status");
    G.games = await api("/api/game/games");
  }
  async function 앨범읽기() {
    const f = G.거름;
    const q = new URLSearchParams({ day: f.day, page: String(f.page), size: String(앨범쪽), ...(f.game ? { game: f.game } : {}), ...(f.unused ? { unused: "1" } : {}) });
    G.album = await api(`/api/game/shots?${q}`);
    for (const id of [...G.sel]) if (!G.album.items.some((s) => s.id === id)) G.sel.delete(id);
  }

  async function 새로고침() {
    if (G.바쁨) return;
    G.바쁨 = true;
    try {
      await 상태읽기();
      위쪽그리기();
      if (G.tab === "shots") { await 앨범읽기(); 스샷그리기(); }
      if (G.tab === "games") 게임그리기();
      if (G.tab === "settings") await 설정열기();
    } catch (탈) {
      판(G.tab).innerHTML = `<div class="g-alert bad">불러오지 못했습니다 — ${esc(탈.message)}</div>`;
    } finally { G.바쁨 = false; }
  }

  function 열기() {
    새로고침();
    clearInterval(G.timer);
    // 보고 있는 동안 10초마다 — 게임에서 찍은 스샷이 저절로 나타난다.
    G.timer = setInterval(() => {
      if (document.querySelector('[data-view-panel="game"]')?.hidden) { clearInterval(G.timer); return; }
      if (G.tab !== "shots" || G.sel.size) return;
      if (document.activeElement?.closest?.('[data-view-panel="game"] input, [data-view-panel="game"] select')) return;
      새로고침();
    }, 10_000);
  }

  function 탭(t) {
    G.tab = t;
    document.querySelectorAll("#g-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    document.querySelectorAll("[data-g-pane]").forEach((p) => { p.hidden = p.dataset.gPane !== t; });
    새로고침();
  }

  // ── 맨 위: 연결 막대 · 처음 안내 ──────────────────────
  function 위쪽그리기() {
    const s = G.status;
    const 칸 = document.getElementById("g-setup");
    const 알림 = [];
    if (s.needsGameBucket) 알림.push(`<div class="g-alert bad"><b>게임 사진 저장통이 없습니다.</b> 서버 환경변수 <code>GAME_SHOT_BUCKET</code> 을 넣어야 켜집니다(Cloud Shell <code>deploy/게임배포.sh</code>).</div>`);
    if (!s.agentTokenSet) 알림.push(`<div class="g-alert warn"><b>집 PC 연결 토큰이 없습니다.</b> <a href="#" data-action="g-tab" data-tab="settings">[설정 → 🔑 집 PC 연결]</a> 에서 [토큰 만들기] 를 누르세요.</div>`);
    const a = s.agent;
    const 마지막 = s.lastShot ? `마지막 스샷 ${오늘인가(s.lastShot.taken_at) ? "" : 월일(s.lastShot.taken_at) + " "}${시분(s.lastShot.taken_at)} · ${esc(s.lastShot.game_name)}` : "아직 스샷이 없습니다";
    const 막대 = a.connected
      ? `<div class="g-bar ok"><span><span class="g-dot"></span><b>집 PC 연결됨</b></span><span>📸 단축키 <kbd>${esc(s.단축키)}</kbd></span><span class="muted">${마지막}</span></div>`
      : `<div class="g-bar off"><span><span class="g-dot"></span><b>집 PC 꺼짐</b></span><span class="muted">${a.secondsAgo === null ? "아직 한 번도 연결되지 않았습니다." : "바탕화면 «maim 게임 켜기» 를 켜면 연결됩니다."}</span><span class="muted">${마지막}</span></div>`;
    칸.innerHTML = 알림.join("") + 막대;
  }

  // ── ① 스샷 ───────────────────────────────────────────
  function 게임고르기(id, 값, 전체글) {
    const g = G.games;
    return `<select id="${id}" class="g-select">${전체글 ? `<option value="">${전체글}</option>` : ""}
      ${g.items.map((x) => `<option value="${esc(x.id)}" ${x.id === 값 ? "selected" : ""}>${esc(x.이름)}</option>`).join("")}
      <option value="etc" ${값 === "etc" ? "selected" : ""}>기타 (목록에 없는 창)</option></select>`;
  }

  function 장수(day) {
    const 키 = { today: "오늘", yesterday: "어제", "7d": "칠일", all: "전체" }[day];
    const 줄 = G.거름.game ? [...G.games.items, G.games.etc].filter((g) => g.id === G.거름.game) : [...G.games.items, G.games.etc];
    return 줄.reduce((n, g) => n + (g.shots?.[키] ?? 0), 0);
  }

  function 스샷그리기() {
    const f = G.거름, d = G.album;
    const 기타보기 = f.game === "etc";
    판("shots").innerHTML = `
      <div class="g-filters">
        ${게임고르기("g-f-game", f.game, "전체 게임")}
        <select id="g-f-day" class="g-select">${Object.entries(날짜글).map(([k, v]) => `<option value="${k}" ${k === f.day ? "selected" : ""}>${v} · ${장수(k)}장</option>`).join("")}</select>
        <label class="g-small"><input type="checkbox" id="g-f-unused" ${f.unused ? "checked" : ""}> 글에 안 쓴 것만</label>
        <span class="g-flex1"></span>
        <label class="g-file btn-small" title="${f.game ? "휴대폰·PC 에서 찍은 사진을 이 게임에 올립니다" : "위에서 게임을 먼저 고르세요"}">📁 사진 올리기<input type="file" accept="image/*" multiple data-g-upload ${f.game ? "" : "disabled"} hidden></label>
        <button class="btn-danger btn-small" data-action="g-del-sel" ${G.sel.size ? "" : "disabled"}>선택 지우기${G.sel.size ? ` (${G.sel.size})` : ""}</button>
      </div>
      ${기타보기 ? `<p class="g-note">«기타» 는 게임 목록에 없는 창에서 찍은 스샷입니다. 사진 아래 [이 게임으로 등록] 을 누르면 같은 창에서 찍은 스샷이 모두 그 게임으로 옮겨 가고, 다음부터는 그 게임으로 찍힙니다.</p>` : ""}
      ${d.items.length ? `<div class="g-grid">${d.items.map(스샷칸).join("")}</div>` : `<div class="g-empty"><b>${날짜글[f.day]} 스샷이 없습니다.</b><br>게임을 하다가 <kbd>${esc(G.status.단축키)}</kbd> 를 누르면 여기에 쌓입니다. 집 PC 의 «maim 게임 켜기» 창이 떠 있어야 합니다.</div>`}
      ${d.pages > 1 ? `<div class="g-pager"><button class="btn-secondary btn-small" data-action="g-page" data-d="-1" ${d.page <= 1 ? "disabled" : ""}>‹ 이전</button><span>${d.page} / ${d.pages}쪽 · ${d.total}장</span><button class="btn-secondary btn-small" data-action="g-page" data-d="1" ${d.page >= d.pages ? "disabled" : ""}>다음 ›</button></div>` : ""}
      <p class="faint g-small">사진을 누르면 이미지가 복사됩니다 → 네이버 에디터에서 <kbd>Ctrl</kbd>+<kbd>V</kbd>. 왼쪽 위 네모로 여러 장 골라 한꺼번에 지울 수 있습니다.</p>`;
  }

  function 스샷칸(s) {
    const 고름 = G.sel.has(s.id);
    return `<div class="g-shot ${고름 ? "sel" : ""}">
      <button class="g-shot-img" data-action="g-copy" data-id="${s.id}" data-url="${esc(s.url)}" title="누르면 복사">
        <img src="${esc(이미지(s.url))}" alt="${esc(s.caption || `${s.game_name} 스샷`)}" loading="lazy">
        ${s.used ? `<span class="g-tag">글에 씀</span>` : ""}
      </button>
      <label class="g-check" title="고르기"><input type="checkbox" data-g-sel="${s.id}" ${고름 ? "checked" : ""}></label>
      <div class="g-meta"><span>${오늘인가(s.taken_at) ? "" : 월일(s.taken_at) + " "}${시분(s.taken_at)}${G.거름.game ? "" : ` · ${esc(s.game_name)}`}</span>
        <span class="g-acts"><button class="btn-secondary btn-small" data-action="g-memo" data-id="${s.id}">메모</button><button class="btn-secondary btn-small" data-action="g-del" data-id="${s.id}">지우기</button></span></div>
      ${s.caption ? `<div class="g-cap">${esc(s.caption)}</div>` : ""}
      ${s.game_id === "etc" ? `<div class="g-etc"><span class="faint g-small" title="찍은 창의 제목">창: ${esc(s.window_title || "(제목 없음)")}</span><button class="btn-secondary btn-small" data-action="g-etc-reg" data-id="${s.id}">이 게임으로 등록</button></div>` : ""}
    </div>`;
  }

  // ── ② 게임 목록 ──────────────────────────────────────
  function 게임그리기() {
    const g = G.games;
    const 줄 = (x) => G.고칠게임 === x.id
      ? `<tr><td><input id="g-ed-name" value="${esc(x.이름)}" maxlength="30"></td><td><input id="g-ed-title" value="${esc(x.창제목)}" maxlength="60" placeholder="게임 창 제목에 들어 있는 말"></td>
          <td>${x.shots.전체}장</td><td></td><td class="g-acts-td"><button class="btn-primary btn-small" data-action="g-ed-save" data-id="${esc(x.id)}">저장</button> <button class="btn-secondary btn-small" data-action="g-ed-cancel">취소</button></td></tr>`
      : `<tr><td><b>${esc(x.이름)}</b></td><td>${x.창제목 ? `<code>${esc(x.창제목)}</code>` : `<span class="faint">비어 있음 — 이 게임으로는 안 찾음</span>`}</td>
          <td>${x.shots.전체}장 <span class="faint">(오늘 ${x.shots.오늘})</span></td>
          <td>${x.categories.length ? esc(x.categories.join(", ")) : `<span class="faint">없음 — [블로그 관리] ⑧ 에서 연결</span>`}</td>
          <td class="g-acts-td"><button class="btn-secondary btn-small" data-action="g-ed" data-id="${esc(x.id)}">고치기</button></td></tr>`;
    판("games").innerHTML = `
      <div class="card"><div class="g-scroll"><table class="g-table">
        <thead><tr><th>게임</th><th>창 제목 글자</th><th>스샷</th><th>연결된 카테고리</th><th></th></tr></thead>
        <tbody>${g.items.map(줄).join("")}
          <tr class="faint"><td>기타 (목록에 없는 창)</td><td>—</td><td>${g.etc.shots.전체}장</td><td>—</td><td class="g-acts-td">${g.etc.shots.전체 ? `<button class="btn-secondary btn-small" data-action="g-see-etc">보기</button>` : ""}</td></tr>
        </tbody></table></div></div>
      <div class="card">
        <h3>+ 게임 추가</h3>
        <div class="g-form">
          <label class="g-field"><span>게임 이름</span><input id="g-new-name" maxlength="30" placeholder="예: 메이플스토리"></label>
          <label class="g-field"><span>창 제목 글자 <span class="faint">(게임 창 제목에 들어 있는 말)</span></span><input id="g-new-title" maxlength="60" placeholder="예: MapleStory"></label>
        </div>
        <div class="g-btns g-mt"><button class="btn-primary" data-action="g-add">추가</button>
          <span class="faint g-small">창 제목을 모르면 비워 두세요. 그 게임을 켜고 단축키를 한 번 누르면 «기타» 에 들어가고, 거기서 [이 게임으로 등록] 을 누르면 됩니다.</span></div>
      </div>`;
  }

  // ── ③ 설정 ───────────────────────────────────────────
  async function 설정열기() {
    [G.settings, G.token] = await Promise.all([api("/api/game/settings"), api("/api/game/agent-token")]);
    const s = G.settings, t = G.token;
    판("settings").innerHTML = `
      <div class="card"><h3>📸 스샷 단축키</h3>
        <div class="g-btns"><select id="g-key" class="g-select">${s.단축키들.map((k) => `<option ${k === s.단축키 ? "selected" : ""}>${esc(k)}</option>`).join("")}</select>
        <span class="muted g-small">바꾸면 집 PC 프로그램이 30초 안에 새 키를 받아 갑니다.</span></div></div>
      <div class="card" id="g-token-card"><h3>🔑 집 PC 연결</h3>
        ${t.token
          ? `<p class="muted g-small">집 PC 준비 스크립트가 물어볼 때 붙여 넣는 값입니다. 이미 연결돼 있으면 다시 넣을 필요가 없습니다.</p>
             <div class="g-btns"><span class="g-token">${esc(t.token.slice(0, 6))}••••••••${esc(t.token.slice(-4))}</span>
             <button class="btn-secondary btn-small" data-action="g-token-copy">📋 복사</button>
             <button class="btn-secondary btn-small" data-action="g-token-new">새로 만들기</button></div>`
          : `<p class="muted">아직 없습니다.</p><button class="btn-primary btn-small" data-action="g-token-new">토큰 만들기</button>`}</div>
      <div class="card"><h3>🗂 보관</h3>
        <div class="g-form">
          <label class="g-field"><span>집 PC 원본 (일)</span><input type="number" id="g-keep-orig" min="1" max="365" value="${s.원본보관일}"></label>
          <label class="g-field"><span>어떤 글에도 안 쓴 스샷 (일)</span><input type="number" id="g-keep-unused" min="1" max="365" value="${s.안쓴사진보관일}"></label>
          <label class="g-field"><span>글에 쓴 스샷 — 발행 후 (일)</span><input type="number" id="g-keep-used" min="1" max="365" value="${s.서버사진보관일}"></label>
        </div>
        <div class="g-btns g-mt"><button class="btn-primary btn-small" data-action="g-keep-save">저장</button>
          <span class="faint g-small">글에 붙인 스샷은 그 글이 발행되고 이 날수가 지나야 지웁니다. 아직 발행 안 한 글이 쓰고 있으면 남깁니다.</span></div></div>`;
  }

  // ── 📝 포스팅 카드 — 스샷 고르기 창 (8장씩) ─────────
  async function 고르기열기(postId, game) {
    G.pick = { postId, game, page: 1, day: "all", unused: false, sel: [], mode: "append", data: null };
    document.getElementById("g-pick").hidden = false;
    await 고르기읽기();
  }
  async function 고르기읽기() {
    const p = G.pick;
    const q = new URLSearchParams({ game: p.game, page: String(p.page), day: p.day, ...(p.unused ? { unused: "1" } : {}) });
    p.data = await api(`/api/game/shots?${q}`);
    고르기그리기();
  }
  function 고르기그리기() {
    const p = G.pick, d = p.data;
    const 첫 = d.total ? (d.page - 1) * 8 + 1 : 0, 끝 = Math.min(d.total, d.page * 8);
    document.querySelector("#g-pick .g-pick-box").innerHTML = `
      <div class="card-header"><h3>🔄 내 게임 스샷에서 고르기</h3><button class="btn-secondary btn-small" data-action="g-pick-close">닫기</button></div>
      <div class="g-pick-filters">
        <select data-g-f="day">${Object.entries(날짜글).map(([k, v]) => `<option value="${k}" ${k === p.day ? "selected" : ""}>${v}</option>`).join("")}</select>
        <label class="g-small"><input type="checkbox" data-g-f="unused" ${p.unused ? "checked" : ""}> 아직 글에 안 쓴 것만</label>
      </div>
      <div class="g-pick-grid">${d.items.map((s) => { const i = p.sel.findIndex((x) => x.id === s.id); return `<button class="g-pick ${i >= 0 ? "on" : ""}" data-action="g-pick-toggle" data-id="${s.id}">
        <img src="${esc(이미지(s.url))}" alt="" loading="lazy"><span class="ck">${i >= 0 ? i + 1 : ""}</span>${s.used ? `<span class="used">글에 씀</span>` : ""}<span class="cap">${월일(s.taken_at)} ${시분(s.taken_at)}${s.caption ? ` · ${esc(s.caption)}` : ""}</span></button>`; }).join("") || `<p class="muted">맞는 스샷이 없습니다.</p>`}</div>
      <div class="g-pager"><button class="btn-secondary btn-small" data-action="g-pick-page" data-d="-1" ${d.page <= 1 ? "disabled" : ""}>‹ 이전 8장</button>
        <span>${첫}–${끝} / ${d.total}</span><button class="btn-secondary btn-small" data-action="g-pick-page" data-d="1" ${d.page >= d.pages ? "disabled" : ""}>다음 8장 ›</button></div>
      <div class="g-pick-sel"><b>선택 ${p.sel.length}장</b>${p.sel.length ? " — 이 순서로 넣습니다" : ""} (최대 10장)
        <div class="g-sel-list">${p.sel.map((s, i) => `<span class="g-sel-item"><img src="${esc(이미지(s.url))}" alt="">${i + 1}<button class="btn-secondary btn-small" data-action="g-sel-move" data-i="${i}" data-d="-1">↑</button><button class="btn-secondary btn-small" data-action="g-sel-move" data-i="${i}" data-d="1">↓</button></span>`).join("")}</div></div>
      <div class="g-btns g-mt">
        <label class="g-small"><input type="radio" name="g-pick-mode" value="append" ${p.mode === "append" ? "checked" : ""}> 지금 사진 뒤에 더하기</label>
        <label class="g-small"><input type="radio" name="g-pick-mode" value="replace" ${p.mode === "replace" ? "checked" : ""}> 지금 사진을 이것으로 바꾸기</label>
        <span class="g-flex1"></span><button class="btn-primary" data-action="g-pick-apply" ${p.sel.length ? "" : "disabled"}>이 글에 넣기</button></div>`;
  }

  // ── 카테고리 폼 ⑧ 연결 게임 · 관리자인지 확인 ────────
  // 판매용·체험 키는 404 라 메뉴·칸이 끝까지 안 보인다.
  async function 연결게임칸() {
    const 칸 = document.getElementById("cf-game");
    try {
      const r = await fetch("/api/game/games", { headers: getDashboardToken() ? { "x-dashboard-token": getDashboardToken() } : {} });
      if (!r.ok) { document.body.classList.remove("game-admin"); return; }
      const { items } = await r.json();
      document.body.classList.add("game-admin");
      if (!칸) return;
      const 지금 = 칸.value;
      칸.innerHTML = `<option value="">없음 — 무료 이미지 사용</option>${items.map((g) => `<option value="${esc(g.id)}">${esc(g.이름)}</option>`).join("")}`;
      칸.value = 지금;
    } catch { /* 체험 자리 — 칸이 감춰져 있다 */ }
  }

  // ── 클릭 ─────────────────────────────────────────────
  async function 누름(btn) {
    const a = btn.dataset.action, id = btn.dataset.id;
    if (a === "g-tab") return 탭(btn.dataset.tab);
    // 스샷
    if (a === "g-copy") return 복사(btn.dataset.url, btn.closest(".g-shot"));
    if (a === "g-page") { G.거름.page += Number(btn.dataset.d); return 새로고침(); }
    if (a === "g-memo") {
      const s = G.album.items.find((x) => x.id === Number(id));
      const 메모 = prompt("이 스샷 메모 (비우면 지움)", s?.caption || "");
      if (메모 === null) return;
      await api(`/api/game/shots/${id}`, { method: "PUT", body: JSON.stringify({ caption: 메모.trim() }) });
      return 새로고침();
    }
    if (a === "g-del" || a === "g-del-sel") {
      const ids = a === "g-del" ? [Number(id)] : [...G.sel];
      if (!ids.length || !confirm(`스샷 ${ids.length}장을 지울까요?\n이미 글에 넣은 사진은 그 글에는 남습니다.`)) return;
      await api("/api/game/shots/delete", { method: "POST", body: JSON.stringify({ ids }) });
      ids.forEach((x) => G.sel.delete(x));
      return 새로고침();
    }
    if (a === "g-etc-reg") {
      const s = G.album.items.find((x) => x.id === Number(id));
      const 이름 = prompt("게임 이름", "");
      if (!이름?.trim()) return;
      const 창 = prompt("창 제목 글자 — 이 말이 들어간 창을 이 게임으로 봅니다. 버전 숫자처럼 바뀌는 부분은 지워 주세요.", s?.window_title || "");
      if (!창?.trim()) return;
      const r = await api("/api/game/etc/register", { method: "POST", body: JSON.stringify({ shot_id: Number(id), 이름: 이름.trim(), 창제목: 창.trim() }) });
      alert(`«${r.이름}» 으로 ${r.moved}장을 옮겼습니다.`);
      G.거름 = { ...G.거름, game: r.id, page: 1 };
      return 새로고침();
    }
    // 게임 목록
    if (a === "g-see-etc") { G.거름 = { ...G.거름, game: "etc", day: "all", page: 1 }; return 탭("shots"); }
    if (a === "g-ed") { G.고칠게임 = id; return 게임그리기(); }
    if (a === "g-ed-cancel") { G.고칠게임 = null; return 게임그리기(); }
    if (a === "g-ed-save" || a === "g-add") {
      const 값 = a === "g-add"
        ? { 이름: document.getElementById("g-new-name").value.trim(), 창제목: document.getElementById("g-new-title").value.trim() }
        : { 이름: document.getElementById("g-ed-name").value.trim(), 창제목: document.getElementById("g-ed-title").value.trim() };
      const r = await api(a === "g-add" ? "/api/game/games" : `/api/game/games/${id}`, { method: a === "g-add" ? "POST" : "PUT", body: JSON.stringify(값) });
      G.고칠게임 = null;
      if (r.moved) alert(`«기타» 에 있던 스샷 ${r.moved}장을 «${r.이름}» 으로 옮겼습니다.`);
      await 새로고침();
      return 연결게임칸();
    }
    // 설정
    if (a === "g-token-copy") {
      await navigator.clipboard.writeText(G.token.token);
      btn.textContent = "복사됨!"; setTimeout(() => { btn.textContent = "📋 복사"; }, 1500);
      return;
    }
    if (a === "g-token-new") {
      if (G.token?.token && !confirm("새 토큰을 만들까요?\n집 PC 에서 준비 스크립트를 다시 돌려 새 토큰을 넣어야 합니다(예전 토큰은 배포 때 넣은 것이면 계속 통합니다).")) return;
      await api("/api/game/agent-token/new", { method: "POST" });
      return 새로고침();
    }
    if (a === "g-keep-save") {
      const 값 = { 원본보관일: Number(document.getElementById("g-keep-orig").value), 안쓴사진보관일: Number(document.getElementById("g-keep-unused").value), 서버사진보관일: Number(document.getElementById("g-keep-used").value) };
      await api("/api/game/settings", { method: "PUT", body: JSON.stringify(값) });
      btn.textContent = "저장됨!"; setTimeout(() => { btn.textContent = "저장"; }, 1500);
      return;
    }
    // 📝 포스팅 카드
    if (a === "g-shots-pick") return 고르기열기(Number(id), btn.dataset.game);
    if (a === "g-shots-auto") {
      btn.disabled = true; btn.textContent = "넣는 중…";
      try { await api(`/api/posts/${id}/game-shots/auto`, { method: "POST" }); } finally { if (typeof refreshQueue === "function") await refreshQueue(); }
      return;
    }
    if (a === "g-pick-close") { document.getElementById("g-pick").hidden = true; G.pick = null; return; }
    if (a === "g-pick-page") { G.pick.page += Number(btn.dataset.d); return 고르기읽기(); }
    if (a === "g-pick-toggle") {
      const s = G.pick.data.items.find((x) => x.id === Number(id));
      const i = G.pick.sel.findIndex((x) => x.id === s.id);
      if (i >= 0) G.pick.sel.splice(i, 1);
      else if (G.pick.sel.length < 10) G.pick.sel.push(s);
      return 고르기그리기();
    }
    if (a === "g-sel-move") {
      const i = Number(btn.dataset.i), j = i + Number(btn.dataset.d), s = G.pick.sel;
      if (j >= 0 && j < s.length) [s[i], s[j]] = [s[j], s[i]];
      return 고르기그리기();
    }
    if (a === "g-pick-apply") {
      const mode = document.querySelector('input[name="g-pick-mode"]:checked')?.value || "append";
      await api(`/api/posts/${G.pick.postId}/game-shots`, { method: "POST", body: JSON.stringify({ shot_ids: G.pick.sel.map((s) => s.id), mode }) });
      document.getElementById("g-pick").hidden = true; G.pick = null;
      if (typeof refreshQueue === "function") await refreshQueue();
    }
  }

  const 파일읽기 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !btn.dataset.action.startsWith("g-")) return;
    e.preventDefault();
    try { await 누름(btn); } catch (탈) { alert(탈.message); }
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    try {
      if (t.id === "g-f-game") { G.거름 = { ...G.거름, game: t.value, page: 1 }; G.sel.clear(); await 새로고침(); }
      else if (t.id === "g-f-day") { G.거름 = { ...G.거름, day: t.value, page: 1 }; G.sel.clear(); await 새로고침(); }
      else if (t.id === "g-f-unused") { G.거름 = { ...G.거름, unused: t.checked, page: 1 }; await 새로고침(); }
      else if (t.dataset.gSel) { const n = Number(t.dataset.gSel); if (t.checked) G.sel.add(n); else G.sel.delete(n); 스샷그리기(); }
      else if (t.id === "g-key") { await api("/api/game/settings", { method: "PUT", body: JSON.stringify({ 단축키: t.value }) }); await 상태읽기(); 위쪽그리기(); }
      else if (t.dataset.gUpload !== undefined) {
        for (const f of t.files) await api("/api/game/upload", { method: "POST", body: JSON.stringify({ game: G.거름.game, image: await 파일읽기(f) }) });
        await 새로고침();
      } else if (t.dataset.gF !== undefined && G.pick) {
        G.pick[t.dataset.gF] = t.type === "checkbox" ? t.checked : t.value;
        G.pick.page = 1;
        await 고르기읽기();
      }
    } catch (탈) { alert(탈.message); }
  });

  setTimeout(연결게임칸, 1500);
  setInterval(연결게임칸, 60_000);   // 다른 키로 다시 들어왔을 때도 맞게

  window.게임탭 = { 열기, 고르기열기 };
})();
