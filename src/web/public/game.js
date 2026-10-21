/**
 * 🕹️ 게임 플레이 탭 (주인 + 게임 블로그만) — GAME_PLAN 7-7·15번, 시안 docs/game/시안/게임플레이_시안.html
 *
 *   메인        상태 막대 · 숫자 4칸 · ▶ 게임 실행 · 지금 퀘스트 체크리스트 · 방금 사진 · 퀘스트 표 · 직접 플레이 대기
 *   미션        🎯 게임 미션 목록(게임 속 목록 읽기·📷 캡처 추가·사람 확인) · 미션 목록 · ＋ 새 미션
 *   앨범·공략 글 퀘스트 사진 순서·빼기 → 📚 참고 글 → 공략 글 만들기
 *   설정        하루 상한·보관일 · 게임 프로필(모드·버튼·금지 화면·실행 파일·기본 참고 주소)
 * 📝 포스팅 카드의 [🕹️ 내 게임 캡처에서 고르기]·[캡처 다시 고르기(AI)] 도 여기서 처리한다(15-8).
 *
 * app.js 의 api()·escapeHtml()·getDashboardToken()·switchView() 를 그대로 쓴다.
 */
(() => {
  const esc = (t) => escapeHtml(String(t ?? ""));
  const G = {
    tab: "main", game: null, status: null, quests: [], qTab: "메인", timer: null, 바쁨: false,
    albumQuest: null, album: null, refs: [], 후보: [], missions: null, list: null, listGame: null,
    evidence: null, settings: null, profiles: null, profileGame: null,
    pick: null,
  };
  const 이미지 = (url) => { const t = getDashboardToken(); return t ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(t)}` : url; };
  const 시각 = (iso) => { if (!iso) return ""; const d = new Date(iso.includes("T") ? iso : `${iso.replace(" ", "T")}Z`); return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
  const 시분 = (iso) => 시각(iso).slice(-5);
  const 판 = (n) => document.querySelector(`[data-g-pane="${n}"]`);
  const 장면글 = { 퀘스트받음: "📜", 퀘스트완료: "✅", 보상: "🎁", 이동중: "📍", 도착: "🚩", 대화: "💬", 전투: "⚔️", 보스등장: "👹", 보스처치: "🏆", 포획: "🪤", 지도: "🗺️", 사망: "💀", 경고: "⚠️", 팝업: "❗", 로그인: "🔑", 로딩: "⏳", 목록: "📋", 기타: "📷" };
  const 기록글 = {
    세션시작: "▶ 시작", 세션끝: "⏹ 끝", 퀘스트받음: "📜 퀘스트 받음", 퀘스트완료: "✅ 퀘스트 완료", 사진: "📸 사진 남김",
    체크리스트다참: "🎯 사진 체크리스트 다 참 — 글 쓸 준비", 직접플레이대기: "🙋 직접 플레이 대기", 안전: "🛡️ 안전 규칙",
    정지: "⏹ 정지", 확인필요: "⚠️ 확인 필요", 로그인필요: "🔑 로그인 필요", 막힘: "🙋 막힘", 판단: "🤖 판단",
    시작명령: "📨 시작 명령", 정지명령: "📨 정지 명령", 목록읽음: "📋 목록 읽음", 공략글: "📝 공략 글", 미션목표다채움: "🏁 미션 목표 다 채움",
    사람이완료: "✔ 직접 완료로 표시", 진행시작: "🎮 플레이 시작", 프로필고침: "⚙️ 프로필 고침", 목록확인사진: "📷 목록 확인 사진",
  };
  const 상태색 = { 끊김: "bad", 준비됨: "ok", 켜는중: "run", 로딩: "run", 자동진행: "run", 직접플레이: "run", 목록읽기: "run", 로그인필요: "todo", 확인필요: "todo" };
  const 퀘스트배지 = { 진행중: ["", "진행 중"], 완료: ["badge-active", "완료"], 직접플레이대기: ["badge-todo", "직접 플레이 대기"], 글완료: ["badge-violet", "글 완료"] };
  const 목록배지 = { 진행중: ["", "진행 중"], 진행가능: ["badge-active", "진행 가능"], 조건미달: ["badge-inactive", "조건 미달"], 확인필요: ["badge-todo", "확인 필요"], 완료: ["badge-inactive", "완료"] };

  // ── 불러오기 ─────────────────────────────────────────
  async function 상태읽기() {
    G.status = await api("/api/game/status");
    G.game = G.game || G.status.game || G.status.profiles[0]?.id;
    const 대기 = G.status.stats?.waiting || 0;
    const 칸 = document.getElementById("nav-game-count");
    if (칸) { 칸.hidden = !대기; 칸.textContent = 대기; }
  }
  async function 퀘스트읽기() {
    if (!G.game || G.status?.needsGameBucket) { G.quests = []; return; }
    G.quests = (await api(`/api/game/quests?game=${encodeURIComponent(G.game)}`)).items;
  }
  const 프로필 = (id = G.game) => G.status?.profiles.find((p) => p.id === id);

  async function 새로고침(전부 = true) {
    if (G.바쁨) return;
    G.바쁨 = true;
    try {
      await 상태읽기();
      if (전부 || G.tab === "main") await 퀘스트읽기();
      위쪽그리기();
      if (G.tab === "main") 메인그리기();
      if (G.tab === "missions" && 전부) await 미션열기();
      if (G.tab === "album" && 전부) await 앨범열기(G.albumQuest);
      if (G.tab === "settings" && 전부) await 설정열기();
    } catch (탈) {
      판("main").innerHTML = `<div class="g-alert bad">불러오지 못했습니다 — ${esc(탈.message)}</div>`;
    } finally { G.바쁨 = false; }
  }

  function 열기() {
    새로고침(true);
    clearInterval(G.timer);
    // 보고 있는 동안만 3초마다 상태를 다시 읽는다(집 PC 하트비트는 5초).
    G.timer = setInterval(() => {
      if (document.querySelector('[data-view-panel="game"]')?.hidden) { clearInterval(G.timer); return; }
      if (document.activeElement?.closest?.('[data-view-panel="game"] input, [data-view-panel="game"] select, [data-view-panel="game"] textarea')) return;
      if (G.tab === "main") 새로고침(false);
    }, 3000);
  }

  function 탭(t) {
    G.tab = t;
    document.querySelectorAll("#g-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
    document.querySelectorAll("[data-g-pane]").forEach((p) => { p.hidden = p.dataset.gPane !== t; });
    새로고침(true);
  }

  // ── 처음 연결 전 안내 (시안 6) ───────────────────────
  function 위쪽그리기() {
    const s = G.status;
    const 칸 = document.getElementById("g-setup");
    const 알림 = [];
    if (s.needsGameBucket) 알림.push(`<div class="g-alert bad"><b>게임 사진 저장통이 없습니다.</b> 서버 환경변수 <code>GAME_SHOT_BUCKET</code> 을 넣어야 게임 기능이 켜집니다.
      서버는 Cloud Shell 에서 저장통을 만들고 배포 때 넣습니다(GAME_PLAN 12번). PC 에서 시험할 때는 <code>.env</code> 에 <code>GAME_SHOT_BUCKET=local:data/game-shots</code>.</div>`);
    if (!s.agentTokenSet) 알림.push(`<div class="g-alert warn"><b>집 PC 연결 토큰이 없습니다.</b> 서버 환경변수 <code>GAME_AGENT_TOKEN</code>(긴 무작위 글자)을 넣고, 집 PC 에도 같은 값을 <code>MAIM_GAME_AGENT_TOKEN</code> 으로 넣으세요.</div>`);
    if (s.agentTokenSet && !s.needsGameBucket && !s.agent.connected && s.agent.secondsAgo === null)
      알림.push(`<div class="g-alert warn"><b>집 PC 가 아직 한 번도 연결되지 않았습니다.</b> 처음 세팅 순서:
        <ol class="g-ol"><li>집 PC 에 Python 설치 → <code>agent</code> 폴더에서 <code>pip install -r requirements.txt</code></li>
        <li>환경변수 3개: <code>MAIM_SERVER_URL</code> · <code>MAIM_GAME_AGENT_TOKEN</code> · <code>MAIM_GAME_ROOT</code></li>
        <li><code>python main.py</code> 를 켜 두기 (게임 없이 시험: <code>python main.py --가상 --빠르게</code>)</li>
        <li>이 화면 상태 막대가 «준비됨» 으로 바뀌면 [▶ 게임 실행]</li></ol></div>`);
    칸.innerHTML = 알림.join("");
  }

  // ── ① 메인 ───────────────────────────────────────────
  function 상태막대() {
    const s = G.status, a = s.agent, d = a.display;
    const p = 프로필(s.session?.game || a.game || G.game);
    const 이름 = p ? `${p.이름} · ${p.모드} 모드` : "—";
    const 언제 = a.secondsAgo === null ? "한 번도 연결 안 됨" : `${a.secondsAgo}초 전 신호`;
    const 남은 = Math.max(0, s.limitMinutes - s.usedMinutes);
    const 까닭 = a.detail?.까닭 && ["확인필요", "로그인필요", "준비됨"].includes(d.key) ? `<p class="note">마지막 멈춤: ${esc(a.detail.까닭)}</p>` : "";
    const 목록 = a.detail?.목록대기 ? `<p class="note">📋 게임에서 퀘스트 목록 창을 열어 두고 집 PC 에서 <b>F10</b> 을 눌러 주세요.</p>` : "";
    const 대기명령 = s.pending ? `<p class="note">📨 «${esc(s.pending.명령)}» 명령을 집 PC 가 다음 신호(5초 안)에 받아 갑니다.</p>` : "";
    const 도는중 = ["켜는중", "로딩", "자동진행", "직접플레이", "목록읽기"].includes(d.key);
    return `<div class="g-play-bar ${상태색[d.key] || ""}">
      <div class="line"><span class="state"><i class="g-dot ${d.key === "끊김" ? "r" : 도는중 ? "b" : d.key === "준비됨" ? "g" : "y"}"></i>${esc(d.글)}</span>
        <span>🎮 ${esc(이름)}</span><span>⏱ 오늘 ${s.usedMinutes} / ${s.limitMinutes}분 (남은 ${남은}분)</span>
        <span class="when">🖥️ 집 PC ${esc(언제)}${a.version ? ` · v${esc(a.version)}` : ""}${a.detail?.가상 ? " · 🧪 가상 게임" : ""}</span></div>
      <div class="ctrl">
        <button class="btn-secondary btn-small" data-action="g-capture" ${a.connected ? "" : "disabled"} title="게임 입력이 아니라 기록 모드에서도 됩니다">📸 F9 대신 찍기</button>
        <button class="btn-danger btn-small" data-action="g-stop" ${a.connected ? "" : "disabled"}>⏹ 즉시 정지</button>
      </div>${까닭}${목록}${대기명령}</div>`;
  }

  function 체크칩(checklist) {
    return `<div class="g-chips">${checklist.map((c) => `<span class="g-chip ${c.다참 ? "done" : c.찬수 ? "now" : ""}">${c.다참 ? "✔ " : ""}${esc(c.이름)}${c.개수 > 1 ? ` ${c.찬수}/${c.개수}` : ""}</span>`).join("")}</div>`;
  }
  const 미터 = (찬, 전체, 초록) => `<div class="g-prog"><div class="g-meter ${초록 ? "g" : ""}"><i style="width:${전체 ? Math.round((찬 / 전체) * 100) : 0}%"></i></div>${찬}/${전체}</div>`;

  function 메인그리기() {
    const s = G.status;
    const 칸 = 판("main");
    if (s.needsGameBucket) { 칸.innerHTML = 상태막대(); return; }
    const p = 프로필();
    const 미션들 = (G.missions?.items || []).filter((m) => m.game_id === G.game && m.status !== "글완료");
    const q = s.quest;
    const 도는중 = ["켜는중", "로딩", "자동진행", "직접플레이", "목록읽기"].includes(s.agent.display.key);
    const 대기 = G.quests.filter((x) => x.status === "직접플레이대기");
    const 퀘스트들 = G.quests.filter((x) => (G.qTab === "기타" ? !["메인", "서브"].includes(x.kind) : x.kind === G.qTab));
    const 개수 = (k) => G.quests.filter((x) => (k === "기타" ? !["메인", "서브"].includes(x.kind) : x.kind === k)).length;
    칸.innerHTML = `${상태막대()}
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">오늘 사용</span><span>⏱</span></div><div class="stat-card-value">${s.usedMinutes}<span class="muted g-unit"> / ${s.limitMinutes}분</span></div><div class="g-meter g-mt"><i style="width:${Math.min(100, Math.round((s.usedMinutes / Math.max(1, s.limitMinutes)) * 100))}%"></i></div></div>
        <div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">오늘 남긴 사진</span><span>📸</span></div><div class="stat-card-value">${s.stats?.todayShots ?? 0}</div><p class="stat-card-sub">원본은 집 PC 에 ${s.agent.detail?.원본수 ?? "?"}장</p></div>
        <div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">글 쓸 준비 된 퀘스트</span><span>✅</span></div><div class="stat-card-value">${s.stats?.ready ?? 0}</div><p class="stat-card-sub">사진 체크리스트가 다 찬 것</p></div>
        <div class="stat-card"><div class="stat-card-top"><span class="stat-card-label">직접 플레이 대기</span><span>🙋</span></div><div class="stat-card-value g-todo">${s.stats?.waiting ?? 0}</div><p class="stat-card-sub">막혀서 넘긴 퀘스트</p></div>
      </div>
      <div class="g-run-grid">
        <div class="card">
          <div class="card-header"><h2>▶ 게임 실행</h2><span class="faint g-small">누르면 집 PC 가 5초 안에 받아 갑니다</span></div>
          <div class="g-run-form">
            <div><label class="g-f">게임</label><select id="g-game">${s.profiles.map((x) => `<option value="${esc(x.id)}" ${x.id === G.game ? "selected" : ""}>${esc(x.이름)} · ${esc(x.모드)} 모드</option>`).join("")}</select></div>
            <div><label class="g-f">미션</label><select id="g-mission"><option value="">미션 없이 자유 진행</option>${미션들.map((m) => `<option value="${m.id}">${esc(m.title)} (${m.완료수}/${m.목표수})</option>`).join("")}</select></div>
            <div class="full g-mode-tip">${p?.모드 === "감독"
              ? "🤖 <b>감독 모드</b> — 집 PC 가 게임을 켜고, 게임의 공식 자동 진행과 프로필에 적힌 버튼만 눌러 미션을 진행합니다. 캡처는 자동. 금지 화면(상점·결제 등)이 보이면 즉시 멈춥니다."
              : "🙋 <b>기록 모드</b> — 집 PC 는 게임을 켜고 <b>캡처만</b> 합니다(키보드·마우스 입력 0건). 플레이는 직접 하세요. 빠진 장면은 F9 로 채웁니다."}</div>
            <div class="full g-btns">
              <button class="btn-primary" data-action="g-start" ${s.agent.connected && !도는중 ? "" : "disabled"}>▶ 게임 실행</button>
              <button class="btn-secondary" data-action="g-tab" data-tab="missions">미션 만들기</button>
              ${s.agent.connected ? "" : `<span class="faint g-small">집 PC 가 연결되면 누를 수 있습니다</span>`}
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><h2>지금 퀘스트</h2>${q ? `<a href="#" data-action="g-album" data-id="${q.id}">앨범 →</a>` : ""}</div>
          ${q ? `<div class="g-q-name">${esc(q.name)} <span class="badge">${esc(q.kind)}</span></div>
            <div class="g-q-sub">${s.mission ? `미션 «${esc(s.mission.title)}» ${s.mission.완료수}/${s.mission.목표수} · ` : ""}시작 ${시분(q.first_seen_at)}</div>
            ${체크칩(q.checklist)}${미터(q.찬, q.전체)}
            ${p?.모드 === "기록" ? `<p class="faint g-small">빠진 장면은 게임에서 그 화면을 띄우고 F9 (또는 위 [📸 F9 대신 찍기]).</p>` : ""}`
            : `<p class="muted">진행 중인 퀘스트가 없습니다.${s.session ? " 화면을 읽는 중…" : " [▶ 게임 실행] 을 누르면 시작합니다."}</p>`}
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h2>방금 남긴 사진</h2><span class="faint g-small">서버에는 줄인 사진만(가로 1280px)</span></div>
        ${s.recentShots.length ? `<div class="g-strip">${s.recentShots.slice(0, 8).map((x) => `<a class="g-shot" href="${esc(이미지(x.url))}" target="_blank" rel="noopener"><img src="${esc(이미지(x.url))}" alt="" loading="lazy"><span class="tag">${장면글[x.scene] || ""} ${esc(x.scene)}</span><span class="cap">${esc(x.caption || "")}</span></a>`).join("")}</div>` : `<p class="muted">아직 없습니다.</p>`}
        <ul class="g-log">${s.log.filter((e) => e.kind !== "판단").slice(0, 8).map((e) => `<li><time>${시분(e.at)}</time><span>${esc(기록글[e.kind] || e.kind)}${e.detail.이름 ? ` — «${esc(e.detail.이름)}»` : ""}${e.detail.장면 ? ` (${esc(e.detail.장면)})` : ""}${e.detail.이유 || e.detail.까닭 ? ` · ${esc(e.detail.이유 || e.detail.까닭)}` : ""}${e.detail.찬 !== undefined ? ` · 사진 ${e.detail.찬}/${e.detail.전체}` : ""}</span></li>`).join("")}</ul>
      </div>
      <div class="card">
        <div class="card-header"><h2>퀘스트</h2>
          <select id="g-game2" class="g-mini">${s.profiles.map((x) => `<option value="${esc(x.id)}" ${x.id === G.game ? "selected" : ""}>${esc(x.이름)}</option>`).join("")}</select></div>
        <div class="g-subtabs">${["메인", "서브", "기타"].map((k) => `<button class="${G.qTab === k ? "on" : ""}" data-action="g-qtab" data-k="${k}">${k} <span class="faint">${개수(k)}</span></button>`).join("")}</div>
        ${퀘스트들.length ? `<div class="g-scroll"><table class="g-table">
          <thead><tr><th>퀘스트</th><th>상태</th><th>사진</th><th>체크리스트</th><th></th></tr></thead>
          <tbody>${퀘스트들.map((x) => { const [c, t] = 퀘스트배지[x.status] || ["", x.status]; const 준비 = x.ready && x.status !== "글완료";
            return `<tr><td><div class="g-q-name">${esc(x.name)}</div><div class="g-q-sub">${시각(x.first_seen_at)}${x.done_at ? ` ~ ${시분(x.done_at)}` : " ~"}${x.stuck_reason ? ` · ${esc(x.stuck_reason)}` : ""}</div></td>
              <td><span class="badge ${준비 ? "badge-active" : c}">${준비 ? "글 쓸 준비" : t}</span></td><td>${x.shots}장</td>
              <td>${미터(x.찬, x.전체, x.다참)}</td>
              <td class="acts"><button class="btn-secondary btn-small" data-action="g-album" data-id="${x.id}">앨범</button>
                ${x.status === "글완료" ? `<button class="btn-secondary btn-small" data-action="switch-view" data-view="drafts">글 보기 →</button>`
                  : x.status === "직접플레이대기" ? `<button class="btn-secondary btn-small" data-action="g-done" data-id="${x.id}">완료로 표시</button>`
                  : `<button class="btn-primary btn-small" data-action="g-album" data-id="${x.id}" data-post="1" ${x.status === "진행중" ? "disabled" : ""}>공략 글 만들기</button>`}</td></tr>`; }).join("")}</tbody></table></div>` : `<p class="muted">이 종류 퀘스트가 아직 없습니다.</p>`}
      </div>
      <div class="card">
        <div class="card-header"><h2>🙋 직접 플레이 대기</h2><span class="faint g-small">직접 끝낸 뒤 [완료로 표시] → 공략 글 대상이 됩니다. 빠진 장면은 F9 로 찍으세요.</span></div>
        ${대기.length ? `<div class="g-wait-list">${대기.map((x) => `<div class="g-wait-card">
          ${x.last_shot ? `<img src="${esc(이미지(x.last_shot))}" alt="마지막 사진" loading="lazy">` : `<div class="g-noimg">사진 없음</div>`}
          <div class="body"><div class="g-q-name">${esc(x.name)} <span class="badge">${esc(x.kind)}</span></div>
            <p class="why">⚠ ${esc(x.stuck_reason || "막힘")}</p>
            <div class="g-chips">${x.checklist.filter((c) => !c.다참).map((c) => `<span class="g-chip miss">빠짐: ${esc(c.이름)}</span>`).join("")}</div>
            <div class="g-row-end"><span class="faint g-small">${시각(x.first_seen_at)}</span><button class="btn-success btn-small" data-action="g-done" data-id="${x.id}">완료로 표시</button></div></div></div>`).join("")}</div>`
          : `<p class="muted">없습니다.</p>`}
      </div>`;
    if (!G.missions) api("/api/game/missions").then((m) => { G.missions = m; if (G.tab === "main") 메인그리기(); }).catch(() => {});
  }

  // ── ② 미션 ───────────────────────────────────────────
  async function 미션열기() {
    G.listGame = G.listGame || G.game;
    const [m, l] = await Promise.all([api("/api/game/missions"), G.status.needsGameBucket ? { items: [] } : api(`/api/game/list?game=${encodeURIComponent(G.listGame)}`)]);
    G.missions = m; G.list = l;
    미션그리기();
  }

  function 미션그리기() {
    const 칸 = 판("missions");
    if (G.status.needsGameBucket) { 칸.innerHTML = ""; return; }
    const l = G.list, 줄 = l.items;
    const 셈 = (k) => 줄.filter((r) => r.status === k).length;
    const 펼친 = G.evidence;
    const 줄글 = (r, i) => {
      const [c, t] = 목록배지[r.status] || ["", r.status];
      const 열림 = 펼친 && 펼친.id === r.id;
      return `<tr class="${r.status === "확인필요" ? "g-tr-todo" : ""}"><td><b>${i + 1}</b></td>
        <td><div class="g-q-name">${esc(r.name)}</div><div class="g-q-sub">${esc(r.kind)} · 게임 목록 ${r.order}번째${r.verified ? ` · <span class="g-ok">✔ 사람이 확인함</span>` : r.status === "확인필요" ? ` · 확신 ${r.confidence.toFixed(2)}` : ""}</div></td>
        <td><span class="badge ${c}">${t}</span></td><td class="${r.condition ? "" : "faint"}">${esc(r.condition || "—")}</td>
        <td><div class="g-evi">${r.evidence.slice(-2).map((u) => `<a href="${esc(이미지(u))}" target="_blank" rel="noopener"><img src="${esc(이미지(u))}" alt="근거" loading="lazy"></a>`).join("")}</div></td>
        <td class="acts"><button class="${r.status === "확인필요" ? "btn-primary" : "btn-secondary"} btn-small" data-action="g-evi-open" data-id="${r.id}">📷 캡처 추가</button></td></tr>
        ${열림 ? `<tr><td colspan="6" class="g-evi-td"><div class="g-evi-box">
          <div class="g-q-name">${i + 1}번 확인하기 — 캡처를 붙이면 AI 가 이 줄만 다시 읽습니다</div>
          <div class="g-btns"><button class="btn-secondary btn-small" data-action="g-evi-capture" data-id="${r.id}">🖥️ 집 PC 에서 지금 찍기</button>
            <label class="g-file btn-small">📁 사진 파일 올리기<input type="file" accept="image/*" data-g-evi-file="${r.id}" hidden></label>
            <button class="btn-secondary btn-small" data-action="g-evi-recent" data-id="${r.id}">🖼️ 최근 사진에서 고르기</button></div>
          ${펼친.최근 ? `<div class="g-recent">${펼친.최근.map((s) => `<button class="g-recent-item" data-action="g-evi-use" data-id="${r.id}" data-shot="${s.id}"><img src="${esc(이미지(s.url))}" alt=""><span>${esc(s.scene)}</span></button>`).join("") || "<p class='muted'>최근 사진이 없습니다.</p>"}</div>` : ""}
          ${펼친.읽는중 ? `<p class="muted">AI 가 읽는 중…</p>` : ""}
          <div class="g-evi-grid">
            <div>${펼친.사진 ? `<img class="g-evi-img" src="${esc(이미지(펼친.사진))}" alt="붙인 캡처">` : `<div class="g-noimg">붙인 캡처 없음</div>`}</div>
            <div class="g-form-grid">
              <div class="full"><label class="g-f">이름 (AI 가 읽은 값 — 고칠 수 있음)</label><input id="g-evi-name" value="${esc(펼친.값?.이름 ?? r.name)}"></div>
              <div><label class="g-f">종류</label><select id="g-evi-kind">${["메인", "서브", "일일", "기타"].map((k) => `<option ${(펼친.값?.종류 ?? r.kind) === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
              <div><label class="g-f">상태</label><select id="g-evi-status">${["진행가능", "진행중", "조건미달", "완료"].map((k) => `<option value="${k}" ${(펼친.값?.상태 ?? r.status) === k ? "selected" : ""}>${목록배지[k][1]}</option>`).join("")}</select></div>
              <div class="full"><label class="g-f">조건</label><input id="g-evi-cond" value="${esc(펼친.값?.조건 ?? r.condition ?? "")}" placeholder="예: 레벨 30 필요"></div>
              <div class="full g-btns"><button class="btn-success btn-small" data-action="g-evi-ok" data-id="${r.id}">✔ 확인</button><button class="btn-secondary btn-small" data-action="g-evi-close">닫기</button>
                <span class="faint g-small">확인한 값은 다음에 다시 읽어도 덮어쓰지 않습니다</span></div>
            </div></div></div></td></tr>` : ""}`;
    };
    const 보일줄 = 줄.filter((r) => r.status !== "완료" || G.완료펼침);
    const ms = G.missions;
    const 새 = G.새미션 || (G.새미션 = { game: G.game, title: "", targets: [{ 종류: "목록순서", 개수: 3 }], checklist: null });
    const 기본칸 = ms.defaults[새.targets.find((t) => t.종류 === "서브") && !새.targets.some((t) => ["메인", "목록순서"].includes(t.종류)) ? "서브" : "메인"];
    const 고른칸 = new Set((새.checklist || 기본칸.map((키) => ({ 키 }))).map((c) => c.키));
    칸.innerHTML = `
      <div class="card">
        <div class="card-header"><h2>🎯 게임 미션 목록 <span class="faint g-small g-normal">게임 속 목록 창에서 읽어 옴</span></h2>
          <div class="g-btns">
            <select id="g-list-game" class="g-mini">${G.status.profiles.map((x) => `<option value="${esc(x.id)}" ${x.id === G.listGame ? "selected" : ""}>${esc(x.이름)}</option>`).join("")}</select>
            <span class="faint g-small">${l.readAt ? `${시각(l.readAt)} 읽음` : "아직 안 읽음"}</span>
            <button class="btn-secondary btn-small" data-action="g-list-sync" ${G.status.agent.connected ? "" : "disabled"}>🔄 게임에서 다시 읽기</button>
          </div></div>
        <div class="g-chips"><span class="g-chip now">진행 중 ${셈("진행중")}</span><span class="g-chip done">진행 가능 ${셈("진행가능")}</span><span class="g-chip">조건 미달 ${셈("조건미달")}</span><span class="g-chip miss">확인 필요 ${셈("확인필요")}</span>
          <button class="g-chip g-chip-btn" data-action="g-list-done">완료 ${셈("완료")} ${G.완료펼침 ? "▾" : "▸"}</button></div>
        ${보일줄.length ? `<div class="g-scroll"><table class="g-table"><thead><tr><th>순서</th><th>미션</th><th>상태</th><th>조건</th><th>근거</th><th></th></tr></thead><tbody>${보일줄.map(줄글).join("")}</tbody></table></div>`
          : `<p class="muted">아직 목록이 없습니다. [🔄 게임에서 다시 읽기] 를 누르세요.${l.mode === "기록" ? " 기록 모드는 게임에서 목록 창을 열고 집 PC 에서 <b>F10</b> 을 누르면 읽습니다." : ""}</p>`}
        <div class="g-btns g-mt"><button class="btn-primary btn-small" data-action="g-list-mission" ${셈("진행가능") + 셈("진행중") ? "" : "disabled"}>이 순서로 미션 만들기 (진행 가능 위에서 3개)</button>
          <span class="faint g-small">기록 모드(애니모)는 게임에서 목록 창을 열고 <b>F10</b> 을 누르면 읽습니다.</span></div>
      </div>
      <div class="card">
        <div class="card-header"><h2>미션 목록</h2></div>
        ${ms.items.length ? `<div class="g-scroll"><table class="g-table"><thead><tr><th>미션</th><th>게임</th><th>목표</th><th>상태</th><th></th></tr></thead><tbody>
          ${ms.items.map((m) => `<tr><td><div class="g-q-name">${esc(m.title)}</div><div class="g-q-sub">${m.노릴퀘스트.length ? `노릴 퀘스트: ${m.노릴퀘스트.map(esc).join(", ")}` : m.targets.map((t) => t.퀘스트 ? `«${esc(t.퀘스트)}»` : `${t.종류 === "목록순서" ? "목록 순서대로" : esc(t.종류)} ${t.개수}개`).join(" + ")}</div></td>
            <td>${esc(프로필(m.game_id)?.이름 || m.game_id)}</td><td>${미터(m.완료수, m.목표수, m.다채움)}</td>
            <td><span class="badge ${m.status === "준비됨" ? "badge-active" : m.status === "대기" ? "badge-inactive" : m.status === "글완료" ? "badge-violet" : ""}">${esc(m.status)}</span></td>
            <td class="acts"><button class="btn-secondary btn-small" data-action="g-mission-run" data-id="${m.id}" data-game="${esc(m.game_id)}" ${G.status.agent.connected ? "" : "disabled"}>▶ 실행</button>
              <button class="btn-secondary btn-small" data-action="g-mission-del" data-id="${m.id}">지우기</button></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">아직 미션이 없습니다.</p>`}
      </div>
      <div class="card">
        <div class="card-header"><h2>＋ 새 미션</h2></div>
        <div class="g-form-grid">
          <div><label class="g-f">게임</label><select id="g-nm-game">${G.status.profiles.map((x) => `<option value="${esc(x.id)}" ${x.id === 새.game ? "selected" : ""}>${esc(x.이름)} · ${esc(x.모드)} 모드</option>`).join("")}</select></div>
          <div><label class="g-f">미션 이름</label><input id="g-nm-title" value="${esc(새.title)}" placeholder="예: 메인 3개 진행" maxlength="40"></div>
          <div class="full"><label class="g-f">목표 — 위에서부터 차례로 진행</label>
            ${새.targets.map((t, i) => `<div class="g-target-row">
              <select data-g-target="${i}" data-k="종류">${[["목록순서", "목록 순서대로"], ["메인", "종류로 · 메인"], ["서브", "종류로 · 서브"], ["일일", "종류로 · 일일"], ["기타", "종류로 · 기타"], ["이름", "이름으로"]].map(([v, n]) => `<option value="${v}" ${(t.퀘스트 !== undefined ? "이름" : t.종류) === v ? "selected" : ""}>${n}</option>`).join("")}</select>
              ${t.퀘스트 !== undefined ? `<input data-g-target="${i}" data-k="퀘스트" value="${esc(t.퀘스트)}" placeholder="퀘스트 이름 (예: 잃어버린 장부)"><span class="faint g-small">1개</span>`
                : `<span class="faint g-small">${t.종류 === "목록순서" ? "게임 미션 목록의 진행 가능 위에서부터" : `${esc(t.종류)} 퀘스트`}</span><input type="number" min="1" max="20" data-g-target="${i}" data-k="개수" value="${t.개수 || 1}">`}
              <button class="btn-secondary btn-small" data-action="g-target-del" data-i="${i}">×</button></div>`).join("")}
            <button class="btn-secondary btn-small" data-action="g-target-add">＋ 목표 추가</button></div>
          <div class="full"><label class="g-f">퀘스트마다 필요한 사진 — 기본 틀이 미리 체크됨</label>
            <div class="g-chips">${ms.choices.map((c) => `<label class="g-chip ${고른칸.has(c.키) ? "done" : ""}"><input type="checkbox" data-g-check="${c.키}" ${고른칸.has(c.키) ? "checked" : ""}> ${esc(c.이름)}${c.개수 > 1 ? ` ×${c.개수}` : ""}</label>`).join("")}</div></div>
          <div class="full g-mode-tip">끝나는 조건: 목표를 다 채우거나 · 하루 상한에 닿거나 · 막히면 그 퀘스트는 <b>직접 플레이 대기</b>로 넘기고 다음 목표로 갑니다.</div>
          <div class="full"><button class="btn-primary" data-action="g-mission-save">미션 저장</button></div>
        </div>
      </div>`;
  }

  function 새미션읽기() {
    const 새 = G.새미션;
    새.game = document.getElementById("g-nm-game")?.value || 새.game;
    새.title = document.getElementById("g-nm-title")?.value || "";
    document.querySelectorAll("[data-g-target]").forEach((el) => {
      const t = 새.targets[Number(el.dataset.gTarget)];
      if (!t) return;
      if (el.dataset.k === "종류") {
        if (el.value === "이름") { if (t.퀘스트 === undefined) { t.퀘스트 = ""; t.종류 = "이름"; } }
        else { t.종류 = el.value; delete t.퀘스트; }
      } else if (el.dataset.k === "개수") t.개수 = Number(el.value) || 1;
      else t.퀘스트 = el.value;
    });
    const 체크 = [...document.querySelectorAll("[data-g-check]")];
    if (체크.length) 새.checklist = 체크.filter((c) => c.checked).map((c) => ({ 키: c.dataset.gCheck }));
  }

  // ── ③ 앨범·공략 글 ───────────────────────────────────
  async function 앨범열기(id) {
    const 칸 = 판("album");
    if (!id) {
      칸.innerHTML = `<div class="card"><p class="muted">메인의 퀘스트 표에서 [앨범] 또는 [공략 글 만들기] 를 누르면 여기에 그 퀘스트 사진이 나옵니다.</p>
        ${G.quests.length ? `<div class="g-btns">${G.quests.slice(0, 12).map((q) => `<button class="btn-secondary btn-small" data-action="g-album" data-id="${q.id}">${esc(q.name)}</button>`).join("")}</div>` : ""}</div>`;
      return;
    }
    G.albumQuest = id;
    G.album = await api(`/api/game/quests/${id}/shots`);
    G.refs = G.album.quest.refs || [];
    앨범그리기();
  }

  function 앨범그리기() {
    const { quest: q, items } = G.album;
    const p = 프로필(q.game_id);
    const 쓴것 = items.filter((s) => !s.removed);
    const 참고 = G.refs;
    const 상태배지 = (a) => a.state === "읽음" ? `<span class="badge badge-active">읽음 · 메모 있음</span>` : a.state === "못읽음" ? `<span class="badge badge-todo">${esc(a.why || "못 읽음")}</span>` : `<span class="badge">아직 안 읽음</span>`;
    판("album").innerHTML = `
      <div class="page-header g-sub-header"><div><h2 class="g-h2">앨범 · ${esc(q.name)}</h2><p class="muted">${esc(p?.이름 || q.game_id)} · ${esc(q.kind)} · ${시각(q.first_seen_at)}${q.done_at ? ` ~ ${시분(q.done_at)}` : ""} · ${items.length}장 중 ${쓴것.length}장 사용</p></div>
        <div class="page-header-actions"><button class="btn-secondary" data-action="g-tab" data-tab="main">← 게임 플레이</button>
          <label class="g-file">📁 사진 올리기<input type="file" accept="image/*" data-g-upload="${q.id}" hidden></label></div></div>
      <div class="card">${체크칩(q.checklist)}<p class="faint g-small g-mt">이 순서대로 글에 들어갑니다. ↑↓ 로 순서를 바꾸고, 비슷한 사진은 빼세요.</p></div>
      <div class="g-album">${items.map((s, i) => `<div class="g-album-item ${s.removed ? "off" : ""}">
          <a href="${esc(이미지(s.url))}" target="_blank" rel="noopener" class="g-album-img"><img src="${esc(이미지(s.url))}" alt="" loading="lazy"><span class="tag">${장면글[s.scene] || ""} ${esc(s.scene)}${s.source === "f9" ? " · F9" : s.source === "upload" ? " · 올림" : ""}</span>${s.removed ? "" : `<span class="num">${쓴것.indexOf(s) + 1}</span>`}</a>
          <div class="meta">${esc(s.caption || "")}${s.source === "f9" ? ` <span class="badge badge-violet g-tiny">직접 찍음</span>` : ""}</div>
          <div class="acts">${s.removed ? `<button class="btn-secondary btn-small" data-action="g-shot-back" data-id="${s.id}">다시 넣기</button>`
            : `<button class="btn-secondary btn-small" data-action="g-shot-move" data-i="${i}" data-d="-1">↑</button><button class="btn-secondary btn-small" data-action="g-shot-move" data-i="${i}" data-d="1">↓</button><button class="btn-secondary btn-small g-ml" data-action="g-shot-out" data-id="${s.id}">빼기</button>`}</div></div>`).join("") || `<p class="muted">사진이 없습니다.</p>`}</div>
      <div class="card g-refs-card" id="g-refs">
        <div class="card-header"><h2>📚 참고 글 — ${esc(q.name)}</h2><span class="faint g-small">사실 확인·빠진 정보 보충용. 문장·사진은 베끼지 않습니다</span></div>
        ${참고.map((a, i) => `<div class="g-ref-row">
          <select data-g-ref="${i}" data-k="kind">${["인벤", "공식", "커뮤니티", "유튜브", "기타"].map((k) => `<option ${a.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select>
          <input data-g-ref="${i}" data-k="url" value="${esc(a.url)}" placeholder="https://www.inven.co.kr/…">${상태배지(a)}
          <button class="btn-secondary btn-small" data-action="g-ref-del" data-i="${i}">×</button></div>`).join("")}
        <div class="g-btns g-mt"><button class="btn-secondary btn-small" data-action="g-ref-add">＋ 주소 추가</button>
          <button class="btn-secondary btn-small" data-action="g-ref-search">🔎 찾아 넣기 (${esc(p?.이름 || "")} ${esc(q.name)} 공략)</button></div>
        ${G.후보.length ? `<div class="g-cands"><div class="g-q-name g-small">🔎 찾은 후보 — 체크한 것만 넣습니다</div>
          ${G.후보.map((c, i) => `<label class="g-cand"><input type="checkbox" data-g-cand="${i}" ${c.state === "못읽음" ? "" : "checked"}> <span><span class="badge ${c.kind === "인벤" ? "" : "badge-inactive"} g-tiny">${esc(c.kind)}</span> ${esc(c.title || c.url)}${c.why ? ` <span class="faint">(${esc(c.why)})</span>` : ""}</span></label>`).join("")}
          <button class="btn-secondary btn-small g-mt" data-action="g-cand-add">체크한 것 넣기</button></div>` : ""}
        <div class="g-btns g-mt g-wrap">
          <span class="g-flex1"></span>
          <button class="btn-secondary" data-action="g-post" data-refs="0" ${q.status === "진행중" ? "disabled" : ""}>참고 없이 만들기</button>
          <button class="btn-primary" data-action="g-post" data-refs="1" ${q.status === "진행중" || !참고.length ? "disabled" : ""}>참고해서 공략 글 만들기</button>
        </div>
        <p class="faint g-small g-mt">${q.status === "진행중" ? "⚠ 아직 진행 중인 퀘스트입니다. 끝나거나 [완료로 표시] 한 뒤 만들 수 있습니다. " : ""}수치는 내 사진·기록 → 공식 → 참고 글 순서로 믿습니다. 참고 글에만 있는 수치는 «커뮤니티 정보 기준» 이라고 밝힙니다. 로그인이 필요한 곳·유튜브 본문은 열지 않습니다.
          ${q.status === "글완료" ? "<br>✅ 이미 공략 글을 만든 퀘스트입니다 — 다시 만들면 새 초안이 하나 더 생깁니다." : ""}</p>
      </div>`;
  }

  function 참고읽기() {
    document.querySelectorAll("[data-g-ref]").forEach((el) => { const a = G.refs[Number(el.dataset.gRef)]; if (a) a[el.dataset.k] = el.value.trim(); });
  }
  async function 참고저장() {
    참고읽기();
    const q = await api(`/api/game/quests/${G.albumQuest}/refs`, { method: "PUT", body: JSON.stringify({ refs: G.refs.filter((a) => a.url) }) });
    G.refs = q.refs;
    G.album.quest = q;
  }

  // ── ④ 설정 ───────────────────────────────────────────
  async function 설정열기() {
    const [s, p] = await Promise.all([api("/api/game/settings"), api("/api/game/profiles")]);
    G.settings = s; G.profiles = p.items;
    G.profileGame = G.profileGame || G.game;
    설정그리기();
  }
  function 설정그리기() {
    const s = G.settings, p = G.profiles.find((x) => x.id === G.profileGame) || G.profiles[0];
    const 버튼들 = Object.entries(p.버튼 || {});
    const 실행 = p.실행 || {};
    판("settings").innerHTML = `
      <div class="card"><div class="card-header"><h2>공통 설정</h2></div>
        <div class="g-setting-row"><b>서버 사진 보관일</b><div><input type="number" id="gs-keep" min="1" max="365" value="${s.서버사진보관일}"> 일 <span class="faint g-small">— 이 캡처를 쓴 글을 <b>모두</b> 발행하고 이만큼 지나면 서버 사진을 지웁니다</span></div></div>
        <div class="g-setting-row"><b>안 쓴 사진 보관일</b><div><input type="number" id="gs-unused" min="1" max="365" value="${s.안쓴사진보관일}"> 일 <span class="faint g-small">— 어떤 글에도 안 쓴 사진</span></div></div>
        <div class="g-setting-row"><b>집 PC 원본 보관일</b><div><input type="number" id="gs-orig" min="1" max="365" value="${s.원본보관일}"> 일 <span class="faint g-small">— 집 PC 가 다음 신호 때 받아 갑니다</span></div></div>
        <div class="g-setting-row"><b>화면 보기 간격</b><div><input type="number" id="gs-int" min="1" max="10" step="0.5" value="${s.판단간격초}"> 초</div></div>
        <div class="g-setting-row"><b>공략 글 끝 «참고한 글»</b><div><label><input type="checkbox" id="gs-refs" ${s.참고글목록넣기 ? "checked" : ""}> 넣기</label></div></div>
        <div class="g-btns g-mt"><button class="btn-primary btn-small" data-action="g-settings-save">저장</button><span class="faint g-small">단축키(집 PC): F9 수동 캡처 · F10 목록 찍기 · F12 즉시 정지</span></div>
      </div>
      <div class="card"><div class="card-header"><h2>게임 프로필</h2>
          <select id="gp-game" class="g-mini">${G.profiles.map((x) => `<option value="${esc(x.id)}" ${x.id === p.id ? "selected" : ""}>${esc(x.이름)}</option>`).join("")}</select></div>
        <div class="g-setting-row"><b>모드</b><div><select id="gp-mode"><option value="감독" ${p.모드 === "감독" ? "selected" : ""}>감독 — 공식 자동 진행 + 화이트리스트 버튼</option><option value="기록" ${p.모드 === "기록" ? "selected" : ""}>기록 — 캡처만, 입력 0건</option></select>
          <p class="faint g-small">보안 프로그램이 입력을 막거나 게임 정책이 자동화를 금지하면 <b>기록</b>으로 둡니다. 우회하지 않습니다.</p></div></div>
        <div class="g-setting-row"><b>창 제목</b><div><input id="gp-title" value="${esc(p.창제목)}"> <span class="faint g-small">부분 일치</span></div></div>
        <div class="g-setting-row"><b>하루 상한</b><div><input type="number" id="gp-limit" min="10" max="720" value="${p.하루상한분}"> 분 · 막힘 판단 <input type="number" id="gp-stuck" min="1" max="60" value="${p.막힘판단분}"> 분</div></div>
        <div class="g-setting-row"><b>실행 파일</b><div><input id="gp-exe" class="g-wide" value="${esc(실행.파일 || "")}" placeholder="C:\\…\\Launcher.exe (집 PC 경로)">
          <div class="g-btns g-mt"><input id="gp-args" value="${esc(실행.인자 || "")}" placeholder="인자(없으면 비움)"><input id="gp-launcher" value="${esc(실행.런처창제목 || "")}" placeholder="런처 창 제목(없으면 비움)">
          <span class="faint g-small">창 대기</span><input type="number" id="gp-wait" min="30" max="600" value="${실행.창대기초 || 180}"> 초</div>
          ${p.모드 === "감독" ? `<div class="g-btns g-mt"><span class="faint g-small">런처 [게임 시작] 좌표 비율</span><input type="number" step="0.01" min="0" max="1" id="gp-lx" value="${실행.런처시작버튼?.x ?? ""}" placeholder="x"><input type="number" step="0.01" min="0" max="1" id="gp-ly" value="${실행.런처시작버튼?.y ?? ""}" placeholder="y"><span class="faint g-small">비우면 직접 누름</span></div>` : ""}
          <p class="faint g-small">로그인은 공식 런처의 자동 로그인에 맡깁니다. 아이디·비밀번호는 저장하지도 입력하지도 않습니다.</p></div></div>
        ${p.모드 === "감독" ? `<div class="g-setting-row"><b>버튼 (화이트리스트)</b><div>
          <table class="g-table g-btn-table"><thead><tr><th>이름</th><th>키</th><th>x</th><th>y</th><th></th></tr></thead><tbody>
          ${버튼들.map(([n, b], i) => `<tr><td><input data-gp-btn="${i}" data-k="이름" value="${esc(n)}"></td><td><input data-gp-btn="${i}" data-k="키" value="${esc(b.키 || "")}" placeholder="예: J"></td>
            <td><input type="number" step="0.01" data-gp-btn="${i}" data-k="x" value="${b.x ?? ""}"></td><td><input type="number" step="0.01" data-gp-btn="${i}" data-k="y" value="${b.y ?? ""}"></td>
            <td><button class="btn-secondary btn-small" data-action="gp-btn-del" data-i="${i}">×</button></td></tr>`).join("")}</tbody></table>
          <button class="btn-secondary btn-small" data-action="gp-btn-add">＋ 버튼</button>
          <p class="faint g-small">키 또는 창 안쪽 비율 좌표(0~1). 상점·결제·거래·채팅·우편·PvP 같은 이름은 저장해도 버려집니다. 좌표는 집 PC 0단계 시험(<code>시험0.py --coords</code>)으로 잽니다.</p></div></div>` : ""}
        <div class="g-setting-row"><b>금지 화면</b><div><input id="gp-ban" class="g-wide" value="${esc((p.금지화면 || []).join(", "))}"><p class="faint g-small">이 말이 화면에 보이면 즉시 정지</p></div></div>
        <div class="g-setting-row"><b>기본 참고 주소</b><div><textarea id="gp-refs" rows="2" class="g-wide" placeholder="https://www.inven.co.kr/board/… (줄마다 하나)">${esc((p.기본참고주소 || []).join("\n"))}</textarea><p class="faint g-small">[🔎 찾아 넣기] 때 이 게시판을 먼저 봅니다</p></div></div>
        <div class="g-setting-row"><b>영역 (비율)</b><div><textarea id="gp-areas" rows="4" class="g-wide g-mono">${esc(JSON.stringify(p.영역 || {}, null, 1))}</textarea><p class="faint g-small">퀘스트표시·미니맵·지역명·목록 — 변화 감지와 목록 읽기에 씁니다</p></div></div>
        <div class="g-btns g-mt"><button class="btn-primary btn-small" data-action="gp-save">프로필 저장</button><span class="faint g-small">집 PC 는 다음 [게임 실행] 때 새 프로필을 받아 갑니다.</span></div>
      </div>`;
  }
  function 프로필폼읽기() {
    const p = G.profiles.find((x) => x.id === G.profileGame) || G.profiles[0];
    const v = (id) => document.getElementById(id)?.value ?? "";
    const 버튼 = {};
    const 줄들 = {};
    document.querySelectorAll("[data-gp-btn]").forEach((el) => { (줄들[el.dataset.gpBtn] ||= {})[el.dataset.k] = el.value.trim(); });
    Object.values(줄들).forEach((r) => {
      if (!r.이름) return;
      if (r.키) 버튼[r.이름] = { 키: r.키 };
      else if (r.x !== "" && r.y !== "") 버튼[r.이름] = { x: Number(r.x), y: Number(r.y) };
    });
    let 영역 = p.영역;
    try { 영역 = JSON.parse(v("gp-areas")); } catch { throw new Error("영역 칸의 JSON 모양이 맞지 않습니다."); }
    return {
      모드: v("gp-mode"), 창제목: v("gp-title"), 하루상한분: Number(v("gp-limit")), 막힘판단분: Number(v("gp-stuck")),
      실행: { 파일: v("gp-exe"), 인자: v("gp-args"), 런처창제목: v("gp-launcher"), 창대기초: Number(v("gp-wait")) || 180,
        런처시작버튼: v("gp-lx") !== "" && v("gp-ly") !== "" ? { x: Number(v("gp-lx")), y: Number(v("gp-ly")) } : {} },
      버튼: document.getElementById("gp-mode").value === "감독" && document.querySelector("[data-gp-btn]") ? 버튼 : (p.모드 === "감독" ? 버튼 : p.버튼),
      금지화면: v("gp-ban").split(/[,，]/).map((x) => x.trim()).filter(Boolean),
      기본참고주소: v("gp-refs").split(/\s+/).filter(Boolean),
      영역,
    };
  }

  // ── 📝 포스팅 카드: 내 게임 캡처에서 고르기 (15-8) ─────
  async function 고르기열기(postId, game) {
    G.pick = { postId, game, page: 1, sel: [], 거름: { quest: "", scene: "", q: "", unused: false }, mode: "append", data: null, quests: [] };
    try { G.pick.quests = (await api(`/api/game/quests?game=${encodeURIComponent(game)}`)).items; } catch { /* 없어도 된다 */ }
    document.getElementById("g-pick").hidden = false;
    await 고르기읽기();
  }
  async function 고르기읽기() {
    const p = G.pick, f = p.거름;
    const q = new URLSearchParams({ game: p.game, page: String(p.page), ...(f.quest ? { quest: f.quest } : {}), ...(f.scene ? { scene: f.scene } : {}), ...(f.q ? { q: f.q } : {}), ...(f.unused ? { unused: "1" } : {}) });
    p.data = await api(`/api/game/shots?${q}`);
    고르기그리기();
  }
  function 고르기그리기() {
    const p = G.pick, d = p.data, f = p.거름;
    const 첫 = d.total ? (d.page - 1) * 8 + 1 : 0, 끝 = Math.min(d.total, d.page * 8);
    document.querySelector("#g-pick .g-pick-box").innerHTML = `
      <div class="card-header"><h3>🕹️ 내 게임 캡처에서 고르기</h3><button class="btn-secondary btn-small" data-action="g-pick-close">닫기</button></div>
      <div class="g-pick-filters">
        <select data-g-f="quest"><option value="">퀘스트 전체</option>${p.quests.map((q) => `<option value="${q.id}" ${String(q.id) === f.quest ? "selected" : ""}>${esc(q.name)}</option>`).join("")}</select>
        <select data-g-f="scene"><option value="">장면 전체</option>${Object.keys(장면글).filter((k) => !["로그인", "로딩", "목록"].includes(k)).map((k) => `<option ${k === f.scene ? "selected" : ""}>${k}</option>`).join("")}</select>
        <input data-g-f="q" value="${esc(f.q)}" placeholder="설명 글자 검색">
        <label class="g-small"><input type="checkbox" data-g-f="unused" ${f.unused ? "checked" : ""}> 아직 글에 안 쓴 것만</label>
      </div>
      <div class="g-pick-grid">${d.items.map((s) => { const i = p.sel.findIndex((x) => x.id === s.id); return `<button class="g-pick ${i >= 0 ? "on" : ""}" data-action="g-pick-toggle" data-id="${s.id}">
        <img src="${esc(이미지(s.url))}" alt="" loading="lazy"><span class="ck">${i >= 0 ? i + 1 : ""}</span>${s.used ? `<span class="used">글에 씀</span>` : ""}<span class="cap">${장면글[s.scene] || ""} ${esc(s.caption || s.scene)}</span></button>`; }).join("") || `<p class="muted">맞는 캡처가 없습니다.</p>`}</div>
      <div class="g-pager"><button class="btn-secondary btn-small" data-action="g-pick-page" data-d="-1" ${d.page <= 1 ? "disabled" : ""}>‹ 이전 8건</button>
        <span>${첫}–${끝} / ${d.total}</span><button class="btn-secondary btn-small" data-action="g-pick-page" data-d="1" ${d.page >= d.pages ? "disabled" : ""}>다음 8건 ›</button></div>
      <div class="g-pick-sel"><b>선택 ${p.sel.length}장</b>${p.sel.length ? " — 다른 쪽 포함 · 이 순서로 넣습니다" : ""} (최대 10장)
        <div class="g-sel-list">${p.sel.map((s, i) => `<span class="g-sel-item"><img src="${esc(이미지(s.url))}" alt="">${i + 1}<button class="btn-secondary btn-small" data-action="g-sel-move" data-i="${i}" data-d="-1">↑</button><button class="btn-secondary btn-small" data-action="g-sel-move" data-i="${i}" data-d="1">↓</button></span>`).join("")}</div></div>
      <div class="g-btns g-mt">
        <label class="g-small"><input type="radio" name="g-pick-mode" value="append" ${p.mode === "append" ? "checked" : ""}> 빈 자리부터 채우기·뒤에 더하기</label>
        <label class="g-small"><input type="radio" name="g-pick-mode" value="replace" ${p.mode === "replace" ? "checked" : ""}> 지금 사진 바꾸기</label>
        <span class="g-flex1"></span><button class="btn-primary" data-action="g-pick-apply" ${p.sel.length ? "" : "disabled"}>이 글에 넣기</button></div>`;
  }

  // ── 클릭 ─────────────────────────────────────────────
  async function 누름(btn) {
    const a = btn.dataset.action, id = btn.dataset.id;
    if (a === "g-tab") return 탭(btn.dataset.tab);
    if (a === "g-qtab") { G.qTab = btn.dataset.k; return 메인그리기(); }
    if (a === "g-start") {
      const game = document.getElementById("g-game").value, mission = document.getElementById("g-mission").value;
      const p = 프로필(game);
      if (!confirm(`${p.이름}을(를) ${p.모드} 모드로 시작할까요?\n집 PC 가 5초 안에 게임을 켭니다.${p.모드 === "기록" ? "\n(플레이는 직접 하세요. 프로그램은 캡처만 합니다)" : ""}`)) return;
      await api("/api/game/start", { method: "POST", body: JSON.stringify({ game, mission_id: mission ? Number(mission) : null }) });
      return 새로고침(false);
    }
    if (a === "g-stop") { await api("/api/game/stop", { method: "POST" }); return 새로고침(false); }
    if (a === "g-capture") { await api("/api/game/capture", { method: "POST", body: "{}" }); btn.textContent = "📸 요청함"; return; }
    if (a === "g-done") {
      if (!confirm("직접 끝내셨나요? 완료로 표시하면 공략 글 대상이 됩니다.")) return;
      await api(`/api/game/quests/${id}/done`, { method: "POST" });
      return 새로고침(true);
    }
    if (a === "g-album") {
      G.albumQuest = Number(id); G.후보 = [];
      탭("album");
      if (btn.dataset.post) setTimeout(() => document.getElementById("g-refs")?.scrollIntoView({ behavior: "smooth" }), 400);
      return;
    }
    // 미션 목록
    if (a === "g-list-sync") {
      const r = await api("/api/game/list/sync", { method: "POST", body: JSON.stringify({ game: G.listGame }) });
      alert(r.note);
      return;
    }
    if (a === "g-list-done") { G.완료펼침 = !G.완료펼침; return 미션그리기(); }
    if (a === "g-list-mission") {
      const p = 프로필(G.listGame);
      await api("/api/game/missions", { method: "POST", body: JSON.stringify({ game_id: G.listGame, title: `${p.이름} 목록 순서 3개`, targets: [{ 종류: "목록순서", 개수: 3 }] }) });
      return 미션열기();
    }
    if (a === "g-evi-open") { G.evidence = G.evidence?.id === Number(id) ? null : { id: Number(id) }; return 미션그리기(); }
    if (a === "g-evi-close") { G.evidence = null; return 미션그리기(); }
    if (a === "g-evi-capture") {
      const r = await api(`/api/game/list/${id}/evidence`, { method: "POST", body: JSON.stringify({ capture: true }) });
      alert(`${r.note}\n찍힌 뒤 [🖼️ 최근 사진에서 고르기] 에서 고르세요.`);
      return;
    }
    if (a === "g-evi-recent") {
      const r = await api(`/api/game/shots?game=${encodeURIComponent(G.listGame)}&page=1`);
      const 목록근거 = G.list.items.find((x) => x.id === Number(id))?.evidence || [];
      G.evidence.최근 = r.items;
      G.evidence.근거 = 목록근거;
      return 미션그리기();
    }
    if (a === "g-evi-use") return 근거붙이기(Number(id), { shot_id: Number(btn.dataset.shot) });
    if (a === "g-evi-ok") {
      await api(`/api/game/list/${id}`, { method: "PUT", body: JSON.stringify({
        name: document.getElementById("g-evi-name").value, kind: document.getElementById("g-evi-kind").value,
        status: document.getElementById("g-evi-status").value, condition: document.getElementById("g-evi-cond").value, verified: true }) });
      G.evidence = null;
      return 미션열기();
    }
    if (a === "g-target-add") { 새미션읽기(); G.새미션.targets.push({ 종류: "메인", 개수: 1 }); return 미션그리기(); }
    if (a === "g-target-del") { 새미션읽기(); G.새미션.targets.splice(Number(btn.dataset.i), 1); return 미션그리기(); }
    if (a === "g-mission-save") {
      새미션읽기();
      const 새 = G.새미션;
      await api("/api/game/missions", { method: "POST", body: JSON.stringify({ game_id: 새.game, title: 새.title, targets: 새.targets, checklist: 새.checklist }) });
      G.새미션 = null;
      return 미션열기();
    }
    if (a === "g-mission-del") { if (!confirm("이 미션을 지울까요? (찍은 사진·퀘스트는 남습니다)")) return; await api(`/api/game/missions/${id}`, { method: "DELETE" }); return 미션열기(); }
    if (a === "g-mission-run") {
      if (!confirm("이 미션으로 게임을 시작할까요?")) return;
      await api("/api/game/start", { method: "POST", body: JSON.stringify({ game: btn.dataset.game, mission_id: Number(id) }) });
      return 탭("main");
    }
    // 앨범
    if (a === "g-shot-out") { await api(`/api/game/shots/${id}`, { method: "DELETE" }); return 앨범열기(G.albumQuest); }
    if (a === "g-shot-back") { await api(`/api/game/shots/${id}`, { method: "PUT", body: JSON.stringify({ removed: false }) }); return 앨범열기(G.albumQuest); }
    if (a === "g-shot-move") {
      const 쓴것 = G.album.items.filter((s) => !s.removed);
      const 지금 = G.album.items[Number(btn.dataset.i)];
      const i = 쓴것.indexOf(지금), j = i + Number(btn.dataset.d);
      if (j < 0 || j >= 쓴것.length) return;
      [쓴것[i], 쓴것[j]] = [쓴것[j], 쓴것[i]];
      const ids = [...쓴것, ...G.album.items.filter((s) => s.removed)].map((s) => s.id);
      await api(`/api/game/quests/${G.albumQuest}/order`, { method: "PUT", body: JSON.stringify({ ids }) });
      return 앨범열기(G.albumQuest);
    }
    if (a === "g-ref-add") { 참고읽기(); G.refs.push({ kind: "인벤", url: "", state: "안읽음" }); return 앨범그리기(); }
    if (a === "g-ref-del") { 참고읽기(); G.refs.splice(Number(btn.dataset.i), 1); await 참고저장(); return 앨범그리기(); }
    if (a === "g-ref-search") {
      btn.disabled = true; btn.textContent = "찾는 중… (1분 안팎)";
      try { G.후보 = (await api(`/api/game/quests/${G.albumQuest}/refs/search`, { method: "POST" })).items; } finally { 앨범그리기(); }
      return;
    }
    if (a === "g-cand-add") {
      참고읽기();
      document.querySelectorAll("[data-g-cand]").forEach((c) => { if (c.checked) { const x = G.후보[Number(c.dataset.gCand)]; if (!G.refs.some((r) => r.url === x.url)) G.refs.push(x); } });
      G.후보 = [];
      await 참고저장();
      return 앨범그리기();
    }
    if (a === "g-post") {
      const refs = btn.dataset.refs === "1";
      if (refs) await 참고저장();
      if (!confirm(`«${G.album.quest.name}» 공략 글을 만들까요? (1~5분, AI 한도를 씁니다)`)) return;
      btn.disabled = true; btn.textContent = "만드는 중… (1~5분)";
      try {
        const post = await api(`/api/game/quests/${G.albumQuest}/post`, { method: "POST", body: JSON.stringify({ refs }) });
        alert(`✅ 공략 글 초안이 준비됐습니다 — «${post.title}»\n[📝 포스팅] 에서 다듬고 사진을 내려받아 직접 발행하세요.`);
        if (typeof refreshAll === "function") await refreshAll();
        await switchView("drafts");
      } catch (탈) { btn.disabled = false; btn.textContent = refs ? "참고해서 공략 글 만들기" : "참고 없이 만들기"; throw 탈; }
      return;
    }
    // 설정
    if (a === "g-settings-save") {
      G.settings = await api("/api/game/settings", { method: "PUT", body: JSON.stringify({
        서버사진보관일: Number(document.getElementById("gs-keep").value), 안쓴사진보관일: Number(document.getElementById("gs-unused").value),
        원본보관일: Number(document.getElementById("gs-orig").value), 판단간격초: Number(document.getElementById("gs-int").value),
        참고글목록넣기: document.getElementById("gs-refs").checked }) });
      btn.textContent = "저장됨 ✔"; setTimeout(() => { btn.textContent = "저장"; }, 1500);
      return;
    }
    if (a === "gp-btn-add") { const p = G.profiles.find((x) => x.id === G.profileGame); Object.assign(p, 프로필폼읽기()); p.버튼[`새버튼${Object.keys(p.버튼).length + 1}`] = { 키: "" }; return 설정그리기(); }
    if (a === "gp-btn-del") { const p = G.profiles.find((x) => x.id === G.profileGame); Object.assign(p, 프로필폼읽기()); delete p.버튼[Object.keys(p.버튼)[Number(btn.dataset.i)]]; return 설정그리기(); }
    if (a === "gp-save") {
      const 값 = 프로필폼읽기();
      const 새것 = await api(`/api/game/profiles/${G.profileGame}`, { method: "PUT", body: JSON.stringify(값) });
      G.profiles = G.profiles.map((x) => (x.id === 새것.id ? 새것 : x));
      await 상태읽기();
      설정그리기();
      return alert("프로필을 저장했습니다.");
    }
    // 📝 포스팅 카드
    if (a === "g-shots-pick") return 고르기열기(Number(id), btn.dataset.game);
    if (a === "g-shots-auto") {
      btn.disabled = true; btn.textContent = "고르는 중…";
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

  async function 근거붙이기(id, 몸) {
    G.evidence = { ...G.evidence, id, 읽는중: true };
    미션그리기();
    try {
      const r = await api(`/api/game/list/${id}/evidence`, { method: "POST", body: JSON.stringify(몸) });
      G.evidence = { id, 사진: r.shot?.url, 값: r.proposal, 최근: null };
    } catch (탈) { G.evidence.읽는중 = false; alert(탈.message); }
    미션그리기();
  }

  const 파일읽기 = (f) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(f); });

  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !(btn.dataset.action.startsWith("g-") || btn.dataset.action.startsWith("gp-"))) return;
    e.preventDefault();
    try { await 누름(btn); } catch (탈) { alert(탈.message); }
  });

  document.addEventListener("change", async (e) => {
    const t = e.target;
    try {
      if (t.id === "g-game" || t.id === "g-game2") { G.game = t.value; await 퀘스트읽기(); 메인그리기(); }
      else if (t.id === "g-list-game") { G.listGame = t.value; await 미션열기(); }
      else if (t.id === "gp-game") { G.profileGame = t.value; 설정그리기(); }
      else if (t.id === "gp-mode") { const p = G.profiles.find((x) => x.id === G.profileGame); Object.assign(p, 프로필폼읽기(), { 모드: t.value }); 설정그리기(); }
      else if (t.id === "g-nm-game" || t.dataset.gTarget !== undefined || t.dataset.gCheck !== undefined) {
        새미션읽기();
        if (t.dataset.gTarget !== undefined && t.dataset.k === "종류") { G.새미션.checklist = null; }
        if (t.dataset.gTarget !== undefined || t.id === "g-nm-game") 미션그리기();
        else t.closest("label")?.classList.toggle("done", t.checked);
      } else if (t.dataset.gF !== undefined && G.pick) {
        G.pick.거름[t.dataset.gF] = t.type === "checkbox" ? t.checked : t.value;
        G.pick.page = 1;
        await 고르기읽기();
      } else if (t.dataset.gEviFile) {
        const 그림 = await 파일읽기(t.files[0]);
        await 근거붙이기(Number(t.dataset.gEviFile), { image: 그림 });
      } else if (t.dataset.gUpload) {
        const 그림 = await 파일읽기(t.files[0]);
        const 장면 = prompt("어떤 장면인가요? (퀘스트받음·지도·이동중·도착·대화·전투·보스처치·보상 중 하나)", "기타") || "기타";
        await api("/api/game/upload", { method: "POST", body: JSON.stringify({ game: G.album.quest.game_id, quest_id: G.albumQuest, image: 그림, scene: 장면.trim(), caption: "직접 올린 사진" }) });
        await 앨범열기(G.albumQuest);
      }
    } catch (탈) { alert(탈.message); }
  });

  // 관리자 접속인지 서버에 묻는다 — 판매용·체험 키는 404 라 메뉴·칸이 끝까지 안 보인다.
  // 같은 답으로 카테고리 폼 ⑧ 연결 게임 목록도 채운다.
  async function 연결게임칸() {
    const 칸 = document.getElementById("cf-game");
    try {
      const r = await fetch("/api/game/profiles", { headers: getDashboardToken() ? { "x-dashboard-token": getDashboardToken() } : {} });
      if (!r.ok) { document.body.classList.remove("game-admin"); return; }
      const { items } = await r.json();
      document.body.classList.add("game-admin");
      if (!칸) return;
      const 지금 = 칸.value;
      칸.innerHTML = `<option value="">없음 — 무료 이미지 사용</option>${items.map((p) => `<option value="${esc(p.id)}">${esc(p.이름)}</option>`).join("")}`;
      칸.value = 지금;
    } catch { /* 체험 자리 — 칸이 감춰져 있다 */ }
  }
  setTimeout(연결게임칸, 1500);
  setInterval(연결게임칸, 60_000);   // 다른 키로 다시 들어왔을 때도 맞게

  window.게임탭 = { 열기, 고르기열기 };
})();
