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

/**
 * 방금 키를 넣고 들어왔는가.
 *
 * 체험 회원은 들어오자마자 「내 글 스타일」 부터 보셔야 한다. 안내 메일에
 * 적어 두어도 대충 읽고 [포스팅] 부터 누르시면, 주제·말투가 빈 채로 글이
 * 나와 «내 블로그랑 안 맞네» 하고 끝난다. 그래서 첫 화면을 정해 준다.
 */
let 방금들어옴 = false;
/** 이번에 화면을 연 동안 체험 첫 화면으로 한 번 데려갔는가. 두 번은 안 한다. */
let 체험첫화면_보냄 = false;

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
        방금들어옴 = true;
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
    const 탈 = new Error(data.error || `요청 실패 (${res.status} ${res.statusText || ""})`.trim());
    // 화면이 까닭을 가려 다르게 대할 수 있게 (AI 끊김이면 설정으로 데려간다).
    탈.status = res.status;
    탈.data = data;
    throw 탈;
  }
  return data;
}

/**
 * 「이 설정이면 아침에 몇 분 걸리는지」 를 그 자리에 칠한다.
 *
 * 「너무 크면 실패할 수 있습니다」 같은 고정된 경고문은 아무도 안 읽는다.
 * 지금 넣으신 값으로 «18분 / 30분» 이라고 보여 주면 읽힌다.
 */
function 시간경고칠하기(어디, t) {
  const 칸 = document.getElementById(어디);
  if (!칸) return;
  if (!t || !t.message) { 칸.hidden = true; return; }
  칸.hidden = false;
  칸.className = t.level === "over" ? "setup-warn"
               : t.level === "tight" ? "setup-warn"
               : "setup-good";
  칸.innerHTML = 굵게(t.message);
}

/**
 * **지금 하루치를 만든다.**
 *
 * 서버에 새 길을 내지 않고, 이미 있는 [지금 생성] 을 예약 설정이 정한
 * 목록대로 차례차례 부른다. 그래야 하는 까닭이 있다.
 *
 *   한 편씩 저장된다   중간에 멈춰도 그때까지 만든 것은 남는다
 *   진행이 보인다      «2/3 만드는 중» 을 그대로 보여 줄 수 있다
 *   한 편이 실패해도   거기서 끝내지 않고 다음 편으로 넘어간다
 *
 * 왜 서버에 「하루치 한 번에」 를 안 맡기나
 *   이 서버는 요청을 처리하는 동안에만 일을 한다(Cloud Run). 답을 먼저
 *   돌려주고 뒤에서 계속 만들게 해도 그 일은 곧 멈춘다. 그래서 어차피
 *   누군가 기다려 줘야 하는데, 그럴 바에는 한 편씩 끊어 부르는 쪽이
 *   중간에 끊겨도 덜 잃는다.
 */
async function 하루치만들기(단추) {
  if (!(await AI되나())) return;
  const 상태 = document.getElementById("batch-state");
  const 기록 = document.getElementById("batch-log");
  const 말 = (글, 탈났나) => {
    if (!상태) return;
    상태.className = 탈났나 ? "setup-warn" : "muted";
    상태.textContent = 글;
  };

  let 계획;
  try {
    계획 = (await api("/api/schedule")).preview || [];
  } catch (탈) {
    말("예약 설정을 못 읽었습니다: " + (탈 && 탈.message ? 탈.message : 탈), true);
    return;
  }
  if (계획.length === 0) {
    말("오늘 만들 것이 없습니다 — 켜진 카테고리가 없습니다. [블로그 관리]의 «활성» 을 눌러 켜 주세요.", true);
    return;
  }

  단추.disabled = true;
  if (기록) 기록.innerHTML = "";
  let 된것 = 0, 안된것 = 0;

  // 창을 닫으면 여기서 멈춘다. 그걸 모르고 닫으시지 않게 한 번 잡는다.
  const 막기 = (e) => { e.preventDefault(); e.returnValue = ""; };
  window.addEventListener("beforeunload", 막기);

  try {
    for (let i = 0; i < 계획.length; i++) {
      const 것 = 계획[i];
      말(`${i + 1}/${계획.length} 만드는 중 — ${것.name} … (한 편에 3~5분)`);
      const 줄 = document.createElement("li");
      줄.textContent = `${것.name} — 만드는 중…`;
      기록 && 기록.appendChild(줄);
      try {
        const 답 = await api("/api/run/generate", {
          method: "POST",
          body: JSON.stringify({ categoryId: 것.categoryId }),
        });
        const 글 = (답 && (답.post || 답)) || {};
        const 길이 = 글.content ? 글.content.length : null;
        줄.textContent = `${것.name} — ✅ ${글.title || "완료"}${길이 ? ` (${길이}자)` : ""}`;
        된것++;
      } catch (탈) {
        줄.textContent = `${것.name} — ❌ ${탈 && 탈.message ? 탈.message : 탈}`;
        안된것++;
      }
    }
    말(안된것 === 0
      ? `끝났습니다 — ${된것}편을 만들었습니다. [포스팅] 에서 보실 수 있습니다.`
      : `끝났습니다 — ${된것}편 성공, ${안된것}편 실패. 위 목록에서 까닭을 보십시오.`,
      안된것 > 0);
  } finally {
    window.removeEventListener("beforeunload", 막기);
    단추.disabled = false;
    await refreshCategories();
  }
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
/** 지금 폼에서 고치고 있는 카테고리. 표의 다른 줄을 흐리게 하는 데 쓴다. */
let editingFormId = null;
/** [지금 생성] 상태 — 카테고리 id → { state, start, end, postId, title, msg }. 표를 다시 그려도 남는다. */
const 생성상태 = new Map();
// 수정 중인 카테고리 id. null이면 전부 보기 모드, 값이 있으면 그 행만
// 이름/설명/주제 키워드를 함께 고칠 수 있는 입력 폼으로 바뀐다.
let editingCategoryId = null;

// ── 참고 주소 줄: [+ 참고 주소 추가] 로 늘리고, 줄마다 [×] 로 지운다 ──
const 참고주소_최대 = 9;

function 참고주소줄그리기(목록) {
  const 칸 = document.getElementById("ref-url-rows");
  if (!칸) return;
  const 줄들 = (목록 && 목록.length ? 목록 : [""]).slice(0, 참고주소_최대);
  칸.innerHTML = 줄들.map((u, i) => `
    <div class="url-line">
      <span class="url-kind">참고 주소 ${i + 1}</span>
      <input type="url" data-ref-url value="${escapeHtml(u)}" placeholder="https://kosis.kr" />
      <button type="button" class="url-del" data-ref-del="${i}" title="이 주소 지우기" aria-label="참고 주소 ${i + 1} 지우기">×</button>
    </div>`).join("");
  const 더하기 = document.querySelector('[data-action="add-ref-url"]');
  if (더하기) 더하기.disabled = 줄들.length >= 참고주소_최대;
}

function 참고주소줄읽기() {
  return [...document.querySelectorAll("#ref-url-rows [data-ref-url]")].map((i) => i.value.trim()).filter(Boolean);
}

document.addEventListener("click", (e) => {
  const 더 = e.target.closest && e.target.closest('[data-action="add-ref-url"]');
  if (더) {
    e.preventDefault();
    const 지금 = [...document.querySelectorAll("#ref-url-rows [data-ref-url]")].map((i) => i.value.trim());
    if (지금.length >= 참고주소_최대) return;
    참고주소줄그리기([...지금, ""]);
    const 칸들 = document.querySelectorAll("#ref-url-rows [data-ref-url]");
    칸들[칸들.length - 1]?.focus();
    return;
  }
  const 지움 = e.target.closest && e.target.closest("[data-ref-del]");
  if (지움) {
    e.preventDefault();
    const 지금 = [...document.querySelectorAll("#ref-url-rows [data-ref-url]")].map((i) => i.value.trim());
    지금.splice(Number(지움.dataset.refDel), 1);
    참고주소줄그리기(지금.length ? 지금 : [""]);
  }
});

참고주소줄그리기([""]);

/** 표의 이름 아래 작은 꼬리표 — 함께 들어갈 말·빼야 할 말·참고 주소가 몇 개인지. */
function 카테고리꼬리표(c) {
  const 셈 = (글, 가르개) => (글 || "").split(가르개).map((x) => x.trim()).filter(Boolean).length;
  const 조각 = [];
  const 함께 = 셈(c.must_keywords, ","), 빼기 = 셈(c.exclude_keywords, ",");
  const 주소 = 셈(c.reference_urls, /\s+/) + (c.main_url ? 1 : 0);
  if (함께) 조각.push(`<span class="cat-tag must" title="${escapeHtml(c.must_keywords)}">+함께 ${함께}</span>`);
  if (빼기) 조각.push(`<span class="cat-tag exclude" title="${escapeHtml(c.exclude_keywords)}">−빼기 ${빼기}</span>`);
  if (주소) 조각.push(`<span class="cat-tag url" title="${escapeHtml([c.main_url ? `대표: ${c.main_url}` : "", c.reference_urls || ""].filter(Boolean).join("\n"))}">🔗 ${주소}</span>`);
  if (메모있나(c)) {
    조각.push(`<span class="cat-tag memo" title="${escapeHtml(`${메모날(c)}에 주소를 읽고 정리한 자료 메모가 있습니다. 다음 글부터 주소를 다시 안 열고 이 메모로 빠르게 씁니다 (7일마다 새로 읽음).`)}">📒 메모 ${메모날(c)}</span>`);
  }
  return 조각.length ? `<div class="cat-tags">${조각.join("")}</div>` : "";
}

/** 자료 메모가 아직 쓸 만한가 — 서버(pipeline/자료메모.ts)와 같은 7일. 주소를 바꾼 것은 서버가 가린다. */
function 메모있나(c) {
  if (!c || !c.research_brief || !c.brief_at) return false;
  return Date.now() - Date.parse(c.brief_at) < 7 * 86_400_000;
}
function 메모날(c) {
  const d = new Date(c.brief_at);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderCategories(categories) {
  const tbody = document.querySelector("#category-table tbody");
  tbody.innerHTML = "";
  for (const c of categories) {
    const tr = document.createElement("tr");
    {
      tr.dataset.catId = c.id;
      if (editingFormId !== null) tr.classList.toggle("is-dim", c.id !== editingFormId);
      if (c.id === editingFormId) tr.classList.add("is-editing");
      const 쓰는중 = 생성상태.get(c.id)?.state === "running";
      tr.innerHTML = `
        <td class="cat-topic">
          <strong>${escapeHtml(c.name)}</strong>${카테고리꼬리표(c)}
          <div class="cat-tools">
            <button class="link-btn" data-action="edit-category" data-id="${c.id}">✏️ 수정</button>
            <button class="link-btn danger" data-action="delete-category" data-id="${c.id}">🗑 삭제</button>
            ${c.research_brief ? `<button class="link-btn" data-action="brief-reset" data-id="${c.id}" title="주소의 내용이 크게 바뀌었을 때 — 다음 글이 주소를 처음부터 다시 읽습니다">🔄 다시 읽기</button>` : ""}
          </div>
        </td>
        <td class="cat-keyword" data-label="주제 키워드">${c.topic_keyword
              ? `<span class="kw-pill">${escapeHtml(c.topic_keyword)}</span>${c.keyword_keep ? ' <span class="cat-tag keep" title="계속 유지">🔁 유지</span>' : ""}`
              : '<span class="muted">-</span>'}</td>
        <td class="cat-active" data-label="활성"><button class="badge active-toggle ${c.active ? "badge-active" : "badge-inactive"}" data-action="toggle-active" data-id="${c.id}"
              title="${c.active ? "켜짐 — 아침 자동 준비에 들어갑니다. 누르면 끕니다" : "꺼짐 — 아침 자동 준비에서 빠집니다. 누르면 켭니다"}">${c.active ? "● 활성" : "○ 꺼짐"}</button></td>
        <td class="cat-gen"><button class="btn-primary gen-btn" data-action="generate" data-id="${c.id}" ${쓰는중 ? "disabled" : ""}>${쓰는중 ? "쓰는 중…" : "지금 생성"}</button></td>
        <td class="gen-status" data-status-for="${c.id}">${상태칸(c.id)}</td>`;
    }
    tbody.appendChild(tr);
  }
  주제칸맞추기();
}

/**
 * [주제] 칸 너비를 **가장 긴 주제 이름**에 맞춘다. 남는 자리는 [주제 키워드]가 다 쓴다.
 * 너무 길면 320px 에서 줄바꿈.
 */
function 주제칸맞추기() {
  const 칸 = document.querySelector("#category-table col.c-topic");
  const 이름들 = [...document.querySelectorAll("#category-table td.cat-topic > strong")];
  if (!칸 || 이름들.length === 0) return;
  if (window.matchMedia("(max-width: 700px)").matches) { 칸.style.width = ""; return; }
  const 재기 = 주제칸맞추기.재기 || (주제칸맞추기.재기 = document.createElement("canvas").getContext("2d"));
  재기.font = getComputedStyle(이름들[0]).font;
  const 이름폭 = Math.max(...이름들.map((el) => 재기.measureText(el.textContent || "").width));
  // 꼬리표·[수정][삭제] 줄은 칸 안에서 줄바꿈되므로 이름만 잰다. 화면이 숨겨져 있어도
  // 글꼴로 재므로 값이 같다. 최소 110px([✏️ 수정 🗑 삭제] 한 줄).
  const 여백 = 22;   // 칸 안쪽 여백(좌우)
  칸.style.width = `${Math.round(Math.min(320, Math.max(110, 이름폭)) + 여백)}px`;
}
window.addEventListener("resize", () => { if (categoriesCache.length) 주제칸맞추기(); });

async function refreshCategories() {
  const categories = await api("/api/categories");
  categoriesCache = categories;
  renderCategories(categories);
  await 하루치예고();
}

/** 단추를 누르기 전에 «무엇이 몇 편 나오는지» 를 보여 준다. */
async function 하루치예고() {
  const 칸 = document.getElementById("batch-plan");
  if (!칸) return;
  try {
    const s = await api("/api/schedule");
    const 목록 = s.preview || [];
    if (목록.length === 0) { 칸.textContent = "지금은 만들 것이 없습니다"; return; }
    // **랜덤일 때는 이름을 적으면 안 된다.**
    // 그 목록은 부를 때마다 다시 뽑히므로, 여기 적어 둔 이름과 실제로
    // 만들어지는 것이 달라진다. 「예고와 다르네」 가 고장으로 읽힌다.
    칸.textContent = s.order === "random"
      ? `${목록.length}편 (카테고리는 만들 때 무작위로 고릅니다)`
      : `${목록.length}편 (${목록.map((h) => h.name).join(" · ")})`;
  } catch {
    칸.textContent = "…";
  }
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
  // 블로그 관리 표의 «상태» 칸이 «준비된 초안 있음» 을 바로 알 수 있게.
  if (categoriesCache.length) renderCategories(categoriesCache);
  const container = document.getElementById("ready-list");
  container.innerHTML = "";

  if (items.length === 0) {
    container.innerHTML = `<p class="muted">준비된 초안이 없습니다. 카테고리 목록에서 "지금 생성"을 눌러보세요.</p>`;
    return;
  }

  for (const p of items) {
    const card = document.createElement("div");
    card.className = "post-card";
    card.dataset.postId = p.id;
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

    // 프롬프트가 시키는 순서 그대로. (바꿔 끼운 본 제목이 뒤에 붙으면 «후보 4» 로 보인다)
    const TITLE_VARIANT_LABELS = ["조건·기준형", "방법·절차형", "후기·비교형"];
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
                <span class="title-variant-text">${escapeHtml(t)} <span class="muted title-len">${[...t].length}자</span></span>
                <button class="btn-secondary btn-copy-image" data-action="copy-title-variant" data-title="${escapeHtml(t)}">복사하기</button>
              </div>`,
              )
              .join("")}
          </div>`
        : "";

    card.innerHTML = `
      <div class="post-card-header">
        <span class="badge post-cat">${escapeHtml(p.category_name)}</span>
        <strong class="post-title-toggle" data-action="toggle-content" data-id="${p.id}"
          title="누르면 본문을 펼치고 접습니다">${escapeHtml(p.title ?? "(제목 없음)")} <span class="muted title-len">${[...(p.title ?? "")].length}자</span></strong>
        <button class="btn-secondary btn-copy-image post-title-copy" data-action="copy-title-variant" data-title="${escapeHtml(p.title ?? "")}">복사하기</button>
      </div>
      ${titleVariantsHtml}
      <div class="post-card-actions">
        <button class="btn-secondary" data-action="copy" data-id="${p.id}" title="제목 + 본문 + 태그를 한꺼번에">전체 복사하기</button>
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
/** 체험 키로 들어온 자리인가. 자리표시하기() 가 /api/settings 의 seat 로 정한다. */
let isTrialSeat = false;
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
        ${p.custom && !isTrialSeat ? `<button class="preset-delete" data-action="delete-preset" data-preset="${p.id}" title="이 프리셋 삭제">✕</button>` : ""}
        <strong>${escapeHtml(p.label)}</strong>
        <p class="muted">${escapeHtml(p.description)}</p>
      </div>`,
    )
    .join("");
  // 프리셋 목록은 서버 하나에 하나다. 체험 키는 고르기만 하고 늘리거나 지우지 않는다.
  grid.innerHTML = isTrialSeat
    ? cards
    : cards + `<div class="preset-card preset-card-add" data-action="show-add-preset-form">+<span>새 프리셋 추가</span></div>`;
}

function renderFinalDirectionSummary() {
  const el = document.getElementById("final-direction-summary");
  if (!el) return;
  const preset = postingDirectionPresets.find((p) => p.id === selectedPreset);
  const refinement = document.getElementById("posting-direction-refinement").value.trim();
  const typeInput = document.querySelector('input[name="blog_type"]:checked');
  const typeLabel = typeInput ? (typeInput.value === "business" ? "기업 블로그" : "개인 블로그") : "지정 안 함";
  const topicLabel = 블로그정보.topics.length ? 블로그정보.topics.join(" · ") : "전체(주제 선택 없음)";

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

/**
 * **체험 키로 들어왔으면 화면을 그 자리에 맞춘다.**
 *
 * 체험 회원이 바꿀 수 있는 것은 글 스타일(2·3번 카드)뿐이다. 나머지 카드는
 * body.is-trial 로 감추고, 이 설정이 «이 키에만» 저장된다는 안내를 띄운다.
 * 메뉴 이름도 「관리자 설정」 그대로면 체험 회원은 자기와 상관없는 곳인 줄
 * 알고 안 들어온다 — 그래서 「내 글 스타일」 로 바꿔 부른다.
 */
function 자리표시하기(s) {
  isTrialSeat = s.seat === "trial";
  document.body.classList.toggle("is-trial", isTrialSeat);
  const 안내 = document.getElementById("trial-style-note");
  if (안내) 안내.hidden = !isTrialSeat;
  const 한도 = document.getElementById("trial-daily-limit");
  if (한도 && s.trial_daily_limit) 한도.textContent = s.trial_daily_limit;
  const 메뉴 = document.getElementById("nav-settings-label");
  if (메뉴) 메뉴.textContent = isTrialSeat ? "내 글 스타일" : "관리자 설정";
  const 제목 = document.getElementById("settings-title");
  if (제목) 제목.textContent = isTrialSeat ? "🎨 내 글 스타일" : "⚙️ 관리자 설정";
  const 부제 = document.getElementById("settings-subtitle");
  if (부제) 부제.textContent = isTrialSeat
    ? "이 체험 키로 만드는 글의 블로그 유형·주제·톤을 정합니다."
    : "AI 연결, 블로그 주제/톤, 접속 코드를 관리합니다.";
}

async function refreshSettings() {
  const [s, who] = await Promise.all([api("/api/settings"), api("/api/auth/whoami")]);
  isMasterSession = !!who.isMaster;
  lastSettingsSnapshot = s;
  자리표시하기(s);

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

  // 5) 네이버 키워드 — 체험 자리에는 값이 안 온다(칸도 숨겨져 있다).
  const 네이버 = s.naver || {};
  for (const [칸, 것] of Object.entries(네이버)) {
    const el = document.querySelector(`[data-current="${칸}"]`);
    if (el) el.textContent = 것.set ? `현재 저장된 값: ${것.value}` : "아직 설정되지 않았습니다.";
  }
  const 다있나 = (칸들) => 칸들.every((칸) => 네이버[칸] && 네이버[칸].set);
  setStepBadge("naver-search", 다있나(["naver_search_client_id", "naver_search_client_secret"]));
  setStepBadge("naver-ad", 다있나(["naver_ad_api_key", "naver_ad_secret", "naver_ad_customer_id"]));

  setStepBadge("claude", claudeTestedOk);
  updateSetupProgress();

  const typeRadio = document.querySelector(`input[name="blog_type"][value="${s.blog_type}"]`);
  if (typeRadio) typeRadio.checked = true;
  블로그정보받기(s);

  const 분량칸 = document.getElementById("min-length-input");
  if (분량칸 && document.activeElement !== 분량칸) {
    분량칸.value = s.min_length;
    if (s.min_length_min) 분량칸.min = s.min_length_min;
    if (s.min_length_max) 분량칸.max = s.min_length_max;
  }
  시간경고칠하기("timing-warn-length", s.timing);

  const 분량말 = document.getElementById("min-length-state");
  if (분량말) {
    분량말.className = "muted";
    분량말.textContent = `지금은 ${s.min_length}자가 기준입니다 `
      + `(${s.min_length_min}~${s.min_length_max} 사이로 정하실 수 있습니다).`;
  }

  selectedPreset = s.posting_direction_preset || "balanced";
  document.getElementById("posting-direction-refinement").value = s.posting_direction_refinement || "";
  await loadPresetsIfNeeded();
  renderPresetGrid();
  renderFinalDirectionSummary();
  renderHomeStats();
  체험첫화면으로(s);
}

/**
 * 체험 회원이면 **「내 글 스타일」 을 첫 화면으로.**
 *
 * 키를 넣고 막 들어왔을 때, 또는 아직 스타일을 한 번도 안 정했을 때.
 * 정하고 나면 다음부터는 평소처럼 홈으로 들어온다.
 */
function 체험첫화면으로(s) {
  const 막들어옴 = 방금들어옴;
  방금들어옴 = false;
  if (!isTrialSeat || 체험첫화면_보냄) return;
  if (!막들어옴 && s.style_saved) return;
  체험첫화면_보냄 = true;
  if (currentView !== "settings") {
    switchView("settings").catch((err) => console.error("[maim] 첫 화면 전환 실패:", err));
  }
  window.scrollTo(0, 0);
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
  if (view === "settings") { await refreshSettings(); await refreshSchedule(); await refreshEngines(); await refreshErrors(); }
  if (view === "home") renderHome();
}

document.getElementById("category-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value ? Number(form.id.value) : null;
  const 값 = {
    name: form.name.value.trim(),
    requiresSearch: true,
    promptHint: form.promptHint.value.trim(),
    topicKeyword: form.topicKeyword.value.trim() || null,
    keywordKeep: form.keywordKeep.checked,
    mustKeywords: form.mustKeywords.value.trim() || null,
    excludeKeywords: form.excludeKeywords.value.trim() || null,
    mainUrl: form.mainUrl.value.trim() || null,
    referenceUrls: 참고주소줄읽기().join("\n") || null,
  };
  if (!값.name || !값.promptHint) { alert("이름과 카테고리 설명은 비워 둘 수 없습니다."); return; }
  try {
    await api(id ? `/api/categories/${id}` : "/api/categories", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(값),
    });
    카테고리폼비우기();
    await refreshCategories();
    // 카테고리가 늘거나 줄면 «내일 몇 편» 이 달라진다. 설정 화면을 안 열어도 맞게 둔다.
    await refreshSchedule();
  } catch (err) {
    alert(err.message);
  }
});

/** 카테고리 폼을 «새로 추가» 모양으로 되돌린다. */
function 카테고리폼비우기() {
  editingFormId = null;
  const form = document.getElementById("category-form");
  form.reset();
  form.id.value = "";
  참고주소줄그리기([""]);
  document.getElementById("category-form-title").textContent = "새 카테고리 추가";
  document.getElementById("category-submit").textContent = "추가";
  document.getElementById("category-cancel").hidden = true;
  document.getElementById("category-form-box").classList.remove("editing");
  renderCategories(categoriesCache);
}

/** [수정] — 표 안에서 고치지 않고 **같은 폼**에 채워 고친다. 칸이 많아 표 한 줄에 안 들어간다. */
function 카테고리폼채우기(c) {
  const form = document.getElementById("category-form");
  form.id.value = c.id;
  form.name.value = c.name || "";
  form.promptHint.value = c.prompt_hint || "";
  form.topicKeyword.value = c.topic_keyword || "";
  form.keywordKeep.checked = !!c.keyword_keep;
  form.mustKeywords.value = c.must_keywords || "";
  form.excludeKeywords.value = c.exclude_keywords || "";
  form.mainUrl.value = c.main_url || "";
  const 참고 = (c.reference_urls || "").split(/\s+/).filter(Boolean);
  참고주소줄그리기(참고.length ? 참고 : [""]);
  document.getElementById("category-form-title").textContent = `카테고리 수정 — ${c.name}`;
  document.getElementById("category-submit").textContent = "수정 저장";
  document.getElementById("category-cancel").hidden = false;
  const 상자 = document.getElementById("category-form-box");
  상자.classList.add("editing");
  editingFormId = c.id;
  renderCategories(categoriesCache);
  상자.scrollIntoView({ behavior: "smooth", block: "start" });
  // 고칠 때 제일 많이 바꾸는 것은 주제 키워드다. 거기에 바로 커서를 둔다.
  setTimeout(() => { form.topicKeyword.focus(); form.topicKeyword.select(); }, 350);
}

// 예시 칩 — 누르면 칸에 들어간다. set 은 바꾸고, add 는 쉼표로 더하고, line 은 줄을 더한다.
document.addEventListener("click", (e) => {
  const 칩 = e.target.closest && e.target.closest(".cf-chips button");
  if (!칩) return;
  e.preventDefault();
  const 묶음 = 칩.closest(".cf-chips");
  const form = document.getElementById("category-form");
  const 칸 = form && form.elements[묶음.dataset.target];
  const 넣을것 = 칩.dataset.value || 칩.textContent.trim();
  const 모드 = 묶음.dataset.mode;
  if (모드 === "url") {
    // 대표 주소가 비어 있으면 대표로, 아니면 참고 주소 한 줄로.
    if (!form.mainUrl.value.trim()) { form.mainUrl.value = 넣을것; form.mainUrl.focus(); return; }
    const 있는것 = 참고주소줄읽기();
    if (form.mainUrl.value.trim() === 넣을것 || 있는것.includes(넣을것)) return;
    const 빈칸 = [...document.querySelectorAll("#ref-url-rows input")].find((i) => !i.value.trim());
    if (빈칸) { 빈칸.value = 넣을것; return; }
    참고주소줄그리기([...있는것, 넣을것]);
    return;
  }
  if (!칸) return;
  if (모드 === "add") {
    const 있는것 = 칸.value.split(",").map((x) => x.trim()).filter(Boolean);
    if (!있는것.includes(넣을것)) 있는것.push(넣을것);
    칸.value = 있는것.join(", ");
  } else if (모드 === "line") {
    const 줄 = 칸.value.split(/\s+/).filter(Boolean);
    if (!줄.includes(넣을것)) 줄.push(넣을것);
    칸.value = 줄.join("\n");
  } else {
    칸.value = 넣을것;
  }
  칸.focus();
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
      const 카id = Number(id);
      if (생성상태.get(카id)?.state === "running") return;     // 이미 쓰는 중
      // AI 가 끊긴 게 분명하면 몇 분 기다려 영문 오류를 받게 하지 않는다.
      if (!(await AI되나())) return;
      // 자료 메모가 있으면 주소를 다시 안 읽어 빠르다. 기다릴 시간을 다르게 알려 준다.
      const 카 = categoriesCache.find((x) => x.id === 카id);
      // 조사(최대 2분) + 글쓰기 + 사진. 메모가 있으면 조사가 짧다.
      생성상태.set(카id, { state: "running", start: Date.now(), 예상: 메모있나(카) ? 200_000 : 270_000 });
      상태칸다시그리기(카id);
      const result = await api("/api/run/generate", {
        method: "POST",
        body: JSON.stringify({ categoryId: 카id }),
      });
      // 글은 정상적으로 만들어졌지만 이미지 첨부만 실패한 경우, 서버가
      // 200 OK로 imageError 필드만 실어서 돌려준다. 상태칸에 남겨 둔다.
      생성상태.set(카id, {
        state: result.imageError ? "imgwarn" : "done", start: 생성상태.get(카id)?.start,
        postId: result.id, title: result.title, end: Date.now(), msg: result.imageError || "",
        timing: result.timing || null,
      });
      상태칸다시그리기(카id);
      await refreshQueue();
      // 첫 글이었으면 자료 메모가 생겼다 — 표의 📒 표시를 맞춘다.
      if (result.timing && result.timing.첫글) await refreshCategories();
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
      // 이미지 고르기에도 AI 를 쓰고, 찾으려면 이미지 키가 있어야 한다.
      if (!(await AI되나())) return;
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
      const c = categoriesCache.find((x) => x.id === Number(id));
      if (c) 카테고리폼채우기(c);
    } else if (action === "cancel-category-form") {
      카테고리폼비우기();
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
      await refreshSchedule();
    } else if (action === "toggle-active") {
      const c = categoriesCache.find((x) => x.id === Number(id));
      if (!c) return;
      await api(`/api/categories/${id}`, { method: "PUT", body: JSON.stringify({ active: !c.active }) });
      await refreshCategories();
      // 켜고 끄면 «내일 몇 편» 이 달라진다.
      await refreshSchedule();
    } else if (action === "brief-reset") {
      if (!confirm("자료 메모를 지울까요?\n다음 글을 쓸 때 대표·참고 주소를 처음부터 다시 읽습니다 (그 한 편은 5~10분 걸릴 수 있어요).")) return;
      await api(`/api/categories/${id}/brief-reset`, { method: "POST" });
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
    } else if (action === "run-batch") {
      await 하루치만들기(btn);
    } else if (action === "save-min-length") {
      const 칸 = document.getElementById("min-length-input");
      const 상태 = document.getElementById("min-length-state");
      const 값 = Number(칸.value);
      if (!Number.isFinite(값)) {
        if (상태) { 상태.className = "setup-warn"; 상태.textContent = "숫자를 넣어 주세요."; }
        return;
      }
      try {
        const 답 = await api("/api/settings", { method: "PUT", body: JSON.stringify({ min_length: 값 }) });
        칸.value = 답.min_length;
        시간경고칠하기("timing-warn-length", 답.timing);
        if (상태) {
          상태.className = "muted";
          상태.textContent = 답.notice
            ? 답.notice
            : `저장했습니다. 이제 ${답.min_length}자가 안 되는 글은 한 번 더 쓰게 합니다.`;
        }
      } catch (탈) {
        if (상태) { 상태.className = "setup-warn"; 상태.textContent = 탈 && 탈.message ? 탈.message : String(탈); }
      }
    } else if (action === "save-daily-cap") {
      const 칸 = document.getElementById("schedule-cap-input");
      const 값 = Number(칸.value);
      if (!Number.isFinite(값)) {
        alert("숫자를 넣어 주세요.");
        return;
      }
      const 답 = await api("/api/schedule", {
        method: "PUT", body: JSON.stringify({ dailyCap: 값 }),
      });
      await refreshSchedule();
      const 말 = document.getElementById("schedule-cap-note");
      if (말) {
        말.textContent = 답 && 답.notice
          ? 답.notice
          : `하루 ${답 && 답.dailyCap !== undefined ? 답.dailyCap : 값}건으로 저장했습니다.`;
      }
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
      AI막대그리기().catch(() => {});   // 이미지 키가 생겼으면 막대도 풀어 준다
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
        AI막대그리기().catch(() => {});
        setStepBadge("claude", claudeTestedOk);
        updateSetupProgress();
        if (resultEl) {
          resultEl.textContent = res.ok ? "✅ 연결 성공" : `❌ 실패: ${res.error || "알 수 없는 오류"}`;
        }
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    } else if (action === "test-naver") {
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = "테스트 중...";
      const box = document.getElementById("naver-test-result");
      try {
        const res = await api("/api/settings/test-naver", { method: "POST" });
        const 줄 = (이름, r) => r && r.ok
          ? `✅ ${이름} — 연결됨 (${escapeHtml(r.detail || "")})`
          : `⚠ ${이름} — ${escapeHtml((r && r.why) || "알 수 없는 오류")}`;
        box.innerHTML = [줄("블로그 검색 API", res.search), 줄("검색광고 API", res.ad)].join("<br>")
          + (res.fake ? "<br><span class=\"muted\">(시험용 가짜 모드 — 실제 네이버를 부르지 않았습니다)</span>" : "");
        box.className = "naver-test-result " + (res.ok ? "ok" : "bad");
        box.hidden = false;
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
      const 이름 = btn.dataset.label || "매뉴얼";
      btn.textContent = panel.hidden ? `[${이름} 보기]` : `[${이름} 닫기]`;
    } else if (action === "copy-code") {
      // `data-target` 으로 짚어 둔 것이 있으면 그것을, 없으면 **바로 위
      // 명령칸**을 집는다. 명령마다 id 를 붙여 두면 하나 빠뜨릴 때 그
      // 버튼만 조용히 안 먹는다.
      const target = btn.dataset.target
        ? document.getElementById(btn.dataset.target)
        : btn.closest(".setup-code-row")?.querySelector(".setup-code");
      if (!target) return;
      const 글 = target.textContent.trim();
      try {
        await navigator.clipboard.writeText(글);
      } catch {
        // 브라우저가 클립보드를 막는 경우가 있다(오래된 판, 보안 설정).
        // 그때는 글자를 잡아 두기만 해도 Ctrl+C 로 복사하실 수 있다.
        const 범위 = document.createRange();
        범위.selectNodeContents(target);
        const 고른것 = window.getSelection();
        고른것.removeAllRanges(); 고른것.addRange(범위);
        btn.textContent = "Ctrl+C 를 누르세요";
        setTimeout(() => { btn.textContent = "복사"; }, 2500);
        return;
      }
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
    // 글 만들기·이미지는 **복사할 수 있는 창**으로. 휴대폰 알림창은 글을
    // 복사할 수 없어서, 쓰시는 분이 무슨 오류인지 전할 길이 없었다.
    if (action === "generate" && 생성상태.get(Number(id))?.state === "running") {
      생성상태.set(Number(id), { state: "error", msg: err && err.message ? err.message : String(err), end: Date.now() });
      상태칸다시그리기(Number(id));
    }
    if (err && err.data && err.data.needsImages) {
      AI안내창(err.message, "images");
    } else if (err && err.data && err.data.needsAi) {
      AI안내창(err.message);
    } else if (action === "generate" || action === "regenerate-image") {
      오류창(action === "generate" ? "글을 만들지 못했습니다" : "이미지를 다시 찾지 못했습니다",
        err && err.message ? err.message : String(err));
    } else {
      alert(err.message);
    }
  } finally {
    if (action === "generate") 상태칸다시그리기(Number(id));
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
      블로그정보.type = radio.value;
      블로그정보그리기();
      renderFinalDirectionSummary();
    } catch (err) {
      alert(err.message);
    }
  });
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

  // 하루 건수 칸. **사람이 고치는 중일 때는 덮어쓰지 않는다.**
  // 8 을 지우고 3 을 넣으려는 찰나에 다시 그리면 손에서 숫자가 사라진다.
  const 칸수 = document.getElementById("schedule-cap-input");
  if (칸수 && document.activeElement !== 칸수) {
    칸수.value = String(s.dailyCap);
    칸수.max = String(s.dailyCapMax ?? 10);
  }

  시간경고칠하기("timing-warn-cap", s.timing);

  // 큰 시계. 이 화면에서 제일 먼저 눈에 들어와야 하는 값이다.
  const 시계 = document.getElementById("schedule-time-now");
  if (시계) 시계.textContent = s.time;


  const 수 = document.getElementById("schedule-planned");
  const 말 = document.getElementById("schedule-note");
  if (수) 수.textContent = s.planned;
  if (말) {
    말.textContent = s.trimmed > 0
      ? `켜진 카테고리가 ${s.planned + s.trimmed}개인데, 하루 상한이 ${s.dailyCap}편이라 ${s.trimmed}개는 오늘 쉽니다 (차례에 따라 돌아갑니다).`
      : s.planned === 0
        ? "지금은 아무것도 준비되지 않습니다. [블로그 관리]에서 카테고리의 «활성» 을 눌러 켜 주세요."
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
    // 「꺼져 있습니다」 만으로는 못 고치신다. 켜는 명령을 그 자리에 둔다.
    const 명령칸 = document.getElementById("schedule-setup-cmd");
    if (명령칸) 명령칸.textContent = s.setupCommand || "";
    if (s.setupCommand) {
      const 이름 = (s.setupCommand.match(/jobs create http (\S+)/) || [])[1];
      const 지역 = (s.setupCommand.match(/--location=(\S+)/) || [])[1];
      const ㄱ = document.getElementById("schedule-job-name");
      const ㄴ = document.getElementById("schedule-job-loc");
      if (ㄱ && 이름) ㄱ.textContent = 이름;
      if (ㄴ && 지역) ㄴ.textContent = 지역;
    }

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


// ─────────────────────────────────────────── 글 쓸 AI 고르기
//
// 한동안 Claude 하나였다. 파는 입장에서 이게 제일 큰 걸림돌이다 —
// «Claude Pro 를 구독하셔야 합니다» 에서 사시려던 분이 멈춘다. 이미 쓰는
// AI 가 있는데 하나 더 들라는 말이기 때문이다.
//
// 셋 중에 고르시게 한다. **Gemini 는 개인 구글 계정이면 무료**라, 돈 한 푼
// 안 들이고 쓰실 수 있다는 것을 화면에서 바로 보이게 둔다.

let 엔진목록 = null;

function 굵게(글) {
  // 설명에 쓰인 **굵게** 를 진짜 굵은 글씨로. 화면에 별표가 그대로
  // 보이면 지저분하고, «무료» 가 눈에 안 들어온다.
  return escapeHtml(글).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

async function refreshEngines() {
  const 칸 = document.getElementById("ai-engines");
  if (!칸) return;
  try {
    엔진목록 = await api("/api/settings/ai");
  } catch (탈) {
    // 여기서 그냥 돌아가면 **칸이 텅 빈 채로** 화면이 뜬다. 고르실 것이
    // 하나도 안 보이는데 왜인지도 안 나와서, 쓰시는 분은 프로그램이
    // 망가진 줄 아신다. 무엇 때문에 못 불러왔는지 그 자리에 적는다.
    const 말 = 탈 && 탈.message ? 탈.message : String(탈);
    칸.innerHTML = `<p class="setup-warn">설정을 불러오지 못했습니다 — ${escapeHtml(말)}<br>`
      + `<strong>새로고침(F5)</strong> 을 한 번 해 보시고, 그래도 같으면 `
      + `방금 글을 만드는 중일 수 있습니다. 1~2분 뒤 다시 열어 보세요.</p>`;
    return;
  }
  const 옆칸 = document.getElementById("sidebar-who");
  if (옆칸) {
    // 관리자 설정을 아직 안 여셨으면 모른다. 그때는 빈 줄을 남기지 않는다.
    옆칸.textContent = 엔진목록.roleLabel || "";
    옆칸.hidden = !엔진목록.roleLabel;
  }

  const 누구 = document.getElementById("ai-who");
  if (누구) {
    const 주인 = 엔진목록.role === "admin";
    누구.innerHTML = 주인
      ? `지금 <strong>${escapeHtml(엔진목록.roleLabel || "판매용 (주인)")}</strong> 자격으로 들어와 계십니다. 아래 설정을 바꾸실 수 있습니다.`
      : `지금 <strong>${escapeHtml(엔진목록.roleLabel || "체험용")}</strong> 자격입니다 — 글 스타일(블로그 주제·포스팅 방향)만 바꾸실 수 있습니다.<br>`
        + `<strong>사장님이신데 이렇게 보인다면</strong>, 접속키가 체험용으로 발급된 것입니다. `
        + `설치 때 정하신 <strong>대시보드 암호</strong>로 들어오시면 주인 자격이 됩니다.`;
    누구.className = 주인 ? "muted" : "setup-warn";
  }

  칸.innerHTML = 엔진목록.engines.map((e) => `
    <label class="engine ${e.id === 엔진목록.current ? "on" : ""}">
      <input type="radio" name="ai_engine" value="${e.id}" ${e.id === 엔진목록.current ? "checked" : ""} />
      <span class="engine-body">
        <span class="engine-name">${escapeHtml(e.label)}</span>
        <span class="engine-cost">${굵게(e.cost)}</span>
      </span>
    </label>`).join("");
  엔진명령보이기();
}

// 사시는 분이 제일 많이 막히던 자리다. 원인은 둘이었다.
//
//   ① 요약 칸에 **두 줄만** 보였다. 진짜로는 네 줄이고, 마지막
//      「저장통에 올리기」 를 빼면 검은 창에서는 로그인됐는데 서버는
//      모른다. 그런데 화면은 두 줄이 전부인 것처럼 보였다.
//   ② Gemini 는 이 길 자체가 **안 된다.** 로그인 폴더를 올려도 서버가
//      다시 브라우저 승인을 요구하며 죽는다. 그 AI 에는 키 한 줄을
//      받는 칸을 내어야 한다.
//
// 그래서 고른 AI 에 따라 길을 아예 갈라 보인다.

function 저장통() {
  return (엔진목록 && 엔진목록.bucket) || "";
}

/** 로그인 방식(Claude·Codex)일 때 붙여넣으실 명령 네 줄. */
function 로그인명령들(것) {
  const 통 = 저장통();
  const 주소 = 통 ? `gs://${통}` : "gs://내-저장통-이름";
  return [
    { 명: 것.install,
      왜: `검은 창에 <code>${escapeHtml(것.login.split(" ")[0])}</code> 명령 자체를 설치합니다. `
        + `<em>added N packages</em> 가 뜨면 성공입니다.` },
    { 명: `gcloud storage buckets add-iam-policy-binding ${주소} \\
  --member="user:$(gcloud config get-value account)" --role="roles/storage.objectAdmin"`,
      왜: `지금 로그인한 구글 계정이 저장통에 파일을 쓸 수 있게 허락합니다. `
        + `<em>Updated IAM policy</em> 가 뜨면 성공입니다.` },
    { 명: `mkdir -p /tmp/maim-home && HOME=/tmp/maim-home ${것.login}`,
      왜: `진짜 로그인입니다. 파란 링크가 뜨면 눌러서 <strong>본인 계정</strong>으로 승인하세요. `
        + `<strong>앞의 <code>HOME=</code> 을 지우지 마세요</strong> — 로그인 정보를 `
        + `옮길 수 있는 자리에 떨어뜨리는 부분입니다.` },
    { 명: `gcloud storage rsync -r /tmp/maim-home/${것.home} ${주소}/home/${것.home}`,
      왜: `<strong>이게 빠지면 헛수고입니다.</strong> 방금 만든 로그인 정보를 `
        + `서버가 읽는 자리로 옮깁니다. 이걸 안 하면 검은 창에서는 로그인됐는데 `
        + `서버는 여전히 «로그인 안 됨» 입니다.` },
  ];
}

function 엔진명령보이기() {
  if (!엔진목록) return;
  const 것 = 엔진목록.engines.find((e) => e.id === 엔진목록.current);
  if (!것) return;

  const 로그인길 = document.getElementById("ai-way-login");
  const 키길 = document.getElementById("ai-way-key");
  if (!로그인길 || !키길) return;

  const 로그인방식 = !!것.loginWorksOnServer;
  로그인길.hidden = !로그인방식;
  키길.hidden = 로그인방식;

  if (로그인방식) {
    const 줄들 = 로그인명령들(것);
    const 셈 = document.getElementById("ai-login-count");
    if (셈) {
      셈.innerHTML = `⚠️ <strong>${줄들.length}줄입니다. 두 줄이 아닙니다.</strong> `
        + `검은 창(Cloud Shell)에 <strong>①부터 ${줄들.length}까지 차례로</strong> 붙여넣으셔야 합니다. `
        + `특히 마지막 ${줄들.length}번을 빠뜨리면, 검은 창에서는 로그인이 됐는데 `
        + `<strong>서버는 그걸 모릅니다.</strong>`;
    }
    const 자리 = document.getElementById("ai-login-steps");
    if (자리) {
      자리.innerHTML = 줄들.map((줄) => `
        <li>
          <div class="setup-code-row">
            <pre class="setup-code">${escapeHtml(줄.명)}</pre>
            <button class="btn-secondary btn-copy-image" data-action="copy-code">복사</button>
          </div>
          <span class="checklist-item-why">${줄.왜}</span>
        </li>`).join("");
    }
    const 쪽지 = document.getElementById("ai-home-note");
    if (쪽지) {
      쪽지.innerHTML = 저장통()
        ? `저장통 이름은 <code>${escapeHtml(저장통())}</code> 으로 이미 채워 두었습니다 — `
          + `고치실 것 없이 그대로 복사하시면 됩니다.`
        : `⚠️ 저장통 이름을 아직 모릅니다. 명령 속 <code>내-저장통-이름</code> 을 `
          + `본인 것으로 바꿔 주세요. (검은 창에 <code>gcloud storage buckets list</code>)`;
    }
    return;
  }

  모델칸보이기(것);

  // ── 키 한 줄을 받는 길 ──
  const 어떻게 = document.getElementById("ai-key-how");
  if (어떻게) 어떻게.innerHTML = 굵게(것.keyHow || "");
  const 링크 = document.getElementById("ai-key-link");
  if (링크) 링크.href = 것.keyUrl || "#";
  const 칸 = document.getElementById("ai-key-input");
  if (칸) { 칸.value = ""; 칸.placeholder = 것.keySet ? "이미 넣어 두셨습니다 — 바꾸실 때만 새로 붙여넣으세요" : "받은 키를 여기에 붙여넣으세요"; }
  const 상태 = document.getElementById("ai-key-state");
  if (상태) {
    상태.innerHTML = 것.keySet
      ? `✅ 키가 들어가 있습니다 (<code>${escapeHtml(것.key || "")}</code>). 아래 [연결 테스트] 를 눌러 확인하세요.`
      : `아직 키가 없습니다. 위 링크에서 받아 넣어 주세요.`;
  }
}

// 같은 프롬프트를 줘도 **어느 모델이 쓰느냐**에 따라 글의 결이 달라진다.
// 도구마다 기본값의 급이 달라서(예: Gemini CLI 는 빠른 쪽인 flash 로 붙는다)
// 「Claude 로 뽑은 것과 왜 다르지」 가 생긴다. 고르실 수 있게 둔다.
function 모델칸보이기(것) {
  const 줄 = document.getElementById("ai-model-row");
  if (!줄 || !것.modelSetting) { if (줄) 줄.hidden = true; return; }
  줄.hidden = !것.canChangeModel;
  const 힌트 = document.getElementById("ai-model-hint");
  if (힌트) 힌트.textContent = 것.modelHint || "";
  const 칸 = document.getElementById("ai-model-input");
  if (칸) 칸.value = 것.model || "";
  const 상태 = document.getElementById("ai-model-state");
  if (상태) {
    상태.className = "muted";
    상태.textContent = 것.model
      ? `지금 «${것.model}» 로 씁니다.`
      : "지금은 도구 기본값으로 씁니다.";
  }
}

// 접속키는 이 브라우저(localStorage)에 남는다. 나갈 길이 없으면 프로그램이
// 로그인 화면을 아예 안 띄워서, 다른 키로 바꿔 들어올 수가 없다.
// 파실 때도 필요하다 — 남의 컴퓨터에서 쓰고 그냥 나오면 안 된다.
document.addEventListener("click", (e) => {
  const 단추 = e.target.closest && e.target.closest('[data-action="logout"]');
  if (!단추) return;
  e.preventDefault();
  if (!confirm("나가시겠습니까?\n\n이 브라우저에 저장된 접속키를 지웁니다. "
             + "다음에 들어오실 때 키를 다시 넣으셔야 합니다.")) return;
  try { setDashboardToken(""); } catch { /* 저장소를 못 써도 새로고침은 한다 */ }
  try { localStorage.removeItem("maim-dashboard-token"); } catch { /* 위와 같다 */ }
  location.reload();
});

document.addEventListener("click", async (e) => {
  const 모델단추 = e.target.closest && e.target.closest('[data-action="save-ai-model"]');
  if (모델단추) {
    e.preventDefault();
    const 것 = 엔진목록 && 엔진목록.engines.find((x) => x.id === 엔진목록.current);
    const 칸 = document.getElementById("ai-model-input");
    const 상태 = document.getElementById("ai-model-state");
    if (!것 || !칸) return;
    모델단추.disabled = true;
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({ [것.modelSetting]: 칸.value.trim() }) });
      claudeTestedOk = false;
      setStepBadge("claude", false);
      updateSetupProgress();
      await refreshEngines();
    } catch (탈) {
      if (상태) { 상태.className = "setup-warn"; 상태.textContent = 탈 && 탈.message ? 탈.message : String(탈); }
    } finally {
      모델단추.disabled = false;
    }
    return;
  }

  const btn = e.target.closest && e.target.closest('[data-action="save-ai-key"]');
  if (!btn) return;
  e.preventDefault();
  const 것 = 엔진목록 && 엔진목록.engines.find((x) => x.id === 엔진목록.current);
  const 칸 = document.getElementById("ai-key-input");
  if (!것 || !칸) return;
  const 상태 = document.getElementById("ai-key-state");
  const 말하기 = (글, 탈났나) => {
    if (!상태) return;
    상태.innerHTML = 글;
    상태.className = 탈났나 ? "setup-warn" : "muted";
  };

  const 값 = 칸.value.trim();
  if (!값) { 말하기("키를 붙여넣어 주세요.", true); return; }
  btn.disabled = true;
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify({ [것.settingKey]: 값 }) });
    // 키가 바뀌면 이전 «연결 성공» 은 더 이상 근거가 아니다.
    claudeTestedOk = false;
    setStepBadge("claude", false);
    updateSetupProgress();
    await refreshEngines();
  } catch (탈) {
    // 창을 띄우지 않는다. 창은 닫으면 사라져서, 무엇이 잘못됐는지
    // 다시 볼 수가 없다. 칸 바로 아래에 남겨 둔다.
    말하기(escapeHtml(탈 && 탈.message ? 탈.message : String(탈)), true);
  } finally {
    btn.disabled = false;
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  if (!(el instanceof HTMLInputElement) || el.name !== "ai_engine") return;
  // **눌렀다고 바로 바꾸지 않는다.** 한 번 데였다 — 설명을 읽으려고 Codex
  // 칸을 눌렀을 뿐인데 서버 전체가 Codex 로 바뀌었고, 로그인도 안 된
  // Codex 로 체험 회원 글을 쓰다 401 로 멈췄다.
  const 전 = 엔진목록 && 엔진목록.engines.find((x) => x.id === 엔진목록.current);
  const 새 = 엔진목록 && 엔진목록.engines.find((x) => x.id === el.value);
  const 되돌리기 = () => {
    document.querySelectorAll('input[name="ai_engine"]').forEach((r) => {
      r.checked = !!(엔진목록 && r.value === 엔진목록.current);
      r.closest(".engine")?.classList.toggle("on", r.checked);
    });
  };
  if (!confirm(`글 쓰는 AI 를 바꿀까요?\n\n${전 ? 전.label : "지금 것"}  →  ${새 ? 새.label : el.value}\n\n`
             + "바꾸면 이 서버의 모든 글(아침 자동 준비·체험 회원 글 포함)이 새 AI 로 써집니다. "
             + "새 AI 가 로그인(또는 키)이 안 되어 있으면 글이 안 나옵니다 — 바꾼 뒤 [연결 테스트] 를 꼭 눌러 주세요.")) {
    되돌리기();
    return;
  }
  try {
    await api("/api/settings/ai", { method: "PUT", body: JSON.stringify({ engine: el.value }) });
  } catch (탈) {
    alert("AI 를 바꾸지 못했습니다: " + (탈 && 탈.message ? 탈.message : 탈));
    return;
  }
  // 바꾸면 로그인 상태가 달라진다. 초록 표시를 지워, 다시 [연결 테스트] 를
  // 누르게 한다 — 안 그러면 «Claude 는 됐으니 Gemini 도 되겠지» 로 넘어간다.
  claudeTestedOk = false;
  setStepBadge("claude", false);
  updateSetupProgress();
  const 결과 = document.querySelector('[data-result="claude"]');
  if (결과) { 결과.textContent = ""; 결과.className = "setup-step-result"; }
  await refreshEngines();
  await AI막대그리기();
});


// ─────────────────────────────────────────── 복사할 수 있는 오류 창
//
// alert() 창은 휴대폰에서 글을 고를 수가 없다. 체험 회원이 «오류가 떴다»
// 고만 전하게 되고, 무엇이 문제인지 아무도 모른다. 글을 고르고 [복사] 할 수
// 있는 창을 띄운다. 같은 오류는 서버에도 남아 주인이 [최근 오류] 에서 본다.

function 오류창(제목, 내용) {
  let 창 = document.getElementById("error-dialog");
  if (!창) {
    창 = document.createElement("div");
    창.id = "error-dialog";
    창.className = "error-dialog";
    창.innerHTML = `
      <div class="error-dialog-box" role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title">
        <h3 id="error-dialog-title"></h3>
        <textarea id="error-dialog-text" readonly rows="7"></textarea>
        <p class="muted">위 내용을 <strong>[복사]</strong> 해서 보내 주신 분께 전해 주시면 바로 확인할 수 있습니다.</p>
        <div class="error-dialog-actions">
          <button class="btn-primary" type="button" data-error-copy>복사</button>
          <button class="btn-secondary" type="button" data-error-close>닫기</button>
        </div>
      </div>`;
    document.body.appendChild(창);
    창.addEventListener("click", async (e) => {
      if (e.target === 창 || e.target.closest("[data-error-close]")) { 창.hidden = true; return; }
      const 복사단추 = e.target.closest("[data-error-copy]");
      if (!복사단추) return;
      const 칸 = document.getElementById("error-dialog-text");
      try {
        await navigator.clipboard.writeText(칸.value);
      } catch {
        칸.select();                      // 클립보드를 못 쓰는 브라우저면 골라만 둔다
        try { document.execCommand("copy"); } catch { /* 골라 둔 것으로 충분하다 */ }
      }
      복사단추.textContent = "복사됨!";
      setTimeout(() => { 복사단추.textContent = "복사"; }, 1500);
    });
  }
  document.getElementById("error-dialog-title").textContent = `⚠️ ${제목}`;
  const 때 = new Date().toLocaleString("ko-KR");
  document.getElementById("error-dialog-text").value = `${내용}\n\n(${때})`;
  창.hidden = false;
}

// ─────────────────────────────────────────── 최근 오류 (주인 화면)

/** DB 의 시각(UTC, «2026-09-30 07:49:34») 을 한국 시각으로. */
function 한국시각(utc) {
  const d = new Date(String(utc || "").replace(" ", "T") + "Z");
  return Number.isNaN(d.getTime()) ? String(utc || "")
    : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

async function refreshErrors() {
  const 칸 = document.getElementById("error-log-list");
  if (!칸 || isTrialSeat) return;
  let 답;
  try { 답 = await api("/api/errors"); } catch { return; }
  const 줄들 = (답 && 답.errors) || [];
  if (!줄들.length) {
    칸.innerHTML = '<p class="muted">최근에 난 오류가 없습니다.</p>';
    return;
  }
  칸.innerHTML = 줄들.map((e) => {
    const 누구 = e.owner_key
      ? `체험 · ${escapeHtml(e.holder_name || "")} (${escapeHtml(e.owner_key)})`
      : "사장님";
    return `<li><div class="error-log-head"><strong>${escapeHtml(e.stage)}</strong>
      · ${escapeHtml(e.category || "")} · ${누구} · <span class="muted">${escapeHtml(한국시각(e.created_at))}</span></div>
      <div class="error-log-msg">${escapeHtml(e.message)}</div></li>`;
  }).join("");
}

document.addEventListener("click", async (e) => {
  const 새로 = e.target.closest && e.target.closest('[data-action="refresh-errors"]');
  if (새로) { e.preventDefault(); await refreshErrors(); return; }
  const 단추 = e.target.closest && e.target.closest('[data-action="copy-errors"]');
  if (!단추) return;
  e.preventDefault();
  const 칸 = document.getElementById("error-log-list");
  const 글 = 칸 ? 칸.innerText.trim() : "";
  try { await navigator.clipboard.writeText(글); 단추.textContent = "복사됨!"; }
  catch { 단추.textContent = "복사하지 못했습니다"; }
  setTimeout(() => { 단추.textContent = "전부 복사"; }, 1500);
});


// ─────────────────────────────────────────── 맨 위 상태 막대
//
// «지금 누가 들어와 있고, 어느 AI 로, 연결이 되어 있는가» 를 모든 화면
// 맨 위에 늘 보인다. 한 번 데였다 — 사장님은 Claude 인 줄 아셨는데 서버는
// Codex 였고, 그걸 오류 창을 보고서야 알았다.

let AI상태 = null;
let 자동확인함 = false;

function 짧은때(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? ""
    : d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric",
                                  hour: "numeric", minute: "2-digit" });
}

async function AI막대그리기() {
  const 막대 = document.getElementById("ai-bar");
  if (!막대) return null;
  let s;
  try { s = await api("/api/ai/status"); } catch { return null; }
  AI상태 = s;
  const 주인 = s.role === "admin";
  const 누구 = 주인 ? "👤 <strong>사장님(주인)</strong> 접속 중" : "👤 <strong>체험 회원</strong> 접속 중";
  const 엔진 = `🤖 글 쓰는 AI: <strong>${escapeHtml(s.label)}</strong>`;
  let 상태말, 꼴;
  if (s.ok === true) {
    상태말 = `✅ 연결됨${s.at ? ` <span class="ai-bar-when">(${escapeHtml(짧은때(s.at))} 확인)</span>` : ""}`;
    꼴 = "ok";
  } else if (s.ok === false) {
    상태말 = 주인
      ? `⚠️ <strong>연결 안 됨</strong> — 지금은 글이 안 나옵니다 `
        + `<button class="btn-small" data-action="go-ai-settings">AI 설정으로 가기</button>`
      : `⚠️ <strong>지금 AI 연결이 끊겨 글을 만들 수 없습니다.</strong> 보내 주신 분께 알려 주세요.`;
    꼴 = "bad";
  } else {
    상태말 = 주인
      ? `⏳ 연결 확인 전 <button class="btn-small" data-action="go-ai-settings">연결 테스트</button>`
      : `⏳ 준비됨`;
    꼴 = "wait";
  }
  let 바뀜 = "";
  if (주인 && s.changed && s.changed.at && Date.now() - new Date(s.changed.at).getTime() < 3 * 86400_000) {
    const 이름 = (id) => ({ claude: "Claude", gemini: "Gemini", codex: "Codex" }[id] || id);
    바뀜 = `<div class="ai-bar-note">${escapeHtml(짧은때(s.changed.at))}에 `
      + `${escapeHtml(이름(s.changed.from))} → <strong>${escapeHtml(이름(s.changed.to))}</strong> 로 바뀌었습니다.</div>`;
  }
  // 무료 이미지 키. 하나도 없으면 글쓰기를 막으므로 막대도 빨갛게.
  const 그림 = s.images || { count: 0, total: 3, set: [] };
  let 그림말;
  if (그림.count > 0) {
    그림말 = 주인
      ? `🖼️ 무료 이미지: <strong>${escapeHtml(그림.set.join(" · "))}</strong> (${그림.count}/${그림.total})`
      : `🖼️ 무료 이미지 ✅`;
  } else {
    그림말 = 주인
      ? `🖼️ <strong>무료 이미지 키 없음</strong> — 1개 이상 넣어야 글을 만듭니다 `
        + `<button class="btn-small" data-action="go-image-settings">이미지 키 넣기</button>`
      : `🖼️ <strong>무료 이미지 키가 없어 글을 만들 수 없습니다.</strong> 보내 주신 분께 알려 주세요.`;
    꼴 = "bad";
  }
  막대.className = `ai-bar ai-bar-${꼴}`;
  막대.innerHTML = `<div class="ai-bar-line"><span>${누구}</span><span>${엔진}</span><span>${상태말}</span><span>${그림말}</span></div>`
    + (주인 && s.ok === false && s.why ? `<div class="ai-bar-note">${escapeHtml(s.why).slice(0, 300)}</div>` : "")
    + 바뀜;
  막대.hidden = false;

  // 주인이 들어왔는데 준비가 안 된 것이 있으면 **들어오자마자 한 번** 알린다.
  // 막대는 지나치기 쉽다. 이 창은 브라우저를 닫기 전까지 한 번만 뜬다.
  if (주인 && (s.ok === false || 그림.count === 0)) {
    let 알림 = false;
    try { 알림 = sessionStorage.getItem("maim-setup-warned") === "1"; } catch { /* 못 쓰면 매번 */ }
    if (!알림) {
      try { sessionStorage.setItem("maim-setup-warned", "1"); } catch { /* 그만 */ }
      준비안내창(s);
    }
  }

  // 주인이 들어왔는데 아직 모르면 한 번 알아서 확인한다 (짧은 «ok» 한 마디).
  if (주인 && s.ok === null && !자동확인함) {
    자동확인함 = true;
    api("/api/settings/test-claude", { method: "POST" })
      .then(() => AI막대그리기()).catch(() => {});
  }
  return s;
}

/** 글을 만들기 전에 본다. 끊긴 게 분명하면 안내하고 false. */
async function AI되나() {
  let s = await AI막대그리기();
  if (s && s.ok === false) {
    // 적힌 «끊김» 이 옛것일 수 있다. 막기 전에 서버에게 한 번 직접 확인시킨다.
    try {
      s = await api("/api/ai/check", { method: "POST" });
      await AI막대그리기();
    } catch { /* 확인을 못 했으면 적힌 대로 */ }
  }
  if (s && s.ok !== false && s.images && s.images.count === 0) {
    AI안내창(s.role === "admin"
      ? "무료 이미지 사이트 API 키가 하나도 없습니다.\n\n키가 없어도 글은 나오지만 사진이 붙지 않습니다. "
        + "Unsplash · Pexels · Pixabay 중 하나 이상 키를 넣은 뒤 이용해 주세요. 셋 다 무료이고, 가입하면 바로 나옵니다."
      : "지금은 사진을 찾아 올 무료 이미지 키가 설정되어 있지 않아 글을 만들 수 없습니다. 보내 주신 분께 «이미지 키가 없다» 고 알려 주세요. 오늘 한도는 줄지 않았습니다.",
      "images");
    return false;
  }
  if (s && s.ok === false) {
    AI안내창(s.role === "admin"
      ? `글 쓸 AI(${s.label})가 연결되어 있지 않아 지금은 글을 만들 수 없습니다.\n\n${s.why || ""}`
      : "지금은 글 쓸 AI 연결이 끊겨 있어 글을 만들 수 없습니다. 보내 주신 분께 «AI 연결이 끊겼다» 고 알려 주세요. 오늘 한도는 줄지 않았습니다.");
    return false;
  }
  return true;
}

/** 들어오자마자 알리는 창 — AI·이미지 중 무엇이 빠졌는지 한데 모아. */
function 준비안내창(s) {
  const 빠진것 = [];
  if (s.ok === false) 빠진것.push(`• 글 쓸 AI(${s.label})가 연결되어 있지 않습니다.`);
  if (s.images && s.images.count === 0) 빠진것.push("• 무료 이미지 사이트 API 키가 하나도 없습니다 (Unsplash · Pexels · Pixabay 중 1개 이상 필요).");
  AI안내창(`아래가 준비되지 않아 지금은 글을 만들 수 없습니다.\n\n${빠진것.join("\n")}`,
    s.ok === false ? "ai" : "images", "⚠️ 먼저 설정이 필요합니다");
}

/** AI·이미지 키가 없을 때의 안내. 주인은 [확인] 을 누르면 그 설정 자리로 간다. */
function AI안내창(말, 어디 = "ai", 제목 = null) {
  const 주인 = !AI상태 || AI상태.role === "admin";
  let 창 = document.getElementById("ai-dialog");
  if (!창) {
    창 = document.createElement("div");
    창.id = "ai-dialog";
    창.className = "error-dialog";
    창.innerHTML = `
      <div class="error-dialog-box" role="alertdialog" aria-modal="true">
        <h3 id="ai-dialog-title">🤖 AI 연결이 필요합니다</h3>
        <p id="ai-dialog-text" class="ai-dialog-text"></p>
        <div class="error-dialog-actions">
          <button class="btn-secondary" type="button" data-ai-close>닫기</button>
          <button class="btn-primary" type="button" data-ai-go>확인</button>
        </div>
      </div>`;
    document.body.appendChild(창);
    창.addEventListener("click", async (e) => {
      if (e.target === 창 || e.target.closest("[data-ai-close]")) { 창.hidden = true; return; }
      if (e.target.closest("[data-ai-go]")) {
        창.hidden = true;
        if (창.dataset.owner === "1") {
          if (창.dataset.where === "images") await 이미지설정으로(); else await AI설정으로();
        }
      }
    });
  }
  창.dataset.owner = 주인 ? "1" : "0";
  창.dataset.where = 어디;
  document.getElementById("ai-dialog-title").textContent = 제목
    || (어디 === "images" ? "🖼️ 무료 이미지 키가 필요합니다" : "🤖 AI 연결이 필요합니다");
  const 자리 = 어디 === "images"
    ? "[관리자 설정 → 1) AI 커넥트 연결 → 무료 이미지 API 키]"
    : "[관리자 설정 → 1) AI 커넥트 연결]";
  document.getElementById("ai-dialog-text").textContent = 주인
    ? `${말}\n\n[확인] 을 누르시면 ${자리} 로 바로 갑니다.`
    : 말;
  창.querySelector("[data-ai-close]").hidden = !주인;
  창.hidden = false;
}

async function AI설정으로() {
  await switchView("settings");
  const 칸 = document.getElementById("ai-engines");
  const 카드 = 칸 && 칸.closest(".card");
  if (카드) {
    카드.scrollIntoView({ behavior: "smooth", block: "start" });
    카드.classList.add("flash");
    setTimeout(() => 카드.classList.remove("flash"), 2400);
  }
}

/** 무료 이미지 키 넣는 자리로. 첫 칸(Unsplash)을 비춘다. */
async function 이미지설정으로() {
  await switchView("settings");
  const 칸 = document.querySelector('.setup-step[data-step="unsplash"]');
  if (칸) {
    칸.scrollIntoView({ behavior: "smooth", block: "center" });
    칸.classList.add("flash");
    setTimeout(() => 칸.classList.remove("flash"), 2400);
    const 입력 = document.getElementById("unsplash-key-input");
    if (입력) setTimeout(() => 입력.focus({ preventScroll: true }), 600);
  }
}

document.addEventListener("click", async (e) => {
  const 그림단추 = e.target.closest && e.target.closest('[data-action="go-image-settings"]');
  if (그림단추) { e.preventDefault(); await 이미지설정으로(); return; }
  const 단추 = e.target.closest && e.target.closest('[data-action="go-ai-settings"]');
  if (!단추) return;
  e.preventDefault();
  await AI설정으로();
});

AI막대그리기().catch(() => {});
setInterval(() => { AI막대그리기().catch(() => {}); }, 60_000);


// ─────────────────────────────────────────── 블로그 정보 (세부 주제·참고 주소·회사 정보)
//
// 예전에는 주제 분야를 드롭다운 하나로만 골랐다. 이제 칩으로 여러 개 고르고,
// 없으면 [+ 추가] 로 직접 더하고, 이 블로그의 기준 주소와 회사 정보를 저장한다.
// 저장은 [주제·주소 저장] 한 번에 한다 — 칩 하나 누를 때마다 서버에 가면 느리다.

const 블로그정보 = { type: "personal", topics: [], links: [], brand: {}, catalog: null };

/** 종류마다 칸에 보일 안내. */
const 주소안내 = {
  main: "https://blog.naver.com/내블로그",
  ref: "https://news.example.com/지역뉴스",
  homepage: "https://우리회사.com",
  instagram: "https://www.instagram.com/계정",
  youtube: "https://www.youtube.com/@채널",
  store: "https://smartstore.naver.com/가게",
  etc: "https://...",
};

function 블로그정보받기(s) {
  블로그정보.type = s.blog_type === "business" ? "business" : "personal";
  블로그정보.topics = Array.isArray(s.blog_topics) ? [...s.blog_topics] : [];
  블로그정보.links = Array.isArray(s.blog_links) ? s.blog_links.map((l) => ({ ...l })) : [];
  블로그정보.brand = s.blog_brand || {};
  블로그정보.catalog = s.blog_catalog || 블로그정보.catalog;
  // 옛 드롭다운으로 고른 주제가 있고 아직 칩이 없으면, 그것을 첫 칩으로.
  if (!블로그정보.topics.length && s.blog_topic_label) 블로그정보.topics.push(s.blog_topic_label);
  if (!블로그정보.links.length) {
    블로그정보.links = 블로그정보.type === "business"
      ? [{ kind: "homepage", url: "", note: "" }, { kind: "instagram", url: "", note: "" }]
      : [{ kind: "main", url: "", note: "" }, { kind: "ref", url: "", note: "" }];
  }
  const 회사 = 블로그정보.brand;
  const 칸 = (id, v) => { const el = document.getElementById(id); if (el && document.activeElement !== el) el.value = v || ""; };
  칸("brand-name", 회사.name); 칸("brand-intro", 회사.intro); 칸("brand-products", 회사.products);
  블로그정보그리기();
}

function 블로그정보그리기() {
  const 칩칸 = document.getElementById("topic-chips");
  if (!칩칸 || !블로그정보.catalog) return;
  const 고른것 = new Set(블로그정보.topics);
  const 칩 = (값, 보일말, 묶음칩 = false) => `<button type="button" class="topic-chip ${묶음칩 ? "group-chip" : ""} ${고른것.has(값) ? "on" : ""}" data-topic="${escapeHtml(값)}" title="${escapeHtml(값)}">${escapeHtml(보일말)}</button>`;
  const 묶음들 = 블로그정보.type === "business" ? 블로그정보.catalog.business : 블로그정보.catalog.personal;
  const 목록에있는 = new Set(묶음들.flatMap((g) => [g.groupValue, ...g.items.map((x) => x.value)]).filter(Boolean));
  const 직접 = 블로그정보.topics.filter((x) => !목록에있는.has(x));
  칩칸.className = `topic-chips ${블로그정보.type === "business" ? "is-business" : ""}`;
  칩칸.innerHTML = 묶음들.map((g) => `
    <div class="topic-group">
      ${g.groupValue ? 칩(g.groupValue, g.group, true) : `<span class="topic-group-name">${escapeHtml(g.group)}</span>`}
      <span class="topic-subs">${g.items.map((x) => 칩(x.value, x.label)).join("")}</span>
    </div>`).join("")
    + (직접.length ? `<div class="topic-group"><span class="topic-group-name">직접 추가·그 밖에 고른 것</span><span class="topic-subs">${직접.map((x) => 칩(x, x)).join("")}</span></div>` : "");
  const 고름 = document.getElementById("topic-picked");
  if (고름) {
    고름.innerHTML = 블로그정보.topics.length
      ? 블로그정보.topics.map((x) => `<span class="topic-pill">${escapeHtml(x)}<button type="button" data-untopic="${escapeHtml(x)}" title="빼기">×</button></span>`).join("")
        + ` <span class="muted">(${블로그정보.topics.length}/${블로그정보.catalog.maxTopics})</span>`
      : '<span class="muted">아직 없습니다 — 위에서 눌러 고르세요</span>';
  }
  const 회사칸 = document.getElementById("brand-box");
  if (회사칸) 회사칸.hidden = 블로그정보.type !== "business";
  주소줄그리기();
}

function 주소줄그리기() {
  const 칸 = document.getElementById("link-rows");
  if (!칸 || !블로그정보.catalog) return;
  const 종류 = 블로그정보.catalog.linkKinds;
  칸.innerHTML = 블로그정보.links.map((l, i) => `
    <div class="link-row" data-i="${i}">
      <select data-link="kind">${Object.entries(종류).map(([k, v]) => `<option value="${k}" ${l.kind === k ? "selected" : ""}>${escapeHtml(v)}</option>`).join("")}</select>
      <input data-link="url" value="${escapeHtml(l.url || "")}" placeholder="${escapeHtml(주소안내[l.kind] || "https://...")}" />
      <input data-link="note" value="${escapeHtml(l.note || "")}" maxlength="60" placeholder="메모 (선택) — 예: 말투 참고" />
      <button type="button" class="link-del" data-link-del="${i}" title="이 줄 지우기">×</button>
    </div>`).join("");
}

function 주소줄읽기() {
  document.querySelectorAll("#link-rows .link-row").forEach((줄) => {
    const i = Number(줄.dataset.i);
    if (!블로그정보.links[i]) return;
    블로그정보.links[i].kind = 줄.querySelector('[data-link="kind"]').value;
    블로그정보.links[i].url = 줄.querySelector('[data-link="url"]').value.trim();
    블로그정보.links[i].note = 줄.querySelector('[data-link="note"]').value.trim();
  });
}

function 주제더하기(이름) {
  const 말 = (이름 || "").trim().slice(0, 40);
  if (!말) return;
  if (블로그정보.topics.includes(말)) return;
  const 최대 = (블로그정보.catalog && 블로그정보.catalog.maxTopics) || 10;
  if (블로그정보.topics.length >= 최대) { alert(`세부 주제는 ${최대}개까지 고르실 수 있습니다.`); return; }
  블로그정보.topics.push(말);
}

document.addEventListener("click", async (e) => {
  const 칩 = e.target.closest && e.target.closest(".topic-chip");
  if (칩) {
    const 이름 = 칩.dataset.topic;
    if (블로그정보.topics.includes(이름)) 블로그정보.topics = 블로그정보.topics.filter((x) => x !== 이름);
    else 주제더하기(이름);
    블로그정보그리기();
    return;
  }
  const 빼기 = e.target.closest && e.target.closest("[data-untopic]");
  if (빼기) { 블로그정보.topics = 블로그정보.topics.filter((x) => x !== 빼기.dataset.untopic); 블로그정보그리기(); return; }
  const 단추 = e.target.closest && e.target.closest("[data-action]");
  if (!단추) {
    const 지움 = e.target.closest && e.target.closest("[data-link-del]");
    if (지움) { 주소줄읽기(); 블로그정보.links.splice(Number(지움.dataset.linkDel), 1); 주소줄그리기(); }
    return;
  }
  const 할일 = 단추.dataset.action;
  if (할일 === "add-topic") {
    const 칸 = document.getElementById("topic-add-input");
    주제더하기(칸.value); 칸.value = ""; 블로그정보그리기();
  } else if (할일 === "add-link-row") {
    주소줄읽기();
    const 최대 = (블로그정보.catalog && 블로그정보.catalog.maxLinks) || 10;
    if (블로그정보.links.length >= 최대) { alert(`주소는 ${최대}개까지 넣으실 수 있습니다.`); return; }
    블로그정보.links.push({ kind: 블로그정보.type === "business" ? "youtube" : "ref", url: "", note: "" });
    주소줄그리기();
  } else if (할일 === "save-blog-profile") {
    주소줄읽기();
    const 상태 = document.getElementById("blog-profile-state");
    const 넣은주소 = 블로그정보.links.filter((l) => l.url);
    const 틀린주소 = 넣은주소.filter((l) => !/^https?:\/\/[^\s]+\.[^\s]+/i.test(l.url));
    try {
      await api("/api/settings", { method: "PUT", body: JSON.stringify({
        blog_topics: JSON.stringify(블로그정보.topics),
        blog_links: JSON.stringify(넣은주소),
        blog_brand: JSON.stringify({
          name: document.getElementById("brand-name").value,
          intro: document.getElementById("brand-intro").value,
          products: document.getElementById("brand-products").value,
        }),
      }) });
      await refreshSettings();
      if (상태) {
        상태.className = 틀린주소.length ? "setup-warn" : "setup-good";
        상태.textContent = `저장했습니다 — 세부 주제 ${블로그정보.topics.length}개, 주소 ${넣은주소.length - 틀린주소.length}개.`
          + (틀린주소.length ? ` http(s):// 로 시작하지 않는 주소 ${틀린주소.length}개는 뺐습니다.` : "");
      }
    } catch (탈) {
      if (상태) { 상태.className = "setup-warn"; 상태.textContent = 탈.message; }
    }
  }
});

document.addEventListener("change", (e) => {
  if (e.target && e.target.matches && e.target.matches('#link-rows [data-link="kind"]')) {
    주소줄읽기();
    const 칸 = e.target.closest(".link-row").querySelector('[data-link="url"]');
    if (칸) 칸.placeholder = 주소안내[e.target.value] || "https://...";
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target && e.target.id === "topic-add-input") {
    e.preventDefault();
    주제더하기(e.target.value); e.target.value = ""; 블로그정보그리기();
  }
});


// ─────────────────────────────────────────── [지금 생성] 상태칸
//
// 예전에는 [지금 생성] 을 누르면 단추가 «생성 중...» 이 됐다가, 15초마다 표를
// 새로 그리면서 «지금 생성» 으로 돌아갔다. 글은 2~5분째 쓰이고 있는데 화면은
// 아무 일 없는 것처럼 보였다. 그래서 상태를 표 밖(생성상태)에 들고 있고, 표를
// 다시 그려도 그 값으로 그린다. 시간이 지남에 따라 귀여운 말로 바꿔 준다.


/**
 * 단계별 말. 같은 단계 안에서 8초마다 돈다.
 * 단계는 **예상 시간의 비율**로 나눈다 — 초기 ~15% · 중간 ~70% · 마지막. 첫 글(주소를
 * 읽음, 예상 8분)과 자료 메모로 쓰는 글(예상 3분 30초)의 «거의 다 왔어요» 시점이 다르다.
 */
const 쓰는중말 = [
  { until: 0.15, step: "초기", lines: [
    "✏️ 이제 막 연필 깎는 중이에요",
    "🔎 자료부터 살짝 찾아보고 있어요",
    "☕ 커피 한 모금 마시고 시작할게요",
    "📚 오늘 쓸 이야기를 고르는 중이에요",
  ] },
  { until: 0.7, step: "중간", lines: [
    "📝 시작이 반이래요! 열심히 쓰고 있어요",
    "🧠 문장 다듬는 중… 머리 굴러가는 소리 들리시죠?",
    "🖼️ 글에 어울리는 사진도 고르고 있어요",
    "🐢 꼼꼼하게 쓰느라 조금 느려요, 그래도 잘 가고 있어요",
  ] },
  { until: Infinity, step: "마지막", lines: [
    "🏁 거의 다 왔어요! 조금만 기다려 주세요",
    "🎀 마지막 리본 묶는 중이에요",
    "⏳ 진짜 거의 끝! 숨 한 번만 쉬고 오세요",
    "🍪 쿠키 하나 드시면 딱 끝나 있을 거예요",
  ] },
];

function 지난시간(ms) {
  return `${걸린시간(ms)}째`;
}
function 걸린시간(ms) {
  const 초 = Math.max(0, Math.round(ms / 1000));
  return 초 < 60 ? `${초}초` : `${Math.floor(초 / 60)}분${초 % 60 ? ` ${초 % 60}초` : ""}`;
}

function 상태칸(카id) {
  const s = 생성상태.get(카id);
  if (!s) {
    // 쓰는 중이 아니면 이 카테고리의 가장 최근 초안을 보여 준다 — 새로고침해도 «다 됐나» 를 알 수 있게.
    const 최근 = (readyPosts || []).filter((p) => p.category_id === 카id)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    return 최근
      ? `<div class="gs gs-idle">🗂️ 준비된 초안 있음 <button class="link-btn" data-action="go-post" data-post="${최근.id}">보러 가기 →</button></div>`
      : '<div class="gs gs-none">-</div>';
  }
  if (s.state === "running") {
    const 지난 = Date.now() - s.start;
    const 예상 = s.예상 || 210_000;
    const 단계 = 쓰는중말.find((x) => 지난 < x.until * 예상);
    const 말 = 단계.lines[Math.floor(지난 / 8000) % 단계.lines.length];
    const 몇번째 = 쓰는중말.indexOf(단계);
    return `<div class="gs gs-run" role="status" aria-live="polite">
        <span class="gs-steps">${쓰는중말.map((x, i) => `<i class="${i < 몇번째 ? "done" : i === 몇번째 ? "now" : ""}">${x.step}</i>`).join("")}</span>
        <span class="gs-line">${escapeHtml(말)}</span>
        <span class="gs-time">${지난시간(지난)} · 보통 3~5분</span>
      </div>`;
  }
  const 보러 = s.postId ? `<button class="link-btn strong" data-action="go-post" data-post="${s.postId}">글 보러 가기 →</button>` : "";
  // 무엇에 얼마나 걸렸나 — «글 2분 40초 · 사진 35초». 느릴 때 어디가 느린지 보인다.
  const t = s.timing;
  // 자세한 것(모델·조사 횟수·다시 쓴 까닭)은 마우스를 올리면 보인다 — 칸을 좁게 쓰려고.
  const 속 = t ? [
    t.조사ms ? `조사 ${걸린시간(t.조사ms)}${t.조사횟수 ? ` (도구 ${t.조사횟수}번)` : ""}${t.조사실패 ? " — 시간 넘겨 건너뜀" : ""}` : "조사 없음",
    `글쓰기 ${걸린시간(t.글ms)}${t.모델 ? ` (${t.모델})` : ""}`,
    `사진 ${걸린시간(t.사진ms)}`,
    t.첫글 ? "📒 주소를 읽고 메모를 새로 만듦" : t.메모씀 ? "📒 남겨 둔 메모로 씀" : "",
    t.다시 && t.다시.length ? `다시: ${t.다시.join(", ")}` : "",
  ].filter(Boolean).join("\n") : "";
  const 내역 = t
    ? `<span class="gs-time" title="${escapeHtml(속)}">⏱ ${걸린시간(t.전체ms)} · ${t.조사ms ? `조사 ${걸린시간(t.조사ms)} · ` : ""}글 ${걸린시간(t.글ms)} · 사진 ${걸린시간(t.사진ms)}${t.조사실패 ? " ⚠" : ""}</span>`
    : s.end && s.start ? `<span class="gs-time">⏱ ${걸린시간(s.end - s.start)}</span>` : "";
  if (s.state === "done") {
    return `<div class="gs gs-done"><span class="gs-line">🎉 짠! 완성됐어요</span><span>${보러}</span>${내역}</div>`;
  }
  if (s.state === "imgwarn") {
    return `<div class="gs gs-warn"><span class="gs-line">🎉 글은 완성!</span>
      <span class="gs-sub" title="초안 카드에서 [이미지 재생성]을 누르면 다시 붙입니다">📷 사진만 못 붙였어요</span><span>${보러}</span>${내역}</div>`;
  }
  return `<div class="gs gs-err"><span class="gs-line">😢 앗, 이번엔 못 썼어요
      <button class="link-btn" data-action="show-gen-error" data-id="${카id}">이유 보기</button></span></div>`;
}

function 상태칸다시그리기(카id) {
  const 칸 = document.querySelector(`[data-status-for="${카id}"]`);
  if (칸) 칸.innerHTML = 상태칸(카id);
  const 단추 = document.querySelector(`.gen-btn[data-id="${카id}"]`);
  if (단추) {
    const 쓰는중 = 생성상태.get(카id)?.state === "running";
    단추.disabled = 쓰는중;
    단추.textContent = 쓰는중 ? "쓰는 중…" : "지금 생성";
  }
}

// 쓰는 중인 칸만 4초마다 말을 바꾼다. 표 전체를 다시 그리지 않는다.
setInterval(() => {
  for (const [카id, s] of 생성상태) if (s.state === "running") 상태칸다시그리기(카id);
}, 4000);

// 창을 닫으려 하면 쓰던 글이 멈춘다고 알려 준다 (서버는 끝까지 쓰지만 결과 표시를 못 본다).
window.addEventListener("beforeunload", (e) => {
  if ([...생성상태.values()].some((s) => s.state === "running")) { e.preventDefault(); e.returnValue = ""; }
});

/**
 * 그 초안으로 바로 간다 — [포스팅] 을 열고 카드를 비춘다.
 * **본문은 닫힌 채로 둔다.** 펼치면 긴 본문이 화면을 덮어 제목·후보·단추가 안 보인다.
 * 제목을 누르면 펼쳐진다.
 */
async function 초안으로가기(postId) {
  await switchView("drafts");
  try { await refreshQueue(); } catch { /* 이미 있는 것으로 */ }
  const 카드 = document.querySelector(`.post-card[data-post-id="${postId}"]`);
  if (!카드) { alert("그 초안을 찾지 못했습니다. 이미 [발행 완료]로 옮겼을 수 있습니다 — [발행 이력]을 보세요."); return; }
  expandedPostIds.delete(Number(postId));
  카드.querySelector(".post-preview")?.classList.add("collapsed");
  카드.scrollIntoView({ behavior: "smooth", block: "start" });
  카드.classList.add("flash");
  setTimeout(() => 카드.classList.remove("flash"), 2600);
}

document.addEventListener("click", async (e) => {
  const 가기 = e.target.closest && e.target.closest('[data-action="go-post"]');
  if (가기) { e.preventDefault(); await 초안으로가기(가기.dataset.post); return; }
  const 이유 = e.target.closest && e.target.closest('[data-action="show-gen-error"]');
  if (이유) {
    e.preventDefault();
    const s = 생성상태.get(Number(이유.dataset.id));
    오류창("글을 만들지 못했습니다", s && s.msg ? s.msg : "까닭을 받지 못했습니다.");
  }
});
