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
  // 최종본을 저장했으면 그것을 복사한다(원래 초안은 그대로 남아 있다).
  const parts = [post.title ?? "", "", post.final_content || post.content || ""];
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
  if (c.structure || c.write_mode || c.my_note) {
    const 구 = 글구성[c.structure];
    const 말 = [c.write_mode === "experience" ? "경험형" : c.write_mode === "info" ? "정보형" : "", 구 ? 구.이름 : c.structure === "auto" ? "구성 자동 추천" : "", c.my_note ? "내 경험" : ""].filter(Boolean).join(" · ");
    조각.push(`<span class="cat-tag ws" title="⑦ 글 쓰는 방식">✍️ ${escapeHtml(말)}</span>`);
  }
  if (c.kw_apply) 조각.push(`<span class="cat-tag kw" title="🔎 네이버 키워드 탭에서 «포스팅에 적용» 을 켠 카테고리 — 주제 키워드가 비면 보관함 키워드로 씁니다">🔑 보관함</span>`);
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

/** 같은 소제목이 두 번 나오면 ⚠ — 네이버는 반복 구성을 낮게 본다. */
function 중복소제목검사(content) {
  const 본 = new Map();
  for (const 줄 of (content || "").split(/\n+/)) {
    if (!소제목인가(줄)) continue;
    const 키 = 줄.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, "").replace(/\s+/g, "");
    본.set(키, (본.get(키) || 0) + 1);
  }
  const 겹친 = [...본.entries()].filter(([, n]) => n > 1).map(([k]) => k);
  return 겹친.length
    ? { ok: false, label: `같은 소제목 반복: ${겹친.slice(0, 2).join(", ")}` }
    : { ok: true, label: "소제목 중복 없음" };
}

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
    중복소제목검사(content),
    ...(keyword && keywordCount > 8 ? [{ ok: false, label: `키워드 "${keyword}" ${keywordCount}회 — 너무 많음 (3~5회 권장)` }] : []),
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
        <button class="btn-secondary" data-action="mobile-preview" data-id="${p.id}" title="휴대폰 네이버 앱에서 대략 어떻게 보일지">📱 미리보기</button>
        <button class="btn-secondary" data-action="review-open" data-id="${p.id}" title="AI 가 사실·숫자·경험·과장을 표시 → 고쳐서 최종본으로">🔎 최종 검수</button>
        ${p.final_content ? `<span class="badge badge-final" title="[전체 복사하기]는 최종본을 복사합니다">✔ 최종본 ${escapeHtml(짧은날(p.final_at))}</span>` : ""}
        <button class="btn-success" data-action="mark-published" data-id="${p.id}">발행 완료로 표시</button>
      </div>
      ${변주글(p.variation_json)}
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

  // 🔎 네이버 키워드 탭의 키 칸 — 체험 자리에는 값이 안 온다(탭도 숨겨져 있다).
  네이버칸채우기(s);

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
  if (view === "keywords") refreshKeywords().catch((err) => alert(err.message));
  if (view === "style") refreshStyle().catch((err) => alert(err.message));
  if (view === "workshop") refreshWorkshop().catch((err) => alert(err.message));
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
    // ⑦ 글 쓰는 방식 — 빈 값은 «자동(지금처럼)»
    writeMode: form.writeMode.value || null,
    structure: form.structure.value || null,
    lengthPref: form.lengthPref.value || null,
    toneStrength: form.toneStrength.value === "" ? null : Number(form.toneStrength.value),
    myNote: form.myNote.value.trim() || null,
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
  글방식표시();
  document.getElementById("cf-style").open = false;
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
  form.writeMode.value = c.write_mode || "";
  form.structure.value = c.structure || "";
  form.lengthPref.value = c.length_pref || "";
  form.toneStrength.value = c.tone_strength === null || c.tone_strength === undefined ? "" : String(c.tone_strength);
  form.myNote.value = c.my_note || "";
  글방식표시();
  document.getElementById("cf-style").open = !!(c.write_mode || c.structure || c.length_pref || c.tone_strength !== null && c.tone_strength !== undefined || c.my_note);
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
      if (currentView === "keywords") refreshKeywords().catch(() => {});
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
        if (currentView === "keywords") refreshKeywords().catch(() => {});
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
    t.키워드출처 ? `키워드: ${t.키워드출처}${t.보관키워드 ? ` «${t.보관키워드}»` : ""}` : "",
  ].filter(Boolean).join("\n") : "";
  const 내역 = t
    ? `<span class="gs-time" title="${escapeHtml(속)}">⏱ ${걸린시간(t.전체ms)} · ${t.조사ms ? `조사 ${걸린시간(t.조사ms)} · ` : ""}글 ${걸린시간(t.글ms)} · 사진 ${걸린시간(t.사진ms)}${t.조사실패 ? " ⚠" : ""}${t.키워드출처 === "보관함" ? " · 🔑" : ""}</span>`
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

// ════════════════════════════════════════════════════════════════
// 🔎 네이버 키워드 탭
//
// 시간이 걸리는 «키워드 모으기» 를 글쓰기와 따로 여기서 미리 한다.
// 글쓰기는 ④ 에서 체크한 카테고리만 보관함을 읽는다 — 네이버를 부르지 않는다.
// ════════════════════════════════════════════════════════════════
const 등급글 = { gold: "골드", silver: "실버", bronze: "브론즈", etc: "그 외", unknown: "미확인" };
const 등급메달 = { gold: "🥇 ", silver: "🥈 ", bronze: "🥉 ", etc: "", unknown: "" };
let kw목록 = null;          // GET /api/keywords
let kw고른카 = null;        // 고른 카테고리 id
let kw보관 = null;          // GET /api/keywords/:id
let kw거르개 = "all";
let kw고른줄 = null;        // 근거 칸에 보일 키워드 id
let kw진행타이머 = null;
let kw모으는중 = false;

/** 저장해 둔 네이버 키를 칸 아래에 «현재 저장된 값» 으로. 관리자 설정·키워드 탭이 같이 쓴다. */
function 네이버칸채우기(s) {
  const 네이버 = (s && s.naver) || {};
  for (const [칸, 것] of Object.entries(네이버)) {
    const el = document.querySelector(`[data-current="${칸}"]`);
    if (el) el.textContent = 것.set ? `현재 저장된 값: ${것.value}` : "아직 설정되지 않았습니다.";
  }
  const 다있나 = (칸들) => 칸들.every((칸) => 네이버[칸] && 네이버[칸].set);
  setStepBadge("naver-search", 다있나(["naver_search_client_id", "naver_search_client_secret"]));
  setStepBadge("naver-ad", 다있나(["naver_ad_api_key", "naver_ad_secret", "naver_ad_customer_id"]));
}

const 숫자 = (n) => (n === null || n === undefined ? "–" : Number(n).toLocaleString());
const 짧은날 = (iso) => (iso ? new Date(iso).toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" }).replace(/\s/g, "").replace(/\.$/, "") : "");
function 남은날(iso, 유효) {
  if (!iso) return null;
  return 유효 - Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
}

async function refreshKeywords() {
  const [목록, s] = await Promise.all([api("/api/keywords"), api("/api/settings")]);
  kw목록 = 목록;
  네이버칸채우기(s);
  document.getElementById("kw-fake").hidden = !목록.fake;

  // ① 연결 요약
  const c = 목록.connection;
  const t = c.lastTest;
  const 표 = (켜짐, 시험, 이름) => {
    if (시험) return 시험.ok ? `✅ ${이름}` : `⚠ ${이름}`;
    return 켜짐 ? `🔑 ${이름} (키 있음, 테스트 전)` : `○ ${이름} (키 없음)`;
  };
  document.getElementById("kw-conn-summary").innerHTML = [
    표(c.searchSet, t && t.search, "블로그 검색 API"),
    표(c.adSet, t && t.ad, "검색광고 API"),
    t ? `<span class="muted">마지막 확인 ${escapeHtml(new Date(t.at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }))}</span>` : "",
  ].filter(Boolean).map((x) => `<span>${x}</span>`).join("");
  // 키가 하나도 없으면 입력 칸을 펼쳐 둔다 — 무엇을 해야 하는지 바로 보이게.
  if (!c.searchSet && !c.adSet && !목록.fake) {
    document.getElementById("kw-keys").hidden = false;
    document.getElementById("kw-toggle-keys").textContent = "키 칸 접기";
  }

  // ② 카테고리 고르기
  const 칸 = document.getElementById("kw-cat");
  const 카들 = 목록.categories;
  if (!카들.length) {
    칸.innerHTML = `<option>카테고리가 없습니다 — [블로그 관리]에서 먼저 만드세요</option>`;
    kw고른카 = null;
  } else {
    if (!카들.some((x) => x.id === kw고른카)) kw고른카 = 카들[0].id;
    칸.innerHTML = 카들.map((x) => {
      const 남 = 남은날(x.refreshedAt, 목록.validDays);
      const 꼬리 = x.counts.all ? ` — ${x.counts.all}개 · ${짧은날(x.refreshedAt)}${남 !== null && 남 < 0 ? " (30일 지남)" : ""}` : x.paused ? " — 모으다 멈춤" : " — 아직 안 모음";
      return `<option value="${x.id}"${x.id === kw고른카 ? " selected" : ""}>${escapeHtml(x.name)}${escapeHtml(꼬리)}</option>`;
    }).join("");
  }
  키워드적용그리기();
  if (kw고른카) await 보관함불러오기(kw고른카);
  else 보관함그리기();
}

function 고른카() { return kw목록 ? kw목록.categories.find((x) => x.id === kw고른카) : null; }

async function 보관함불러오기(id) {
  kw보관 = await api(`/api/keywords/${id}`);
  보관함그리기();
}

function 보관함그리기() {
  const 카 = 고른카();
  const 씨앗 = document.getElementById("kw-seeds");
  씨앗.innerHTML = 카 && 카.seeds.length
    ? `씨앗: <strong>${카.seeds.map(escapeHtml).join(" · ")}</strong> <span class="muted">(${카.customSeeds ? "직접 정한 것" : "카테고리 이름·주제 키워드·함께 들어갈 말에서"})</span>`
    : "";
  const 씨앗칸 = document.getElementById("kw-seed-input");
  if (씨앗칸 && document.activeElement !== 씨앗칸) 씨앗칸.value = 카 && 카.customSeeds ? 카.seeds.join(", ") : "";
  const 진행 = (kw보관 && kw보관.progress) || (카 && (카.progress || 카.last));
  모으기단추그리기(카, 진행);
  진행그리기(진행, 카);

  const n = (kw보관 && kw보관.counts) || { all: 0, gold: 0, silver: 0, bronze: 0, etc: 0, unknown: 0, hold: 0, used: 0 };
  document.getElementById("kw-cards").innerHTML = [
    ["", "전체 후보", n.all], ["gold", "🥇 골드", n.gold], ["silver", "🥈 실버", n.silver],
    ["bronze", "🥉 브론즈", n.bronze], ["etc", "그 외·미확인", n.etc + n.unknown],
  ].map(([k, 이름, 수]) => `<div class="kw-card ${k}">${이름}<b>${수}</b></div>`).join("");

  document.getElementById("kw-pool-title").textContent = `③ 보관함${카 ? ` — ${카.name}` : ""}`;
  const 줄들 = (kw보관 && kw보관.items) || [];
  const 거르기 = {
    all: () => true,
    gold: (r) => r.status === "candidate" && r.grade === "gold",
    silver: (r) => r.status === "candidate" && r.grade === "silver",
    bronze: (r) => r.status === "candidate" && r.grade === "bronze",
    hold: (r) => r.status === "hold",
    used: (r) => r.status === "used",
  };
  document.getElementById("kw-chips").innerHTML = [
    ["all", `전체 ${줄들.length}`], ["gold", `🥇 골드 ${n.gold}`], ["silver", `🥈 실버 ${n.silver}`],
    ["bronze", `🥉 브론즈 ${n.bronze}`], ["hold", `보류 ${n.hold}`], ["used", `✔ 씀 ${n.used}`],
  ].map(([k, 글]) => `<button class="kw-chip${kw거르개 === k ? " on" : ""}" data-action="kw-filter" data-filter="${k}">${글}</button>`).join("");

  const 보일것 = 줄들.filter(거르기[kw거르개] || 거르기.all);
  const 표 = document.getElementById("kw-table");
  if (!줄들.length) {
    표.innerHTML = `<tbody><tr><td class="kw-empty">아직 모은 키워드가 없습니다. 위 ② 에서 [지금 모으기]를 눌러 주세요.</td></tr></tbody>`;
  } else {
    const 다음 = 카 && 카.next;
    표.innerHTML = `<thead><tr><th>키워드</th><th>등급</th><th class="num">월 검색량</th><th class="num">블로그 문서</th>`
      + `<th class="num">비율</th><th>경쟁</th><th class="num" title="내 블로그와 맞는 정도(0~100) — 줄을 누르면 근거">개인화</th><th>트렌드</th><th>상태</th></tr></thead><tbody>`
      + 보일것.map((r) => {
        const 상태 = r.status === "used" ? `✔ ${escapeHtml(짧은날(r.usedAt))} 씀`
          : r.status === "hold" ? `보류 <button class="btn-secondary kw-mini" data-action="kw-unhold" data-id="${r.id}">후보로</button>`
          : `${r.keyword === 다음 ? "<strong>다음에 씀</strong>" : "대기"} <button class="btn-secondary kw-mini" data-action="kw-hold" data-id="${r.id}">보류</button>`;
        return `<tr data-action="kw-row" data-id="${r.id}" class="${r.id === kw고른줄 ? "sel" : ""}${r.status === "used" ? " used" : ""}">
          <td><strong>${escapeHtml(r.keyword)}</strong>${r.manual ? ' <span class="kw-src">직접</span>' : ""}</td>
          <td><span class="kw-g ${r.grade}">${등급글[r.grade] || r.grade}</span></td>
          <td class="num">${숫자(r.pc + r.mobile)}</td>
          <td class="num">${r.docTotal === null ? '<span class="muted">미확인</span>' : 숫자(r.docTotal)}</td>
          <td class="num">${r.ratio === null ? "–" : Number(r.ratio).toFixed(2)}</td>
          <td>${escapeHtml(r.comp || "")}</td>
          <td class="num"><span class="kw-score ${r.score >= 70 ? "hi" : r.score >= 50 ? "mid" : ""}">${r.score}</span></td>
          <td>${트렌드글(r.trend)}</td>
          <td>${상태}</td></tr>`;
      }).join("") + "</tbody>";
  }
  근거그리기();
}

function 근거그리기() {
  const 칸 = document.getElementById("kw-why");
  const r = kw보관 && kw보관.items.find((x) => x.id === kw고른줄);
  if (!r) { 칸.hidden = true; return; }
  칸.hidden = false;
  const 남 = 남은날(r.fetchedAt, (kw목록 && kw목록.validDays) || 30);
  칸.innerHTML = `<strong>왜 «${escapeHtml(r.keyword)}» 인가</strong><br>
    · 월 검색량 <strong>${숫자(r.pc + r.mobile)}</strong> (PC ${숫자(r.pc)} · 모바일 ${숫자(r.mobile)}) /
      블로그 문서 <strong>${r.docTotal === null ? "미확인" : 숫자(r.docTotal)}</strong>
      → 비율 <strong>${r.ratio === null ? "–" : r.ratio}</strong> = <strong>${등급글[r.grade]}</strong><br>
    · 경쟁 정도 ${escapeHtml(r.comp || "–")} · 씨앗 «${escapeHtml(r.seed || "")}» 에서 나옴 · 모은 날 ${escapeHtml(짧은날(r.fetchedAt))}${남 !== null ? (남 >= 0 ? ` (${남}일 더 씀)` : " (30일 지남)") : ""}<br>
    · 개인화 <strong>${r.score}점</strong> = ${r.scoreWhy.map(escapeHtml).join(" · ")}${kw보관 && kw보관.styleUsed ? "" : ' <span class="muted">(🎨 내 블로그 분석을 승인하면 더 정확해집니다)</span>'}<br>
    ${r.trend ? `· 최근 12개월 검색 흐름 ${트렌드그림(r.trend, 160, 30)} ${트렌드글(r.trend)} <span class="muted">(최근 3달 ÷ 그 앞 3달 · 상대값)</span><br>` : ""}
    ${r.top.length ? `· 상위 글 제목 <span class="muted">(형식·길이 참고용 — 문장은 베끼지 않습니다)</span>
      <ol>${r.top.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ol>` : "· 상위 글 제목을 못 받았습니다"}`;
}

function 모으기단추그리기(카, 진행) {
  const 도는중 = !!(진행 && 진행.state === "running");
  const 모으기 = document.getElementById("kw-collect");
  모으기.disabled = !카 || 도는중;
  모으기.textContent = 도는중 ? "모으는 중…" : 카 && 카.counts.all ? "다시 모으기" : "지금 모으기";
  document.getElementById("kw-resume").hidden = 도는중 || !(카 && 카.paused);
  document.getElementById("kw-stop").hidden = !도는중;
}

function 진행그리기(진행, 카) {
  const 칸 = document.getElementById("kw-prog");
  if (!진행) {
    if (카 && 카.error) {
      칸.hidden = false; 칸.className = "kw-prog err";
      칸.textContent = `⚠ 지난번에 모으다 멈췄습니다 — ${카.error}`;
    } else 칸.hidden = true;
    return;
  }
  칸.hidden = false;
  const 비율막대 = 진행.stage === 1 ? 8 : 진행.stage === 3 ? 100 : 10 + Math.round(85 * (진행.toCheck ? 진행.checked / 진행.toCheck : 0));
  const 거른 = 진행.dropped
    ? `<br><span class="muted">걸러진 것: 검색량 부족 ${진행.dropped.lowVolume} · 빼야 할 말 ${진행.dropped.excluded} · 이미 씀·보류 ${진행.dropped.used}${진행.dropped.relaxed ? " (다 걸러져 기준을 낮춰 다시 골랐습니다)" : ""}`
      + `${진행.seeds && 진행.seeds.length ? ` · 씨앗: ${진행.seeds.map(escapeHtml).join(", ")}` : ""}</span>` : "";
  const 숫자줄 = `연관 키워드 <strong>${숫자(진행.received)}개</strong> 받음 → 검색량 100 이상 <strong>${숫자(진행.filtered)}개</strong>
    → 문서 수 확인 <strong>${진행.checked}/${진행.toCheck}</strong> → 이미 쓴·보류한 키워드 제외 <strong>${진행.excludedUsed}개</strong>
    · 확인 못 함 <strong>${진행.unknown}개</strong>(미확인으로 표시)${거른}`;
  const 시간 = 걸린시간(진행.elapsedMs || 0);
  if (진행.state === "running") {
    칸.className = "kw-prog";
    칸.innerHTML = `<strong>⏳ ${시간}째</strong> — 3단계 중 ${진행.stage}단계: ${escapeHtml(진행.stageName)}
      <div class="kw-bar"><i style="width:${비율막대}%"></i></div>${숫자줄}`;
  } else if (진행.state === "done") {
    칸.className = "kw-prog done";
    칸.innerHTML = `✅ 완료 · ${시간} — ${escapeHtml(진행.message)}<br>${숫자줄}`;
  } else {
    칸.className = "kw-prog err";
    칸.innerHTML = `${진행.state === "error" ? "⚠" : "⏸"} ${시간} — ${escapeHtml(진행.message)}${진행.received ? `<br>${숫자줄}` : ""}`
      + (진행.state === "error" ? `<br><span class="muted">아래 [🩺 점검] 을 누르면 네이버가 무엇이라고 답했는지 단계별로 보입니다.</span>` : "");
  }
}

function 키워드적용그리기() {
  const 칸 = document.getElementById("kw-apply-list");
  const 카들 = (kw목록 && kw목록.categories) || [];
  if (!카들.length) { 칸.innerHTML = `<p class="muted">카테고리가 없습니다.</p>`; return; }
  칸.innerHTML = 카들.map((x) => {
    const 쓸것 = x.counts.gold + x.counts.silver + x.counts.bronze;
    const 막힘 = !x.apply && 쓸것 === 0;
    const 설명 = x.topicKeyword
      ? `주제 키워드 «${escapeHtml(x.topicKeyword)}» 를 직접 적어 두셔서 그것이 먼저입니다${x.apply ? " (비면 보관함을 씁니다)" : ""}`
      : x.apply
        ? (x.next ? `골드 → 실버 → 브론즈 순으로 씀 · 다음 글: «${escapeHtml(x.next)}»` : "켜져 있지만 쓸 키워드가 다 떨어졌습니다 — 예전 방식으로 씁니다. ② 에서 다시 모아 주세요")
        : 막힘 ? "키워드를 먼저 모아야 켤 수 있어요 (②)" : `꺼짐 — 지금처럼 AI 가 키워드를 정합니다 · 쓸 키워드 ${쓸것}개 있음`;
    return `<label class="kw-apply${막힘 ? " off" : ""}">
      <input type="checkbox" data-kw-apply="${x.id}"${x.apply ? " checked" : ""}${막힘 ? " disabled" : ""}>
      <div><strong>${escapeHtml(x.name)}</strong>${x.active ? "" : ' <span class="muted">(꺼진 카테고리)</span>'}<br>
      <span class="muted">${설명}</span></div></label>`;
  }).join("");
}

function kw진행지켜보기(id) {
  clearInterval(kw진행타이머);
  kw진행타이머 = setInterval(async () => {
    try {
      const { progress } = await api(`/api/keywords/${id}/progress`);
      if (kw고른카 === id && progress) { 진행그리기(progress, 고른카()); 모으기단추그리기(고른카(), progress); }
    } catch { /* 다음 번에 다시 본다 */ }
  }, 1500);
}

async function 키워드모으기시작(이어서) {
  const id = kw고른카;
  if (!id || kw모으는중) return;
  kw모으는중 = true;
  진행그리기({ state: "running", stage: 1, stageName: "연관 키워드 받기", elapsedMs: 0, received: 0, filtered: 0, checked: 0, toCheck: 0, excludedUsed: 0, unknown: 0 }, 고른카());
  모으기단추그리기(고른카(), { state: "running" });
  kw진행지켜보기(id);
  let 결과 = null;
  try {
    // 끝날 때까지(최대 5분) 기다린다 — 서버는 요청이 열려 있어야 일한다.
    결과 = await api(`/api/keywords/${id}/collect`, { method: "POST", body: JSON.stringify({ resume: !!이어서 }) });
  } catch (err) {
    오류창("키워드를 모으지 못했습니다", err.message);
  } finally {
    clearInterval(kw진행타이머);
    kw모으는중 = false;
    kw거르개 = "all";
    await refreshKeywords().catch(() => {});
    // 서버가 돌려준 «진짜 결과» 를 마지막으로 그린다(진행 조회가 다른 서버로 가도 결과는 정확하게).
    if (결과 && 결과.state && kw고른카 === id) 진행그리기(결과, 고른카());
  }
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const 할일 = btn.dataset.action;
  if (!할일.startsWith("kw-") && 할일 !== "mobile-preview") return;
  e.preventDefault();
  try {
    if (할일 === "kw-toggle-keys") {
      const 칸 = document.getElementById("kw-keys");
      칸.hidden = !칸.hidden;
      btn.textContent = 칸.hidden ? "키 보기·바꾸기" : "키 칸 접기";
    } else if (할일 === "kw-collect") {
      await 키워드모으기시작(false);
    } else if (할일 === "kw-resume") {
      await 키워드모으기시작(true);
    } else if (할일 === "kw-stop") {
      await api(`/api/keywords/${kw고른카}/stop`, { method: "POST" });
      btn.textContent = "멈추는 중…";
    } else if (할일 === "kw-filter") {
      kw거르개 = btn.dataset.filter;
      보관함그리기();
    } else if (할일 === "kw-hold" || 할일 === "kw-unhold") {
      e.stopPropagation();
      await api(`/api/keywords/item/${btn.dataset.id}`, { method: "PUT", body: JSON.stringify({ status: 할일 === "kw-hold" ? "hold" : "candidate" }) });
      await refreshKeywords();
    } else if (할일 === "kw-row") {
      kw고른줄 = Number(btn.dataset.id);
      document.querySelectorAll("#kw-table tr.sel").forEach((tr) => tr.classList.remove("sel"));
      btn.classList.add("sel");
      근거그리기();
    } else if (할일 === "mobile-preview") {
      모바일미리보기(Number(btn.dataset.id));
    }
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("change", async (e) => {
  if (e.target.id === "kw-cat") {
    document.getElementById("kw-check").hidden = true;
    kw고른카 = Number(e.target.value);
    kw고른줄 = null;
    kw거르개 = "all";
    await 보관함불러오기(kw고른카).catch((err) => alert(err.message));
    return;
  }
  const 카id = e.target.dataset && e.target.dataset.kwApply;
  if (!카id) return;
  const 켜기 = e.target.checked;
  try {
    await api(`/api/keywords/${카id}/apply`, { method: "PUT", body: JSON.stringify({ on: 켜기 }) });
  } catch (err) {
    e.target.checked = !켜기;
    alert(err.message);
  }
  await refreshKeywords().catch(() => {});
  if (categoriesCache.length) refreshCategories().catch(() => {});
});

// ════════════════════════════════════════════════════════════════
// 📱 모바일 미리보기 — 네이버 앱에서 대략 어떻게 보일지(본문 15px · 소제목 19px)
// 실제 네이버 화면과는 조금 다를 수 있다. 네이버를 부르지 않는다.
// ════════════════════════════════════════════════════════════════
/** 이모지로 시작하는 짧은 줄 = 소제목으로 본다 (글쓰기 규칙: 소제목은 이모지로 시작). */
function 소제목인가(줄) {
  const t = (줄 || "").trim();
  return t.length > 0 && t.length <= 45 && /^\p{Extended_Pictographic}/u.test(t) && !/[.。]$/.test(t);
}

function 모바일미리보기(postId) {
  const p = readyPosts.find((x) => x.id === postId);
  if (!p) return;
  const 토큰 = getDashboardToken();
  const 첫사진 = getImagePaths(p).length
    ? `<img src="${escapeHtml(`/api/posts/${p.id}/image/0${토큰 ? `?token=${encodeURIComponent(토큰)}` : ""}`)}" alt="">` : "";
  const 문단 = (p.content || "").split(/\n+/).map((x) => x.trim()).filter(Boolean)
    .map((x) => `<p class="${소제목인가(x) ? "sub" : ""}">${escapeHtml(x)}</p>`).join("");
  let 창 = document.getElementById("mpv-dialog");
  if (!창) {
    창 = document.createElement("div");
    창.id = "mpv-dialog";
    창.className = "error-dialog";
    document.body.appendChild(창);
    창.addEventListener("click", (e) => {
      if (e.target === 창 || e.target.closest("[data-mpv-close]")) { 창.hidden = true; return; }
      if (e.target.closest("[data-mpv-center]")) {
        const 틀 = 창.querySelector(".mpv-frame");
        틀.classList.toggle("center");
        e.target.textContent = 틀.classList.contains("center") ? "왼쪽 정렬로 보기" : "가운데 정렬로 보기";
      }
    });
  }
  창.innerHTML = `<div class="error-dialog-box" role="dialog" aria-modal="true" aria-label="모바일 미리보기">
      <h3>📱 모바일 미리보기</h3>
      <p class="muted">본문 15px · 소제목 19px 기준입니다. 실제 네이버 화면과는 조금 다를 수 있어요.</p>
      <div class="mpv-frame"><h1>${escapeHtml(p.title || "")}</h1>${첫사진}${문단}</div>
      <div class="mpv-tools">
        <button class="btn-secondary" type="button" data-mpv-center>가운데 정렬로 보기</button>
        <button class="btn-primary" type="button" data-mpv-close>닫기</button>
      </div></div>`;
  창.hidden = false;
}

// ════════════════════════════════════════════════════════════════
// ⑦ 글 쓰는 방식 — 카테고리 폼. 서버 src/claude/글방식.ts 와 같은 목록.
// ════════════════════════════════════════════════════════════════
const 글구성 = {
  "1": { 이름: "결론 먼저형", 한줄: "독자가 원하는 답을 먼저 보여 주고 이유를 풀어 갑니다.", 전개: "가장 궁금한 질문의 답 → 그렇게 본 이유 → 자료·사례로 뒷받침 → 답이 달라지는 조건" },
  "2": { 이름: "궁금증 추적형", 한줄: "독자의 궁금증을 하나씩 따라가며 풀어 갑니다.", 전개: "처음 드는 궁금증 → 알아보니 나온 사실 → 다음 궁금증 → 정리" },
  "3": { 이름: "문제 해결형", 한줄: "독자가 겪는 문제와 해결 방법을 차례로 보여 줍니다.", 전개: "흔히 겪는 문제 → 원인 → 해결 방법 단계별 → 안 될 때 대안" },
  "4": { 이름: "비교·선택형", 한줄: "선택지를 나란히 놓고 고르는 기준을 줍니다.", 전개: "비교 대상 소개 → 기준별 차이 → 누구에게 무엇이 맞나 → 결론" },
  "5": { 이름: "장면 출발형", 한줄: "구체적인 장면 하나로 시작해 주제로 넓혀 갑니다.", 전개: "한 장면 → 그 장면에서 생기는 질문 → 정보 → 다시 장면으로 마무리" },
  "6": { 이름: "오해 바로잡기형", 한줄: "흔한 오해를 짚고 맞는 정보로 바로잡습니다.", 전개: "흔히 믿는 것 → 실제로는 → 왜 헷갈리나 → 제대로 아는 법" },
  "7": { 이름: "과정 따라가기형", 한줄: "처음부터 끝까지 순서대로 따라 하게 합니다.", 전개: "준비물·조건 → 1단계 → 2단계 → … → 확인할 것" },
  "8": { 이름: "핵심 발견 확장형", 한줄: "핵심 발견 하나를 먼저 말하고 넓혀 갑니다.", 전개: "알게 된 핵심 한 가지 → 그 의미 → 관련된 것들 → 독자에게 주는 시사점" },
  "9": { 이름: "질문 연결형", 한줄: "독자가 실제로 묻는 질문들을 이어 답합니다.", 전개: "질문 1 → 답 → 이어지는 질문 2 → 답 → … (Q&A 흐름)" },
  "10": { 이름: "관점 제시형", 한줄: "하나의 관점을 분명히 내놓고 근거로 설득합니다.", 전개: "내 관점 한 문장 → 근거 1·2·3 → 반대 의견과 답 → 정리" },
};

/** 고른 구성의 설명과 접힌 제목 줄의 요약을 다시 그린다. */
function 글방식표시() {
  const form = document.getElementById("category-form");
  if (!form || !form.structure) return;
  const 칸 = document.getElementById("cf-structure-desc");
  const v = form.structure.value;
  const 구 = 글구성[v];
  if (구) {
    칸.hidden = false;
    칸.innerHTML = `<strong>${escapeHtml(구.한줄)}</strong><br>전개 예: ${escapeHtml(구.전개)}<br><span class="muted">고정 목차가 아닙니다. 소제목·문단 수는 자료에 맞게 조정합니다.</span>`;
  } else if (v === "auto") {
    칸.hidden = false;
    칸.innerHTML = "글마다 주제·자료를 보고 AI 가 10가지 중 가장 맞는 구성을 고릅니다.";
  } else 칸.hidden = true;
  const 요약 = [
    form.writeMode.value === "info" ? "정보·해석" : form.writeMode.value === "experience" ? "후기·경험형" : "",
    구 ? 구.이름 : v === "auto" ? "구성 자동 추천" : "",
    form.lengthPref.value === "short" ? "짧게" : form.lengthPref.value === "long" ? "길게" : "",
    form.toneStrength.value !== "" ? `말투 ${form.toneStrength.value}%` : "",
    form.myNote.value.trim() ? "내 경험 있음" : "",
  ].filter(Boolean);
  document.getElementById("cf-style-sum").textContent = 요약.length ? 요약.join(" · ") : "선택 · 비워 두면 지금처럼 자동";
}
document.addEventListener("change", (e) => {
  if (e.target.closest && e.target.closest("#cf-style")) 글방식표시();
});
document.addEventListener("input", (e) => {
  if (e.target.name === "myNote") 글방식표시();
});

// ════════════════════════════════════════════════════════════════
// 🔎 최종 검수 — AI 는 표시만, 고치는 것과 최종본 저장은 사람이.
// ════════════════════════════════════════════════════════════════
const 검수이름 = { style: "내 블로그 스타일", principle: "작성 원칙", fact: "사실·숫자·출처", experience: "경험 표현", similar: "참고 자료와 비슷한 표현", exaggeration: "과장·단정·민감" };
const 검수색 = { fact: "rv-bad", experience: "rv-warn", exaggeration: "rv-warn", similar: "rv-warn", style: "rv-warn", principle: "rv-warn" };
let 검수글 = null;   // 지금 검수 창의 글(post)

function 검수결과그리기(결과) {
  const 요약 = document.getElementById("rv-sum");
  const 칸 = document.getElementById("rv-res");
  if (!결과) {
    요약.innerHTML = Object.values(검수이름).map((n) => `<div>${escapeHtml(n)}<br><span class="muted">–</span></div>`).join("");
    칸.innerHTML = `<p class="muted">[AI 검수하기]를 누르면 문제 되는 문장을 여기에 표시합니다. 글을 대신 고치지는 않습니다.</p>`;
    return;
  }
  요약.innerHTML = Object.entries(검수이름).map(([k, n]) => {
    const c = (결과.counts && 결과.counts[k]) || 0;
    return `<div>${escapeHtml(n)}<br><span class="rv-tag ${c ? 검수색[k] : "rv-ok"}">${c ? `⚠ ${c}` : "✅"}</span></div>`;
  }).join("");
  const 줄 = (결과.items || []).map((i) => `<div class="rv-it"><span class="rv-tag ${검수색[i.kind] || "rv-warn"}">${escapeHtml(검수이름[i.kind] || i.kind)}</span>`
    + `<span class="rv-q" data-rv-find="${escapeHtml(i.quote)}" title="누르면 왼쪽 글에서 그 자리로 옮겨 칠해 줍니다">${escapeHtml(i.quote)}</span><br>`
    + `${escapeHtml(i.why)}${i.fix ? `<br><span class="muted">→ ${escapeHtml(i.fix)}</span>` : ""}</div>`).join("");
  const 키워드 = 검수글 ? buildQualityChecklist({ ...검수글, content: document.getElementById("rv-edit").value }) : [];
  칸.innerHTML = (결과.summary ? `<p><strong>${escapeHtml(결과.summary)}</strong></p>` : "")
    + (줄 || `<p class="muted">표시할 문제가 없습니다.</p>`)
    + `<div class="rv-it"><span class="rv-tag rv-ok">화면 점검</span>${키워드.map((x) => `${x.ok ? "✅" : "⚠"} ${escapeHtml(x.label)}`).join(" · ")}</div>`
    + `<p class="muted" style="margin-top:8px">AI 검수는 도구 없이 글만 봅니다 — 사실 확인을 대신하지 못합니다.</p>`;
}

function 검수상태줄() {
  const p = 검수글;
  const 줄 = document.getElementById("rv-state");
  if (!p || !줄) return;
  줄.textContent = `${p.final_content ? `최종본 저장됨 ${new Date(p.final_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "최종본 미저장"} · 검수 ${p.review_count || 0}회`;
  document.getElementById("rv-run").textContent = (p.review_count || 0) > 0 ? "고친 글 다시 검수" : "AI 검수하기";
}

function 검수창열기(postId) {
  const p = readyPosts.find((x) => x.id === postId);
  if (!p) return;
  검수글 = p;
  let 창 = document.getElementById("rv-dialog");
  if (!창) {
    창 = document.createElement("div");
    창.id = "rv-dialog";
    창.className = "error-dialog";
    document.body.appendChild(창);
    창.addEventListener("click", 검수창누름);
    창.addEventListener("change", (e) => {
      if (e.target.id === "rv-confirm") document.getElementById("rv-save").disabled = !e.target.checked;
    });
  }
  창.innerHTML = `<div class="error-dialog-box rv-box" role="dialog" aria-modal="true" aria-label="최종 검수">
    <h3>🔎 최종 검수 — «${escapeHtml(p.title || "")}»</h3>
    <p class="rv-sub">원래 초안은 그대로 두고, 고친 글을 <strong>최종본</strong>으로 따로 저장합니다. AI 는 표시만 하고 고치지 않습니다.</p>
    <div class="rv-bar">
      <button class="btn-primary" data-rv="run" id="rv-run">AI 검수하기</button>
      <span class="muted" id="rv-run-note">1분 안팎 · 최대 2분 · 도구 없이 글만 봅니다</span>
    </div>
    <div class="rv-sum" id="rv-sum"></div>
    <div class="rv-grid">
      <div><div class="rv-tabs"><button class="on" data-rv="tab-edit">검수본·수정</button><button data-rv="tab-mpv">📱 모바일 미리보기</button></div>
        <textarea class="rv-edit" id="rv-edit" spellcheck="false"></textarea>
        <div class="rv-mpv" id="rv-mpv" hidden></div></div>
      <div><div class="rv-tabs"><button class="on" type="button">검수 결과</button></div><div class="rv-res" id="rv-res"></div></div>
    </div>
    <div class="rv-foot">
      <label style="display:flex;gap:8px;align-items:center;font-size:14px"><input type="checkbox" id="rv-confirm"> 글과 검수 결과를 <strong>직접 확인했습니다</strong></label>
      <button class="btn-success" data-rv="save" id="rv-save" disabled>✔ 최종본으로 저장</button>
      <button class="btn-secondary" data-rv="copy-rich">서식째 복사</button>
      <button class="btn-secondary" data-rv="txt">TXT 내려받기</button>
      <button class="btn-secondary" data-rv="img" title="쓰고 계신 이미지 생성 AI(ChatGPT·Gemini·Copilot 등)에 붙여넣어 쓰세요 — 이 프로그램은 이미지를 만들지 않습니다">🖼️ 이미지 프롬프트 복사</button>
      <span class="muted" id="rv-state"></span>
      <button class="btn-secondary" data-rv="close" style="margin-left:auto">닫기</button>
    </div></div>`;
  document.getElementById("rv-edit").value = p.final_content || p.content || "";
  let 지난결과 = null;
  try { 지난결과 = p.review_json ? JSON.parse(p.review_json) : null; } catch { 지난결과 = null; }
  검수결과그리기(지난결과);
  검수상태줄();
  창.hidden = false;
}

function 검수글본문() { return document.getElementById("rv-edit").value; }

function 서식HTML(제목, 본문) {
  const 문단 = 본문.split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => 소제목인가(x)
    ? `<p><b><span style="font-size:19px">${escapeHtml(x)}</span></b></p>`
    : `<p><span style="font-size:15px">${escapeHtml(x)}</span></p>`).join("");
  return `<h2>${escapeHtml(제목)}</h2>${문단}`;
}

function 이미지프롬프트(제목, 본문) {
  const 소제목 = 본문.split(/\n+/).map((x) => x.trim()).filter(소제목인가).slice(0, 5);
  const 요약 = 본문.replace(/\s+/g, " ").slice(0, 500);
  return [
    "아래 네이버 블로그 글에 넣을 이미지를 만들어 주세요.",
    "",
    `[글 제목] ${제목}`,
    "",
    "1. 먼저 표로 정리해 주세요: 번호 · 역할 · 넣을 위치 · 표현 방식 · 비율",
    "2. 대표 이미지 1장: 1080×1080, 제목의 핵심을 한눈에 (짧은 한글 문구 크게)",
    `3. 본문 이미지 ${Math.max(3, Math.min(소제목.length, 4))}장: 아래 소제목 자리마다 하나씩, 비율은 4:3·3:4·9:16 을 섞어서`,
    ...소제목.map((x, i) => `   ${i + 1}) ${x}`),
    "4. 실제 화면·제품·인물·기관 자료처럼 보이게 지어내지 마세요. 설명용 개념 이미지(삽화·도식)로 만들고,",
    "   실제 자료가 필요한 자리는 «실제 자료 확인 필요» 라고 표시만 해 주세요.",
    "5. 모든 이미지 구석에 작게 «AI 생성 이미지» 라고 표시해 주세요.",
    "6. 이미지 안 글자는 한글로, 짧고 크게.",
    "",
    `[글 앞부분] ${요약}`,
  ].join("\n");
}

/** 검수 결과의 문장 → 왼쪽 글에서 그 자리를 찾아 **화면을 그곳으로 옮기고** 칠해 둔다. */
function 검수글위치(글, 말) {
  let i = 글.indexOf(말);
  if (i >= 0) return { i, n: 말.length };
  // AI 가 띄어쓰기·따옴표를 조금 바꿔 옮겨도 찾는다: 공백을 무시하고 맞춘다.
  const 뼈 = 말.replace(/\s+/g, "");
  if (!뼈) return null;
  const 자리 = []; let 납작 = "";
  for (let k = 0; k < 글.length; k++) if (!/\s/.test(글[k])) { 자리.push(k); 납작 += 글[k]; }
  for (const 길이 of [뼈.length, Math.min(뼈.length, 12)]) {
    const j = 납작.indexOf(뼈.slice(0, 길이));
    if (j >= 0) return { i: 자리[j], n: 자리[j + 길이 - 1] - 자리[j] + 1 };
  }
  return null;
}

function 검수문장찾기(찾기) {
  const 창 = document.getElementById("rv-dialog");
  const 칸 = document.getElementById("rv-edit");
  if (칸.hidden) 창.querySelector('[data-rv="tab-edit"]').click();
  const 곳 = 검수글위치(칸.value, 찾기.dataset.rvFind || "");
  const 줄 = document.getElementById("rv-state");
  if (!곳) { 줄.textContent = "글에서 그 문장을 찾지 못했습니다 — 이미 고쳤을 수 있어요."; return; }
  // 같은 글꼴·폭의 보이지 않는 복사본에 앞부분을 넣어 문장이 몇 px 아래에 있는지 잰다.
  const 꼴 = getComputedStyle(칸);
  const 거울 = document.createElement("div");
  for (const k of ["boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth",
    "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "wordSpacing"]) 거울.style[k] = 꼴[k];
  Object.assign(거울.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px", whiteSpace: "pre-wrap", overflowWrap: "break-word", height: "auto", borderStyle: "solid" });
  거울.textContent = 칸.value.slice(0, 곳.i);
  const 표 = document.createElement("span"); 표.textContent = "|"; 거울.appendChild(표);
  document.body.appendChild(거울);
  const 높이 = 표.offsetTop;
  거울.remove();
  칸.scrollTop = Math.max(0, 높이 - 칸.clientHeight / 3);
  칸.scrollIntoView({ block: "nearest", behavior: "smooth" });
  칸.focus({ preventScroll: true });
  칸.setSelectionRange(곳.i, 곳.i + 곳.n);
  창.querySelectorAll(".rv-q.on").forEach((x) => x.classList.remove("on"));
  찾기.classList.add("on");
  줄.textContent = "글에서 찾은 자리를 칠해 두었습니다.";
}

async function 검수창누름(e) {
  const 창 = document.getElementById("rv-dialog");
  if (e.target === 창) { 창.hidden = true; return; }
  const 찾기 = e.target.closest("[data-rv-find]");
  if (찾기) { 검수문장찾기(찾기); return; }
  const b = e.target.closest("[data-rv]");
  if (!b) return;
  const 할일 = b.dataset.rv;
  const p = 검수글;
  try {
    if (할일 === "close") { 창.hidden = true; await refreshQueue().catch(() => {}); }
    else if (할일 === "tab-edit" || 할일 === "tab-mpv") {
      창.querySelectorAll('[data-rv^="tab-"]').forEach((x) => x.classList.toggle("on", x === b));
      const mpv = 할일 === "tab-mpv";
      document.getElementById("rv-edit").hidden = mpv;
      const 칸 = document.getElementById("rv-mpv");
      칸.hidden = !mpv;
      if (mpv) {
        칸.innerHTML = `<div class="mpv-frame center"><h1>${escapeHtml(p.title || "")}</h1>`
          + 검수글본문().split(/\n+/).map((x) => x.trim()).filter(Boolean).map((x) => `<p class="${소제목인가(x) ? "sub" : ""}">${escapeHtml(x)}</p>`).join("")
          + "</div><p class=\"muted\">가운데 정렬 · 본문 15px · 소제목 19px — 실제 네이버 화면과 조금 다를 수 있어요.</p>";
      }
    } else if (할일 === "run") {
      b.disabled = true;
      const 원래 = b.textContent;
      b.textContent = "검수 중…";
      const 시작 = Date.now();
      const 째 = setInterval(() => { document.getElementById("rv-run-note").textContent = `${걸린시간(Date.now() - 시작)}째 · 최대 2분`; }, 1000);
      try {
        const 결과 = await api(`/api/posts/${p.id}/review`, { method: "POST", body: JSON.stringify({ content: 검수글본문() }) });
        p.review_count = 결과.reviewCount;
        p.review_json = JSON.stringify(결과);
        검수결과그리기(결과);
        document.getElementById("rv-run-note").textContent = `검수 ${결과.reviewCount}회 · ${걸린시간(Date.now() - 시작)}${결과.remaining !== null && 결과.remaining !== undefined ? ` · 오늘 남은 검수 ${결과.remaining}번` : ""}`;
      } finally {
        clearInterval(째);
        b.disabled = false;
        b.textContent = 원래;
        검수상태줄();
      }
    } else if (할일 === "save") {
      const 답 = await api(`/api/posts/${p.id}/final`, { method: "POST", body: JSON.stringify({ content: 검수글본문(), confirmed: document.getElementById("rv-confirm").checked }) });
      p.final_content = 검수글본문();
      p.final_at = 답.finalAt;
      검수상태줄();
      b.textContent = "저장됨!";
      setTimeout(() => { b.textContent = "✔ 최종본으로 저장"; }, 1500);
    } else if (할일 === "copy-rich") {
      const 글 = [p.title || "", "", 검수글본문()].join("\n");
      try {
        await navigator.clipboard.write([new ClipboardItem({
          "text/html": new Blob([서식HTML(p.title || "", 검수글본문())], { type: "text/html" }),
          "text/plain": new Blob([글], { type: "text/plain" }),
        })]);
      } catch { await navigator.clipboard.writeText(글); }
      b.textContent = "복사됨!";
      setTimeout(() => { b.textContent = "서식째 복사"; }, 1500);
    } else if (할일 === "txt") {
      const 글 = [p.title || "", "", 검수글본문()].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([글], { type: "text/plain;charset=utf-8" }));
      a.download = `${(p.title || "초안").replace(/[\\/:*?"<>|]/g, "").slice(0, 40)}.txt`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } else if (할일 === "img") {
      await navigator.clipboard.writeText(이미지프롬프트(p.title || "", 검수글본문()));
      b.textContent = "복사됨! 쓰시는 AI 에 붙여넣으세요";
      setTimeout(() => { b.textContent = "🖼️ 이미지 프롬프트 복사"; }, 2500);
    }
  } catch (err) {
    오류창("검수 창에서 문제가 생겼습니다", err && err.message ? err.message : String(err));
  }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest('[data-action="review-open"]');
  if (!b) return;
  e.preventDefault();
  검수창열기(Number(b.dataset.id));
});

// ─────────────────────────────────────────────────────────────
// 🎨 내 블로그 분석 — 공개 글 → AI 스타일·진단 → 사람이 고쳐 승인 → [적용] 체크 때만 글쓰기에
// ─────────────────────────────────────────────────────────────
let st자료 = null;   // GET /api/style
let st지금 = null;   // 화면에 펼친 버전

const st날짜 = (s) => (s ? new Date(s.replace(" ", "T") + (s.includes("Z") ? "" : "Z")).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");

async function refreshStyle() {
  st자료 = await api("/api/style");
  document.getElementById("st-fake").hidden = !st자료.fake;
  const 주소 = document.getElementById("st-url");
  if (!주소.value) 주소.value = st자료.blogUrl || "";
  document.getElementById("st-remaining").textContent = st자료.remaining === null ? "" : ` · 체험 키는 오늘 ${st자료.remaining}번 더`;
  스타일그리기(st자료.current);
  스타일적용그리기();
}

function 스타일그리기(v) {
  st지금 = v;
  const 있음 = !!v;
  document.getElementById("st-empty").hidden = 있음;
  document.getElementById("st-body").hidden = !있음;
  if (!있음) { document.getElementById("st-ver").textContent = ""; return; }
  const 쓰는 = st자료 && st자료.activeId === v.id;
  document.getElementById("st-ver").innerHTML = `v${v.ver} · ${v.approvedAt ? `<b class="ok">승인 ${escapeHtml(st날짜(v.approvedAt))}</b>` : "<b class=\"draft\">승인 전 초안</b>"}`
    + (쓰는 ? " · 글쓰기에 쓰는 버전" : "") + ` · 글 ${v.postCount}편 · ${escapeHtml(st날짜(v.createdAt))} 분석`;
  const s = v.stats || {};
  const 칩 = (이름, 값) => (값 === null || 값 === undefined || 값 === "" ? "" : `<span class="st-chip"><small>${이름}</small>${escapeHtml(String(값))}</span>`);
  document.getElementById("st-stats").innerHTML = [
    칩("읽은 글", s.글수 !== undefined ? `${s.글수}편 (본문 ${s.본문수}편)` : ""),
    칩("기간", s.기간), 칩("주당", s.주당 !== null && s.주당 !== undefined ? `${s.주당}편` : ""),
    칩("제목 평균", s.제목평균 ? `${s.제목평균}자` : ""), 칩("숫자 든 제목", s.제목숫자 !== undefined ? `${s.제목숫자}%` : ""),
    칩("본문 평균", s.본문평균 ? `${Number(s.본문평균).toLocaleString()}자` : ""), 칩("«~요» 끝맺음", s.요체 !== null && s.요체 !== undefined ? `${s.요체}%` : ""),
    칩("이모지 쓰는 글", s.이모지 !== null && s.이모지 !== undefined ? `${s.이모지}%` : ""),
    칩("AI 확실도", v.analysis.confidence !== null ? `${Math.round(v.analysis.confidence * 100)}%` : ""),
    (s.카테고리 || []).length ? `<span class="st-chip wide"><small>카테고리</small>${s.카테고리.map((c) => `${escapeHtml(c.이름)} ${c.수}`).join(" · ")}</span>` : "",
  ].join("");
  const 이름들 = (st자료 && st자료.labels) || {};
  document.getElementById("st-fields").innerHTML = Object.keys(이름들).map((k) => `<label class="st-field"><span>${escapeHtml(이름들[k])}</span>
    <textarea data-st-key="${k}" rows="2">${escapeHtml(v.analysis.style[k] || "")}</textarea></label>`).join("");
  document.getElementById("st-confirm").checked = false;
  document.getElementById("st-approve").disabled = true;
  document.getElementById("st-approve").textContent = v.approvedAt ? "✔ 고친 내용으로 다시 승인" : "✔ 이대로 승인";
  document.getElementById("st-state").textContent = "";
  진단그리기(v.analysis);
}

function 진단그리기(a) {
  const 칸 = document.getElementById("st-diag");
  if (!a || (!a.strengths.length && !a.improvements.length)) { 칸.className = "muted"; 칸.textContent = "진단 내용이 없습니다."; return; }
  칸.className = "st-diag";
  칸.innerHTML = (a.summary ? `<p class="st-sum">${escapeHtml(a.summary)}</p>` : "")
    + `<div class="st-dgrid"><div><h4>👍 강점</h4><ol>${a.strengths.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div>`
    + `<div><h4>🎯 먼저 할 것</h4><ol>${a.priority.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div></div>`
    + `<h4>🔧 개선할 점 <small class="muted">— 체크한 것은 글쓰기에 반영합니다</small></h4><div class="st-imps">${a.improvements.map((x, i) => `<div class="st-imp${x.use === false ? " off" : ""}">
        <label class="st-use"><input type="checkbox" data-st-use="${i}" ${x.use === false ? "" : "checked"}> <b>${i + 1}. ${escapeHtml(x.title)}</b></label>`
      + (x.why ? `<div class="muted">왜: ${escapeHtml(x.why)}</div>` : "") + (x.how ? `<div>→ ${escapeHtml(x.how)}</div>` : "") + "</div>").join("")}</div>`
    + `<p class="muted st-note">④ 를 체크하면 <b>체크한 개선점과 «먼저 할 것»</b> 이 승인한 스타일과 함께 글쓰기·글 작업실 지시문에 들어갑니다. 체크는 바로 저장됩니다(다시 승인할 필요 없음).</p>`;
}

function 스타일적용그리기() {
  const d = st자료 || {};
  const 승인들 = (d.versions || []).filter((v) => v.approvedAt);
  const 쓰는 = 승인들.find((v) => v.id === d.activeId);
  const 상자 = document.getElementById("st-apply");
  상자.checked = !!d.apply && !!쓰는;
  상자.disabled = !쓰는;
  const 진단수 = st지금 && 쓰는 && st지금.id === 쓰는.id ? st지금.analysis.improvements.filter((x) => x.use !== false).length : null;
  document.getElementById("st-apply-label").innerHTML = 쓰는
    ? `승인한 스타일 <b>v${쓰는.ver}</b>${진단수 !== null ? ` + 진단 개선점 <b>${진단수}개</b>` : ""} 를 글쓰기(아침 자동 글·지금 생성)에 적용`
    : "승인한 스타일을 글쓰기에 적용 <span class=\"muted\">— 먼저 ②에서 승인해 주세요</span>";
  document.getElementById("st-versions").innerHTML = 승인들.length
    ? `<div class="st-vers"><b>승인한 버전</b>${승인들.map((v) => `<div class="st-verrow">v${v.ver} · 승인 ${escapeHtml(st날짜(v.approvedAt))} · 글 ${v.postCount}편 `
      + (v.id === d.activeId ? "<span class=\"st-on\">쓰는 중</span>" : `<button class="btn-secondary" data-action="st-use" data-id="${v.id}">이 버전 쓰기</button>`)
      + ` <button class="btn-link" data-action="st-show" data-id="${v.id}">보기</button></div>`).join("")}</div>`
    : "";
}

function 스타일칸모으기() {
  const style = {};
  document.querySelectorAll("#st-fields [data-st-key]").forEach((t) => { style[t.dataset.stKey] = t.value.trim(); });
  return { ...st지금.analysis, style };
}

async function 스타일분석시작() {
  const 주소 = document.getElementById("st-url").value.trim();
  if (!주소) { alert("블로그 주소를 넣어 주세요."); return; }
  if (st지금 && !st지금.approvedAt && !confirm("승인하지 않은 초안이 있습니다. 새로 분석하면 새 초안이 생깁니다(지난 초안은 기록에 남습니다). 계속할까요?")) return;
  const 단추 = document.getElementById("st-run");
  const 진행 = document.getElementById("st-progress");
  단추.disabled = true;
  진행.hidden = false;
  const 시작 = Date.now();
  const 틱 = setInterval(() => {
    const 초 = Math.round((Date.now() - 시작) / 1000);
    진행.textContent = 초 < 30 ? `⏳ 공개 글을 읽는 중… ${초}초` : `🤖 AI 가 스타일을 정리하는 중… ${초}초 (최대 3분)`;
  }, 1000);
  try {
    const v = await api("/api/style/analyze", { method: "POST", body: JSON.stringify({ url: 주소 }) });
    진행.textContent = `✅ 분석 끝 — ${Math.round((Date.now() - 시작) / 1000)}초. 아래 ②를 확인하고 고쳐서 승인해 주세요.`;
    await refreshStyle();
    스타일그리기(v);
    document.getElementById("st-body").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (err) {
    진행.textContent = `⚠ ${err.message}`;
  } finally {
    clearInterval(틱);
    단추.disabled = false;
  }
}

document.addEventListener("change", async (e) => {
  if (e.target.dataset && e.target.dataset.stUse !== undefined && st지금) {
    const 상자들 = [...document.querySelectorAll("[data-st-use]")];
    try {
      const v = await api(`/api/style/${st지금.id}/uses`, { method: "PUT", body: JSON.stringify({ uses: 상자들.map((x) => x.checked) }) });
      st지금 = v;
      e.target.closest(".st-imp").classList.toggle("off", !e.target.checked);
      스타일적용그리기();
    } catch (err) { e.target.checked = !e.target.checked; alert(err.message); }
    return;
  }
  if (e.target.id === "st-confirm") document.getElementById("st-approve").disabled = !e.target.checked;
  if (e.target.id === "st-apply") {
    try {
      await api("/api/style/apply", { method: "PUT", body: JSON.stringify({ on: e.target.checked }) });
      await refreshStyle();
    } catch (err) { e.target.checked = !e.target.checked; alert(err.message); }
  }
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !btn.dataset.action.startsWith("st-")) return;
  e.preventDefault();
  const 할일 = btn.dataset.action;
  try {
    if (할일 === "st-run") await 스타일분석시작();
    else if (할일 === "st-approve") {
      const v = await api(`/api/style/${st지금.id}/approve`, { method: "PUT", body: JSON.stringify({ analysis: 스타일칸모으기(), confirmed: true }) });
      await refreshStyle();
      스타일그리기(v);
      document.getElementById("st-state").textContent = "승인했습니다. ④에서 글쓰기에 적용할 수 있습니다.";
    } else if (할일 === "st-use") {
      await api("/api/style/active", { method: "PUT", body: JSON.stringify({ id: Number(btn.dataset.id) }) });
      await refreshStyle();
    } else if (할일 === "st-show") {
      스타일그리기(await api(`/api/style/${btn.dataset.id}`));
      document.getElementById("st-body").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (err) {
    alert(err.message);
  }
});

// ─────────────────────────────────────────────────────────────
// 🔎 E. 키워드 탭 고도화 — 씨앗 직접·직접 넣기·트렌드·전체 보관함·트렌드 관측·벤치마킹
// ─────────────────────────────────────────────────────────────
function 트렌드글(t) {
  if (!t) return '<span class="muted">–</span>';
  const 표 = { up: ["📈 오름", "up"], down: ["📉 내림", "down"], flat: ["➖ 보합", "flat"] }[t.dir] || ["–", ""];
  return `<span class="kw-trend ${표[1]}" title="최근 3달 ÷ 그 앞 3달 ${t.change > 0 ? "+" : ""}${t.change}%">${표[0]}</span>`;
}

function 트렌드그림(t, w = 80, h = 22) {
  const v = (t.months || []).map((m) => m.v);
  if (v.length < 2) return "";
  const 큰 = Math.max(...v, 1);
  const 점 = v.map((x, i) => `${Math.round((i / (v.length - 1)) * (w - 2)) + 1},${Math.round(h - 2 - (x / 큰) * (h - 4))}`).join(" ");
  return `<svg class="kw-spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="12개월 흐름"><polyline points="${점}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}

let kw전체 = null;

function 전체보관함그리기() {
  const 표 = document.getElementById("kw-all-table");
  if (!kw전체) { 표.innerHTML = ""; return; }
  const q = document.getElementById("kw-all-q").value.trim();
  const g = document.getElementById("kw-all-grade").value;
  const 줄들 = kw전체.filter((r) => (!q || r.keyword.includes(q) || r.categoryName.includes(q)) && (!g || r.grade === g));
  표.innerHTML = 줄들.length ? `<thead><tr><th>카테고리</th><th>키워드</th><th>등급</th><th class="num">검색량</th><th class="num">개인화</th><th>트렌드</th><th>상태</th></tr></thead><tbody>`
    + 줄들.slice(0, 300).map((r) => `<tr class="${r.status === "used" ? "used" : ""}"><td>${escapeHtml(r.categoryName)}</td><td><strong>${escapeHtml(r.keyword)}</strong></td>
      <td><span class="kw-g ${r.grade}">${등급글[r.grade] || r.grade}</span></td><td class="num">${숫자(r.pc + r.mobile)}</td>
      <td class="num">${r.score}</td><td>${트렌드글(r.trend)}</td><td>${{ candidate: "대기", hold: "보류", used: "씀" }[r.status] || r.status}</td></tr>`).join("") + "</tbody>"
    : '<tbody><tr><td class="kw-empty">맞는 키워드가 없습니다.</td></tr></tbody>';
}

function 전체CSV() {
  if (!kw전체 || !kw전체.length) { alert("먼저 [불러오기]를 눌러 주세요."); return; }
  const 칸 = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const 머리 = ["카테고리", "키워드", "등급", "PC", "모바일", "블로그문서", "비율", "경쟁", "개인화", "트렌드", "상태", "모은날"];
  const 줄 = kw전체.map((r) => [r.categoryName, r.keyword, 등급글[r.grade] || r.grade, r.pc, r.mobile, r.docTotal, r.ratio, r.comp, r.score,
    r.trend ? r.trend.dir : "", r.status, (r.fetchedAt || "").slice(0, 10)].map(칸).join(","));
  const blob = new Blob(["\ufeff" + [머리.map(칸).join(","), ...줄].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `키워드보관함-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const 낱말칩 = (words, 어디서) => (words || []).map((w) => `<button class="kw-chip kw-word" data-action="kwx-word" data-word="${escapeHtml(w.word)}" data-from="${escapeHtml(어디서)}" title="눌러서 보관함에 넣기">${escapeHtml(w.word)} <small>${w.count}</small></button>`).join("");

async function 키워드직접넣기(말, 어디서) {
  const 카 = 고른카();
  const 알림 = document.getElementById("kw-tools-msg");
  if (!카) { alert("② 에서 카테고리를 먼저 골라 주세요."); return; }
  알림.textContent = `«${말}» 확인 중…`;
  const r = await api(`/api/keywords/${카.id}/add`, { method: "POST", body: JSON.stringify({ keyword: 말, from: 어디서 }) });
  알림.textContent = `«${말}» 을(를) ${카.name} 보관함에 넣었습니다 — ${등급글[r.grade] || r.grade}`;
  await 보관함불러오기(카.id);
}

document.addEventListener("input", (e) => {
  if (e.target.id === "kw-all-q") 전체보관함그리기();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "kw-all-grade") 전체보관함그리기();
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !btn.dataset.action.startsWith("kwx-")) return;
  e.preventDefault();
  const 할일 = btn.dataset.action;
  const 카 = 고른카();
  btn.disabled = true;
  try {
    if (할일 === "kwx-seeds-save") {
      if (!카) return;
      const r = await api(`/api/keywords/${카.id}/seeds`, { method: "PUT", body: JSON.stringify({ seeds: document.getElementById("kw-seed-input").value }) });
      await refreshKeywords();
      document.getElementById("kw-tools-msg").textContent = r.custom ? "씨앗을 저장했습니다. [다시 모으기] 때 이 씨앗을 씁니다." : "카테고리에서 자동으로 뽑도록 되돌렸습니다.";
    } else if (할일 === "kwx-add") {
      const 칸 = document.getElementById("kw-add-input");
      if (!칸.value.trim()) return;
      await 키워드직접넣기(칸.value.trim(), "직접 추가");
      칸.value = "";
    } else if (할일 === "kwx-trend") {
      if (!카) return;
      const 알림 = document.getElementById("kw-tools-msg");
      알림.textContent = "검색어트렌드 확인 중… (20개까지, 몇 초)";
      const r = await api(`/api/keywords/${카.id}/trend`, { method: "POST" });
      알림.textContent = `${r.done}개의 12개월 흐름을 적었습니다.${r.why ? ` 일부 실패: ${r.why}` : ""}`;
      await 보관함불러오기(카.id);
    } else if (할일 === "kwx-all-load") {
      kw전체 = (await api("/api/keywords/all")).items;
      전체보관함그리기();
    } else if (할일 === "kwx-all-csv") {
      if (!kw전체) kw전체 = (await api("/api/keywords/all")).items;
      전체보관함그리기();
      전체CSV();
    } else if (할일 === "kwx-news") {
      const q = document.getElementById("kw-news-q").value.trim();
      if (!q) return;
      const r = await api(`/api/keywords/news?q=${encodeURIComponent(q)}`);
      document.getElementById("kw-news").innerHTML = `<div class="kw-words"><b>자주 나온 말</b> ${낱말칩(r.words, `뉴스:${q}`) || '<span class="muted">없음</span>'}</div>`
        + `<ol class="kw-news-list">${r.items.map((x) => `<li>${escapeHtml(x.title)} <span class="muted">${escapeHtml(짧은날(x.date) || "")}</span></li>`).join("")}</ol>`;
    } else if (할일 === "kwx-bench") {
      const q = document.getElementById("kw-bench-q").value.trim();
      if (!q) return;
      const r = await api(`/api/keywords/bench?q=${encodeURIComponent(q)}`);
      document.getElementById("kw-bench").innerHTML = r.blogs.length
        ? `<div class="kw-bench-list">${r.blogs.map((b) => `<div class="kw-bench-item"><div><b>${escapeHtml(b.name)}</b> <span class="muted">상위 50개 중 ${b.count}편</span>
            <div class="muted kw-bench-t">${b.titles.map(escapeHtml).join(" · ")}</div></div>
            ${b.blogId ? `<button class="btn-secondary kw-mini" data-action="kwx-bench-blog" data-id="${escapeHtml(b.blogId)}">제목 보기</button>` : ""}</div>`).join("")}</div><div id="kw-bench-blog"></div>`
        : '<p class="muted">찾은 블로그가 없습니다.</p>';
    } else if (할일 === "kwx-bench-blog") {
      const r = await api(`/api/keywords/bench/blog?id=${encodeURIComponent(btn.dataset.id)}`);
      document.getElementById("kw-bench-blog").innerHTML = `<div class="kw-bench-blog"><b>${escapeHtml(r.blogId)}</b> 최근 글 ${r.titles.length}편에서 자주 쓰는 말
        <div class="kw-words">${낱말칩(r.words, `벤치마킹:${r.blogId}`) || '<span class="muted">없음</span>'}</div>
        <details><summary class="muted">제목 ${r.titles.length}개 보기</summary><ol>${r.titles.map((t) => `<li>${escapeHtml(t.title)} <span class="muted">${escapeHtml(t.date)}</span></li>`).join("")}</ol></details></div>`;
    } else if (할일 === "kwx-word") {
      await 키워드직접넣기(btn.dataset.word, btn.dataset.from || "직접 추가");
      btn.classList.add("on");
    }
  } catch (err) {
    alert(err.message);
  } finally {
    btn.disabled = false;
  }
});

// ─────────────────────────────────────────────────────────────
// ✍️ D. 글 작업실 — 키워드 → 상위 5·사전 지식 → 차별화 준비·승인 → 구간별 작성 → 포스팅 저장
// ─────────────────────────────────────────────────────────────
let wk자료 = null;   // GET /api/workshop
let wk지금 = null;   // 열어 둔 작업
let wk방향 = [];     // 고른 검색 방향

const wk단계이름 = ["키워드", "상위 5 · 사전 지식", "차별화 준비 · 승인", "구간별 작성", "포스팅 저장"];

async function refreshWorkshop() {
  wk자료 = await api("/api/workshop");
  document.getElementById("wk-fake").hidden = !wk자료.fake;
  const 칸 = document.getElementById("wk-cat");
  const 전 = 칸.value;
  칸.innerHTML = wk자료.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
  if (전 && wk자료.categories.some((c) => String(c.id) === 전)) 칸.value = 전;
  작업실보관함그리기();
  document.getElementById("wk-list").innerHTML = wk자료.works.length
    ? `<b>최근 작업</b>${wk자료.works.map((w) => `<button class="wk-item${wk지금 && wk지금.id === w.id ? " on" : ""}" data-action="wk-open" data-id="${w.id}">
        <span>${escapeHtml(w.keyword)}</span><small>${escapeHtml(w.categoryName)} · ${w.step}/5 ${escapeHtml(wk단계이름[w.step - 1])}${w.postId ? " ✔" : ""}</small></button>`).join("")}`
    : "";
}

function 작업실보관함그리기() {
  const c = wk자료 && wk자료.categories.find((x) => String(x.id) === document.getElementById("wk-cat").value);
  const 풀 = c ? c.pool : [];
  document.getElementById("wk-kw-list").innerHTML = 풀.map((p) => `<option value="${escapeHtml(p.keyword)}">`).join("");
  document.getElementById("wk-pool").innerHTML = 풀.length
    ? `<span class="muted">보관함:</span> ${풀.map((p) => `<button class="kw-chip" data-action="wk-pick" data-kw="${escapeHtml(p.keyword)}"><span class="kw-g ${p.grade}">${등급글[p.grade] || ""}</span> ${escapeHtml(p.keyword)}</button>`).join("")}`
    : '<span class="muted">이 카테고리 보관함이 비어 있습니다 — 키워드를 직접 적어도 됩니다.</span>';
}

function 작업그리기(w) {
  wk지금 = w;
  document.getElementById("wk-work").hidden = !w;
  if (!w) return;
  const s = w.state;
  const 칸 = document.getElementById("wk-cat");
  if (칸.value !== String(w.categoryId) && [...칸.options].some((o) => o.value === String(w.categoryId))) { 칸.value = String(w.categoryId); 작업실보관함그리기(); }
  document.getElementById("wk-steps").innerHTML = wk단계이름.map((이름, i) => `<span class="wk-step${i + 1 < w.step ? " done" : i + 1 === w.step ? " on" : ""}">${i + 1}. ${이름}</span>`).join("");
  document.getElementById("wk-meta").textContent = `«${w.keyword}» · ${w.categoryName}${s.directions.length ? ` · 방향: ${s.directions.join(", ")}` : ""}`;
  document.getElementById("wk-prepare").textContent = s.prep ? "다시 확보 · 정리" : "상위 5개 확보 · 사전 지식 정리";

  // ② 상위 5 · 사전 지식
  const p = s.prep;
  document.getElementById("wk-prep").innerHTML = !p ? "" : `
    <div class="kw-scroll" style="margin-top:12px"><table class="kw-table"><thead><tr><th>자료</th><th>상위 글 (형식 참고 — 베끼지 않음)</th><th>블로그</th><th class="num">글자수</th><th class="num">소제목</th></tr></thead><tbody>
      ${s.top.map((t) => `<tr><td>[자료 ${t.n}]</td><td><a href="${escapeHtml(t.link)}" target="_blank" rel="noopener">${escapeHtml(t.title)}</a></td><td>${escapeHtml(t.blogger)}</td>
        <td class="num">${t.chars === null ? "–" : 숫자(t.chars)}</td><td class="num">${t.heads ?? "–"}</td></tr>`).join("") || '<tr><td colspan="5" class="kw-empty">상위 글을 받지 못했습니다 — 키워드만으로 정리했습니다.</td></tr>'}
    </tbody></table></div>
    <p class="muted st-note">상위 글 평균 <b>${s.topAvg ? 숫자(s.topAvg) + "자" : "–"}</b> · 자주 나온 말: ${s.topWords.map((x) => escapeHtml(x.word)).join(", ") || "–"}</p>
    <div class="wk-grid">
      <div><h4>🙋 독자가 궁금해할 것</h4><ol>${p.questions.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div>
      <div><h4>📚 상위 글이 공통으로 다루는 것</h4><ol>${p.common.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div>
      <div class="wk-gap"><h4>✨ 빈틈 — 차별화 기회</h4><ol>${p.gaps.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol></div>
      <div><h4>🔎 사실 후보 <small class="muted">(확인 전 — 출처 글에서 꼭 확인)</small></h4><ol>${p.facts.map((f) => `<li>${escapeHtml(f.text)}${f.src ? ` <span class="wk-src">[자료 ${f.src}]</span>` : ""}</li>`).join("")}</ol></div>
    </div>`;

  // ③ 차별화 준비 · 승인
  const 셋 = document.getElementById("wk-approve-body");
  if (!p) { 셋.className = "muted"; 셋.textContent = "② 를 마치면 여기서 내 자료·제목·목차를 정합니다."; }
  else {
    셋.className = "";
    const 잠김 = !!s.approvedAt;
    셋.innerHTML = `
      <h4>🧩 필요한 내 자료 <small class="muted">— 답한 것만 «내 경험» 으로 씁니다. 모르면 비워 두세요</small></h4>
      ${p.need.map((q, i) => `<label class="st-field"><span>${escapeHtml(q)}</span><textarea rows="2" data-wk-answer="${i}">${escapeHtml(s.answers[i] || "")}</textarea></label>`).join("")}
      <h4>🏷️ 제목</h4>
      <div class="wk-titles">${p.titles.map((t) => `<button class="kw-chip" data-action="wk-title" data-t="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("")}</div>
      <input type="text" id="wk-title" class="kw-input wk-wide" value="${escapeHtml(s.title)}">
      <h4>🗂️ 목차 4구간 <small class="muted">— 소제목과 할 말을 고칠 수 있습니다</small></h4>
      ${s.outline.map((o, i) => `<div class="wk-ol"><b>${i + 1}</b><input type="text" data-wk-head="${i}" value="${escapeHtml(o.heading)}"><input type="text" data-wk-point="${i}" value="${escapeHtml(o.point)}" placeholder="이 구간에서 할 말"></div>`).join("")}
      <h4>#️⃣ 태그</h4>
      <input type="text" id="wk-tags" class="kw-input wk-wide" value="${escapeHtml(s.tags.join(", "))}">
      <div class="st-foot">
        <label><input type="checkbox" id="wk-confirm"> 준비 내용을 <strong>직접 확인했습니다</strong></label>
        <button class="btn-success" data-action="wk-approve" id="wk-approve" disabled>${잠김 ? "✔ 고친 내용으로 다시 승인" : "✔ 승인하고 쓰기로"}</button>
        <span class="muted">${잠김 ? `승인 ${escapeHtml(st날짜(s.approvedAt.replace("T", " ").slice(0, 19)))}` : ""}</span>
      </div>`;
  }

  // ④ 구간별 작성
  const 넷 = document.getElementById("wk-sections");
  if (!s.approvedAt) { 넷.className = "muted"; 넷.textContent = "③ 을 승인하면 4구간을 하나씩 씁니다."; }
  else {
    넷.className = "";
    const 총 = s.sections.reduce((a, x) => a + x.replace(/\s/g, "").length, 0);
    넷.innerHTML = `
      <p class="muted st-note">구간마다 [쓰기] → 읽고 고치기 → 마음에 안 들면 [다시 쓰기]. 사실을 쓴 문장 끝에 <span class="wk-src">[자료 n]</span> 이 붙습니다 — ② 표의 글에서 확인하세요.
        ${wk자료 && wk자료.style ? `🎨 승인한 내 블로그 스타일 v${wk자료.style.ver} 을 씁니다.` : ""}</p>
      <div class="kw-row"><button class="btn-primary" data-action="wk-write-all">남은 구간 모두 쓰기</button>
        <button class="btn-secondary" data-action="wk-save-edits">고친 내용 저장</button><span class="muted" id="wk-sec-msg">지금 ${숫자(총)}자(공백 빼고)</span></div>
      ${s.outline.map((o, i) => `<div class="wk-sec"><div class="wk-sec-h"><b>${i + 1}. ${escapeHtml(o.heading)}</b>
          <button class="btn-secondary kw-mini" data-action="wk-write" data-n="${i}">${s.sections[i].trim() ? "다시 쓰기" : "이 구간 쓰기"}</button></div>
        <textarea data-wk-sec="${i}" rows="${s.sections[i].trim() ? 8 : 2}" placeholder="${escapeHtml(o.point || "")}">${escapeHtml(s.sections[i])}</textarea></div>`).join("")}
      <div class="st-foot">
        <label><input type="checkbox" id="wk-strip" checked> 본문의 <strong>[자료 n]</strong> 표시는 지우고 저장</label>
        <button class="btn-success" data-action="wk-save-post" ${s.sections.every((x) => x.trim()) && !w.postId ? "" : "disabled"}>📝 포스팅으로 저장</button>
        <span class="muted" id="wk-save-msg">${w.postId ? "✔ 포스팅으로 저장했습니다 — [포스팅] 탭에서 [🔎 최종 검수] 로 이어 가세요." : ""}</span>
      </div>`;
  }
}

function 작업칸모으기() {
  const s = wk지금.state;
  return {
    title: (document.getElementById("wk-title") || {}).value ?? s.title,
    tags: ((document.getElementById("wk-tags") || {}).value ?? s.tags.join(",")).split(/[,\s]+/).map((x) => x.replace(/^#/, "").trim()).filter(Boolean),
    outline: s.outline.map((o, i) => ({
      heading: (document.querySelector(`[data-wk-head="${i}"]`) || {}).value ?? o.heading,
      point: (document.querySelector(`[data-wk-point="${i}"]`) || {}).value ?? o.point,
    })),
    answers: (s.prep ? s.prep.need : []).map((_, i) => (document.querySelector(`[data-wk-answer="${i}"]`) || {}).value ?? ""),
  };
}

const 구간칸들 = () => [...document.querySelectorAll("[data-wk-sec]")].map((t) => t.value);

async function 작업열기(id) {
  작업그리기(await api(`/api/workshop/${id}`));
  await refreshWorkshop();
  document.getElementById("wk-work").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function 오래걸림(글, 할일) {
  const 진행 = document.getElementById("wk-prog");
  진행.hidden = false;
  const 시작 = Date.now();
  const 틱 = setInterval(() => { 진행.textContent = `${글} ${Math.round((Date.now() - 시작) / 1000)}초`; }, 1000);
  진행.textContent = 글;
  try { const r = await 할일(); 진행.textContent = `✅ 끝 — ${Math.round((Date.now() - 시작) / 1000)}초`; return r; }
  catch (err) { 진행.textContent = `⚠ ${err.message}`; throw err; }
  finally { clearInterval(틱); }
}

document.addEventListener("change", (e) => {
  if (e.target.id === "wk-cat") { 작업실보관함그리기(); document.getElementById("wk-dirs").innerHTML = ""; wk방향 = []; }
  if (e.target.id === "wk-confirm") document.getElementById("wk-approve").disabled = !e.target.checked;
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn || !btn.dataset.action.startsWith("wk-")) return;
  e.preventDefault();
  const 할일 = btn.dataset.action;
  const w = wk지금;
  try {
    if (할일 === "wk-pick") { document.getElementById("wk-kw").value = btn.dataset.kw; document.getElementById("wk-dirs").innerHTML = ""; wk방향 = []; }
    else if (할일 === "wk-dirs") {
      const kw = document.getElementById("wk-kw").value.trim();
      if (!kw) { alert("키워드를 먼저 넣어 주세요."); return; }
      btn.disabled = true;
      const r = await api(`/api/workshop/directions?kw=${encodeURIComponent(kw)}`);
      wk방향 = [];
      document.getElementById("wk-dirs").innerHTML = r.items.length
        ? `<div class="kw-words"><span class="muted">다룰 방향을 3개까지 고르세요 (연관 검색어 · 월 검색량):</span>${r.items.map((x) => `<button class="kw-chip" data-action="wk-dir" data-kw="${escapeHtml(x.keyword)}">${escapeHtml(x.keyword)} <small>${숫자(x.vol)}</small></button>`).join("")}</div>`
        : '<p class="muted">연관 검색어를 받지 못했습니다 — 방향 없이 시작해도 됩니다.</p>';
    } else if (할일 === "wk-dir") {
      const k = btn.dataset.kw;
      if (wk방향.includes(k)) wk방향 = wk방향.filter((x) => x !== k);
      else if (wk방향.length < 3) wk방향.push(k);
      document.querySelectorAll('[data-action="wk-dir"]').forEach((b) => b.classList.toggle("on", wk방향.includes(b.dataset.kw)));
    } else if (할일 === "wk-new") {
      const kw = document.getElementById("wk-kw").value.trim();
      const w2 = await api("/api/workshop", { method: "POST", body: JSON.stringify({ categoryId: Number(document.getElementById("wk-cat").value), keyword: kw, directions: wk방향 }) });
      document.getElementById("wk-new-msg").textContent = "작업을 만들었습니다. 아래 ② 부터 진행하세요.";
      await 작업열기(w2.id);
    } else if (할일 === "wk-open") await 작업열기(Number(btn.dataset.id));
    else if (할일 === "wk-prepare") {
      if (w.state.approvedAt && !confirm("이미 승인한 작업입니다. 상위 글·사전 지식만 새로 받고, 승인한 제목·목차·쓴 구간은 그대로 둡니다. 계속할까요?")) return;
      btn.disabled = true;
      const r = await 오래걸림("⏳ 상위 글을 읽고 AI 가 정리하는 중…", () => api(`/api/workshop/${w.id}/prepare`, { method: "POST" }));
      작업그리기(r);
      await refreshWorkshop();
    } else if (할일 === "wk-title") document.getElementById("wk-title").value = btn.dataset.t;
    else if (할일 === "wk-approve") {
      작업그리기(await api(`/api/workshop/${w.id}/approve`, { method: "PUT", body: JSON.stringify({ ...작업칸모으기(), confirmed: true }) }));
      await refreshWorkshop();
      document.getElementById("wk-c4").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (할일 === "wk-write" || 할일 === "wk-write-all") {
      // 먼저 사람이 고친 것을 저장해 두고 쓴다 — AI 답이 사람 손을 덮지 않게.
      await api(`/api/workshop/${w.id}/sections`, { method: "PUT", body: JSON.stringify({ sections: 구간칸들() }) });
      const 할것 = 할일 === "wk-write" ? [Number(btn.dataset.n)] : w.state.sections.map((x, i) => (x.trim() ? -1 : i)).filter((i) => i >= 0);
      const 알림 = document.getElementById("wk-sec-msg");
      document.querySelectorAll('[data-action^="wk-write"]').forEach((b) => { b.disabled = true; });
      let r = null;
      for (const n of 할것) {
        알림.textContent = `✍️ ${n + 1}구간 쓰는 중… (구간마다 1분 안팎)`;
        r = await api(`/api/workshop/${w.id}/section/${n}`, { method: "POST" });
        작업그리기(r);
      }
      if (!r) 알림.textContent = "남은 구간이 없습니다.";
    } else if (할일 === "wk-save-edits") {
      작업그리기(await api(`/api/workshop/${w.id}/sections`, { method: "PUT", body: JSON.stringify({ sections: 구간칸들() }) }));
      document.getElementById("wk-sec-msg").textContent = "저장했습니다.";
    } else if (할일 === "wk-save-post") {
      await api(`/api/workshop/${w.id}/sections`, { method: "PUT", body: JSON.stringify({ sections: 구간칸들() }) });
      btn.disabled = true;
      const r = await api(`/api/workshop/${w.id}/save`, { method: "POST", body: JSON.stringify({ stripMarks: document.getElementById("wk-strip").checked }) });
      작업그리기(r.work);
      await refreshWorkshop();
      if (r.imageError) document.getElementById("wk-save-msg").textContent += ` (사진은 못 붙였습니다: ${r.imageError})`;
    }
  } catch (err) {
    alert(err.message);
  } finally {
    if (할일 !== "wk-save-post") btn.disabled = false;
  }
});

// 포스팅 카드의 «🎛 변주» 한 줄 — 이 글에 고른 도입·소제목·목록·마무리.
const 변주이름 = {
  opening: { greeting: "인사 도입", question: "질문 도입", anecdote: "일화 도입", headline: "헤드라인 도입", monologue: "혼잣말 도입",
    number: "숫자 도입", myth: "오해 짚기 도입", empathy: "공감 도입", conclusion: "결론 먼저 도입", dialogue: "한마디 인용 도입" },
  heading: { question: "질문형 소제목", noun: "명사형 소제목", step: "단계형 소제목", verdict: "결론형 소제목", talk: "말 걸기 소제목" },
  list: { check: "✔️ 목록", arrow: "👉 목록", circled: "①② 목록", dot: "• 목록", prose: "줄글 위주" },
  device: { qa: "Q&A 구간", compare: "비교 구간", mistake: "실수 짚기", scene: "장면 묘사", tip: "숨은 팁", numbers: "숫자 정리" },
  closing: { summary: "세 줄 요약 마무리", checklist: "할 일 3개 마무리", question: "질문 마무리", next: "다음 할 일 마무리", case: "상황별 추천 마무리", short: "담백한 마무리" },
};
function 변주글(json) {
  let v = null;
  try { v = json ? JSON.parse(json) : null; } catch { v = null; }
  if (!v) return "";
  const 것 = ["opening", "heading", "list", "device", "closing"].map((k) => (변주이름[k] || {})[v[k]]).filter(Boolean);
  return 것.length ? `<p class="post-variation" title="최근 글과 겹치지 않게 고른 변주">🎛 ${것.map(escapeHtml).join(" · ")}</p>` : "";
}

// 🩺 모으기 점검 — 네이버가 단계마다 무엇이라고 답했는지 그대로.
async function 모으기점검() {
  const 카 = 고른카();
  const 칸 = document.getElementById("kw-check");
  if (!카) return;
  칸.hidden = false;
  칸.innerHTML = "🩺 점검 중… (몇 초)";
  const r = await api(`/api/keywords/${카.id}/check`);
  const 표 = (ok) => (ok ? "✅" : "⚠");
  칸.innerHTML = `<b>🩺 «${escapeHtml(카.name)}» 모으기 점검</b>${r.fake ? ' <span class="muted">(가짜 모드)</span>' : ""}
    <ol>
      <li>씨앗: <b>${r.seeds.map(escapeHtml).join(", ") || "(없음)"}</b> <span class="muted">${r.customSeeds ? "직접 정한 것" : "카테고리 이름·주제 키워드·함께 들어갈 말에서"} · 기호·띄어쓰기는 뺌</span></li>
      <li>${표(r.together.ok)} 연관 키워드(씨앗 한꺼번에): ${r.together.ok ? `<b>${r.together.rows}개</b> 받음 · 검색량 100 이상 ${r.together.over100}개` : escapeHtml(r.together.why)}</li>
      <li>씨앗 하나씩: ${r.each.map((e) => `${표(e.ok)} «${escapeHtml(e.seed)}» ${e.ok ? `${e.rows}개 — ${e.top.map(escapeHtml).join(", ")}` : escapeHtml(e.why)}`).join("<br>")}</li>
      <li>${표(r.blog.ok)} 블로그 검색 «${escapeHtml(r.blog.keyword)}»: ${r.blog.ok ? `문서 ${숫자(r.blog.total)}건` : escapeHtml(r.blog.why)}</li>
    </ol>
    <p class="muted">⚠ 가 있으면 그 줄을 캡처해서 보내 주세요. 모두 ✅ 인데도 0개면 씨앗이 너무 좁은 것입니다 — «씨앗 직접 정하기» 에 넓은 말을 넣어 보세요.</p>`;
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="kwc-check"]');
  if (!btn) return;
  e.preventDefault();
  btn.disabled = true;
  try { await 모으기점검(); } catch (err) { document.getElementById("kw-check").textContent = `⚠ ${err.message}`; }
  finally { btn.disabled = false; }
});
