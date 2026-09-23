/**
 * **어느 AI 로 글을 쓸 것인가.**
 *
 * 한동안 Claude 하나였다. 파는 입장에서 이게 제일 큰 걸림돌이다 —
 * «Claude Pro 를 구독하셔야 합니다» 에서 사시려던 분이 멈춘다. 이미 쓰는
 * AI 가 있는데 하나 더 들라는 말이기 때문이다.
 *
 * 다행히 세 회사가 **같은 모양의 명령 도구**를 낸다. 프롬프트를 주면
 * JSON 으로 답을 돌려주는 꼴이 같아서, 자리만 갈아 끼우면 된다.
 *
 * ---
 *
 * **인증이 회사마다 다르다. 이게 이 파일의 두 번째 일이다.**
 *
 * 우리 서버(Cloud Run)에는 **사람이 없다.** 브라우저를 띄워 «승인» 을
 * 누를 사람이 없다는 뜻이다. 그래서 회사마다 길이 갈린다.
 *
 *   claude  로그인 폴더(.claude)를 통째로 올려 두면 서버가 그걸 읽고 돈다.
 *   codex   같은 방식(.codex).
 *   gemini  **이 방식이 안 된다.** 로그인 폴더를 올려도 서버에서 다시
 *           «브라우저로 승인하세요» 를 요구하다가 멈춘다. 구글 공식
 *           문서가 그렇게 못박아 두었다 — 사람 없는 자리에서는
 *           `GEMINI_API_KEY` 를 넣으라고 한다.
 *
 * 그래서 Gemini 는 **키 한 줄을 받아 넣는 길**만 연다. 검은 창도,
 * 파일 올리기도 필요 없어서 사실 사시는 분께는 이쪽이 훨씬 쉽다.
 *
 * 왜 API 를 직접 안 쓰나
 *   이 도구들은 **웹 검색을 안에 갖고 있다** — 뉴스형 카테고리에 그게
 *   필요하다. 순수 API 로 가면 검색 엔진을 따로 붙여야 한다. 그리고
 *   Claude·Codex 는 이미 내고 계신 구독 한도 안에서 돌아 건당 요금이
 *   따로 안 나간다.
 */

export type EngineId = "claude" | "gemini" | "codex";

export interface RunAsk {
  prompt: string;
  /** 웹 검색이 필요한가. 뉴스형 카테고리에서만 참이다. */
  needsSearch?: boolean;
  /** 이 폴더의 파일을 읽어야 한다 (이미지 고르기). */
  readDir?: string;
  /**
   * 답을 파일로 받는 엔진(`wantsOutFile`)에 한해 **runAI 가 채워 준다.**
   * 부르는 쪽에서 넣을 것이 아니다.
   */
  outFile?: string;
}

/** 사람이 없는 서버에서 이 엔진을 어떻게 인증시키나. */
export interface EngineAuth {
  /**
   * 로그인 폴더를 저장통에 올려 두면 서버가 그걸로 돌 수 있나.
   *
   * **Gemini 는 거짓이다.** 올려도 서버에서 다시 브라우저 승인을
   * 요구하며 멈춘다(`FatalAuthenticationError … non-interactive`).
   */
  loginWorksOnServer: boolean;
  /** API 키를 실어 보낼 환경변수 이름. */
  envVar: string;
  /** 그 키를 대시보드에 저장해 둘 때 쓰는 이름. */
  settingKey: string;
  /** 키를 받는 곳. */
  keyUrl: string;
  /** 키 받는 길을 한 줄로. 화면에 그대로 보인다. */
  keyHow: string;
}

export interface Engine {
  id: EngineId;
  label: string;
  /** 요금이 어떻게 되는지 한 줄. 화면에 그대로 보인다. */
  cost: string;
  /** 기본 실행 파일 이름. */
  bin: string;
  /** 설치 명령. */
  install: string;
  /** 로그인 명령. */
  login: string;
  /** 로그인이 남는 폴더. 이 폴더가 통째로 저장통에 올라간다. */
  home: string;
  auth: EngineAuth;
  /**
   * 답을 **표준출력이 아니라 파일**로 받는가.
   *
   * Codex 가 그렇다. 표준출력은 줄마다 JSON 인 사건 흐름이라 봉투 모양이
   * 판마다 바뀌는데, `--output-last-message` 는 «마지막 답을 이 파일에
   * 써라» 라는 약속이 분명하다. 모양을 짐작하는 것보다 낫다.
   */
  wantsOutFile?: boolean;
  /** 명령줄 인자를 짠다. */
  args(ask: RunAsk): string[];
  /**
   * 돌려받은 것에서 **답 글자**를 꺼낸다. 못 꺼내면 던진다.
   * `파일글` 은 `wantsOutFile` 인 엔진에만 들어온다.
   */
  answer(stdout: string, 파일글?: string): string;
}

/** 답이 비면 그건 성공이 아니다. 빈 글로 포스팅이 만들어지면 더 나쁘다. */
function 비면던진다(글: string, 엔진: string): string {
  const 답 = (글 ?? "").trim();
  if (!답) throw new Error(`${엔진} 이 빈 답을 돌려주었습니다.`);
  return 답;
}

function 제이슨(stdout: string, 엔진: string): Record<string, unknown> {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    // 로그인이 안 됐거나 설치가 덜 된 경우, JSON 대신 안내문이 그대로
    // 나온다. 그걸 «JSON 이 아닙니다» 로만 말하면 무엇이 문제인지 모른다.
    throw new Error(`${엔진} 이 JSON 이 아닌 답을 돌려주었습니다. `
                  + `로그인이 안 돼 있을 수 있습니다.\n${stdout.slice(0, 600)}`);
  }
}

export const ENGINES: Record<EngineId, Engine> = {
  claude: {
    id: "claude",
    label: "Claude (Anthropic)",
    cost: "Claude Pro 또는 Max 구독이 필요합니다. 구독 한도 안에서 돌아 건당 요금은 없습니다.",
    bin: "claude",
    install: "npm install -g @anthropic-ai/claude-code",
    login: "claude login",
    home: ".claude",
    auth: {
      loginWorksOnServer: true,
      envVar: "ANTHROPIC_API_KEY",
      settingKey: "anthropic_api_key",
      keyUrl: "https://console.anthropic.com/settings/keys",
      keyHow: "구독 대신 API 키로도 돌릴 수 있지만, 그때는 **글 한 편마다 요금이 나갑니다.** "
            + "Pro 를 이미 쓰고 계시면 위의 로그인 방식이 낫습니다.",
    },
    args(ask) {
      const a = ["-p", ask.prompt, "--output-format", "json",
                 "--permission-mode", "acceptEdits"];
      if (ask.readDir) { a.push("--allowedTools", "Read", "--add-dir", ask.readDir); }
      else if (ask.needsSearch) { a.push("--allowedTools", "WebSearch"); }
      else { a.push("--tools", ""); }
      return a;
    },
    answer(stdout) {
      const 봉투 = 제이슨(stdout, "Claude");
      if (봉투.is_error) throw new Error(String(봉투.result ?? "알 수 없는 오류"));
      return 비면던진다(String(봉투.result ?? ""), "Claude");
    },
  },

  gemini: {
    id: "gemini",
    label: "Gemini (Google)",
    cost: "구글 AI 스튜디오에서 **API 키 한 줄**을 받아 넣으시면 됩니다. "
        + "무료 등급이 있어 카드 등록 없이 시작하실 수 있습니다. "
        + "하루 몇 건까지 무료인지는 구글이 수시로 바꾸니 아래 링크에서 확인하세요.",
    bin: "gemini",
    install: "npm install -g @google/gemini-cli",
    login: "gemini",
    home: ".gemini",
    auth: {
      // 구글 공식 문서: 사람 없는 자리에서는 캐시된 로그인이 없는 한
      // `GEMINI_API_KEY` 를 요구한다. 로그인 폴더를 올려 봐도 서버에서
      // 다시 브라우저 승인을 요구하며 41 로 죽는다. 실제로 겪었다.
      loginWorksOnServer: false,
      envVar: "GEMINI_API_KEY",
      settingKey: "gemini_api_key",
      keyUrl: "https://aistudio.google.com/apikey",
      keyHow: "구글 계정으로 들어가 [Create API key] 를 누르면 키가 바로 나옵니다. "
            + "그 한 줄을 복사해 아래 칸에 붙여넣고 저장하세요. "
            + "검은 창(Cloud Shell)도, 파일 올리기도 필요 없습니다.",
    },
    args(ask) {
      // `--approval-mode yolo` 로 도구를 자동 승인한다. 사람이 없는 자리라
      // 물어보면 거기서 멈춘다. (`--yolo` 와 같은 뜻인데 이쪽이 새 이름이다.)
      const a = ["-p", ask.prompt, "--output-format", "json"];
      if (ask.readDir || ask.needsSearch) a.push("--approval-mode", "yolo");
      return a;
    },
    answer(stdout) {
      const 봉투 = 제이슨(stdout, "Gemini");
      if (봉투.error) throw new Error(String(봉투.error));
      return 비면던진다(String(봉투.response ?? ""), "Gemini");
    },
  },

  codex: {
    id: "codex",
    label: "Codex (OpenAI)",
    cost: "ChatGPT Plus 이상 구독이 필요합니다. 구독 한도 안에서 돌아 건당 요금은 없습니다.",
    bin: "codex",
    install: "npm install -g @openai/codex",
    login: "codex login",
    home: ".codex",
    auth: {
      loginWorksOnServer: true,
      envVar: "OPENAI_API_KEY",
      settingKey: "openai_api_key",
      keyUrl: "https://platform.openai.com/api-keys",
      keyHow: "구독 대신 API 키로도 돌릴 수 있지만, 그때는 **글 한 편마다 요금이 나갑니다.** "
            + "ChatGPT Plus 를 이미 쓰고 계시면 위의 로그인 방식이 낫습니다.",
    },
    wantsOutFile: true,
    args(ask) {
      const a = ["exec", ask.prompt, "--json"];
      // 우리 서버의 일터는 깃 저장소가 아니다. 이게 없으면 Codex 는
      // «Not inside a trusted directory» 한 줄만 남기고 **언제나** 멈춘다.
      // 그런데 그 줄은 JSON 이 아니라서, 없으면 「로그인이 안 됐나 봅니다」
      // 라는 엉뚱한 안내가 나갔다.
      a.push("--skip-git-repo-check");
      // 답은 파일로 받는다. 아래 answer() 설명을 보라.
      if (ask.outFile) a.push("--output-last-message", ask.outFile);
      return a;
    },
    answer(stdout, 파일글) {
      const 답 = (파일글 ?? "").trim();
      if (답) return 답;

      // 파일이 비면 사건 흐름에서 찾아본다. 봉투가 판마다 달라서
      // 겉만 보지 않고 **속까지 뒤진다** — agent_message 의 글을 쓴다.
      const 찾기 = (것: unknown): string => {
        if (typeof 것 === "string") return "";
        if (Array.isArray(것)) {
          for (let i = 것.length - 1; i >= 0; i--) {
            const 하나 = 찾기(것[i]);
            if (하나) return 하나;
          }
          return "";
        }
        if (!것 || typeof 것 !== "object") return "";
        const 칸 = 것 as Record<string, unknown>;
        if (칸.type === "agent_message" || 칸.type === "output_text") {
          const 글 = 칸.text ?? 칸.content;
          if (typeof 글 === "string" && 글.trim()) return 글.trim();
        }
        for (const 값 of Object.values(칸)) {
          const 하나 = 찾기(값);
          if (하나) return 하나;
        }
        return "";
      };

      const 줄들 = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      for (let i = 줄들.length - 1; i >= 0; i--) {
        let 칸: unknown;
        try { 칸 = JSON.parse(줄들[i]); } catch { continue; }
        const 글 = 찾기(칸);
        if (글) return 글;
      }

      // JSON 이 아예 아니면, 그건 Codex 가 무엇 때문에 멈췄는지 알려 주는
      // 줄이다. 짐작해서 「로그인이 안 됐나 봅니다」 하지 말고 그대로 보인다.
      const 맨글 = stdout.trim();
      if (맨글 && !맨글.startsWith("{")) {
        throw new Error(`Codex 가 멈췄습니다: ${맨글.slice(0, 600)}`);
      }
      throw new Error("Codex 의 답에서 글을 찾지 못했습니다. "
                    + `로그인이 안 돼 있을 수 있습니다.\n${stdout.slice(0, 600)}`);
    },
  },
};

export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

export function 엔진(id: string | undefined): Engine {
  const 것 = ENGINES[(id ?? "") as EngineId];
  return 것 ?? ENGINES.claude;
}

/** 대시보드가 키를 저장해 둘 수 있는 이름 전부. 설정 화면이 이걸 쓴다. */
export const ENGINE_KEY_SETTINGS = ENGINE_IDS.map((id) => ENGINES[id].auth.settingKey);
