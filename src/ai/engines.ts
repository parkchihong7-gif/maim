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
  /** 고르신 모델. 비어 있으면 도구 기본값. runAI 가 채워 준다. */
  model?: string;
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
  /**
   * 키로 돌 때 **HOME 아래에 새로 써 줄 설정 파일.**
   *
   * Gemini 때문에 생긴 자리다. 이 도구는 인증 방식을 고를 때
   *
   *     설정 파일에 적힌 것  ||  환경변수를 보고 짐작한 것
   *
   * 순서로 본다. **설정 파일이 환경변수를 이긴다.** 그래서 예전에
   * 검은 창에서 로그인해 저장통에 올려 둔 `.gemini/settings.json` 이
   * 남아 있으면, `GEMINI_API_KEY` 를 아무리 잘 넘겨도 그걸 무시하고
   * OAuth 로 가다가 41 로 죽는다. 실제로 그렇게 죽었다.
   *
   * 그러니 짐작에 기대지 말고 **우리가 그 파일을 써서 못 박는다.**
   * 사시는 분이 저장통을 청소하실 일이 없어진다.
   */
  settings?: { path: string; body: unknown };
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
  /**
   * **사람 없는 자리에서 돌리려면 있어야 하는 환경변수들.**
   *
   * 이 도구들은 원래 사람 앞에서 도는 물건이라, 물어보고 답을 기다리는
   * 관문이 곳곳에 있다. 서버에는 답할 사람이 없으니 그 관문마다 멈춘다.
   *
   * 깃발(`--skip-…`)로도 되지만 환경변수 쪽을 쓴다. 다음 판에서 깃발이
   * 사라지면 **모르는 깃발이라며 그 자리에서 죽는데**, 모르는 환경변수는
   * 그냥 무시될 뿐이다. 조용히 무시되는 쪽이 갑자기 죽는 쪽보다 낫다.
   */
  headlessEnv?: Record<string, string>;
  /**
   * 어느 **모델**로 쓸지 적어 두는 설정 칸 이름.
   *
   * 지금까지는 도구의 기본값을 그대로 썼다. 그런데 그 기본값이 회사마다
   * 급이 다르다 — Gemini CLI 는 `gemini-3-flash-preview` 로 붙는데,
   * flash 는 **빠르고 싼 쪽**이다. Claude Code 의 기본은 그보다 윗급이다.
   * 같은 프롬프트를 줘도 글의 결이 달라질 수밖에 없다.
   *
   * 그렇다고 우리가 윗급 모델을 기본으로 박아 두면 안 된다. 무료 등급
   * 키로는 그 모델이 아예 안 열려서, **지금 잘 되던 분이 갑자기 안 되게**
   * 된다. 그래서 «비워 두면 도구 기본값» 으로 두고, 바꾸고 싶은 분만
   * 적으시게 한다.
   */
  modelSetting: string;
  /** 모델 칸에 적을 만한 것들. 화면에 보기로 보인다. */
  modelHint: string;
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

/**
 * 답 글자에서 **JSON 덩어리만** 골라 읽는다.
 *
 * 통째로 `JSON.parse` 하면 안 된다. 이 도구들은 JSON 을 내놓기 전에
 * 안내문을 함께 뱉는 일이 있다. 실제로 본 것만 해도
 *
 *     Security Warning: Skipping system defaults file '/etc/gemini-cli/...'
 *     Ripgrep is not available. Falling back to GrepTool.
 *     { "response": "ok", ... }
 *
 * 이렇다. 이 줄들이 어느 통로로 나올지는 판과 자리마다 다르고, 우리가
 * 정할 수 있는 것이 아니다. 한 줄만 섞여도 글이 통째로 안 읽히면서
 * «로그인이 안 됐나 봅니다» 라는 엉뚱한 안내가 나간다. 그러니 앞뒤에
 * 무엇이 붙든 **중괄호 짝이 맞는 첫 덩어리**를 찾아 읽는다.
 */
function 제이슨(stdout: string, 엔진: string): Record<string, unknown> {
  const 글 = (stdout ?? "").trim();
  try {
    return JSON.parse(글) as Record<string, unknown>;
  } catch { /* 앞뒤에 뭔가 붙은 것이다. 아래에서 골라낸다. */ }

  const 시작 = 글.indexOf("{");
  if (시작 >= 0) {
    // 글자 안의 중괄호에 속지 않도록 따옴표 안인지 보며 짝을 센다.
    let 깊이 = 0, 따옴표 = false, 백슬래시 = false;
    for (let i = 시작; i < 글.length; i++) {
      const c = 글[i];
      if (백슬래시) { 백슬래시 = false; continue; }
      if (c === "\\") { 백슬래시 = true; continue; }
      if (c === '"') { 따옴표 = !따옴표; continue; }
      if (따옴표) continue;
      if (c === "{") 깊이++;
      else if (c === "}") {
        깊이--;
        if (깊이 === 0) {
          try {
            return JSON.parse(글.slice(시작, i + 1)) as Record<string, unknown>;
          } catch { break; }
        }
      }
    }
  }

  // 정말로 JSON 이 없다. 그러면 그 글이 **멈춘 까닭**이다.
  //
  // 여기서 «로그인이 안 돼 있을 수 있습니다» 라고 덧붙이면 안 된다.
  // 바로 아랫줄에 진짜 까닭이 적혀 있는데(«API key not valid» 같은),
  // 그 위에 엉뚱한 짐작을 얹으면 읽는 분이 그 짐작을 쫓아간다.
  throw new Error(`${엔진} 에서 답을 읽지 못했습니다. 도구가 한 말은 이렇습니다:\n`
                + `${글.slice(0, 600)}`);
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
    modelSetting: "claude_model",
    modelHint: "비워 두면 Claude Code 기본값. 예: opus · sonnet",
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
      if (ask.model) a.push("--model", ask.model);
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
    modelSetting: "gemini_model",
    modelHint: "비워 두면 Gemini CLI 기본값(빠른 쪽인 flash 로 붙습니다). "
             + "윗급을 쓰시려면 모델 이름을 적으세요 — 키 등급에 따라 안 열릴 수 있습니다.",
    headlessEnv: {
      // 이게 없으면 「믿을 만한 폴더가 아니다」 며 55 로 멈춘다. 사람이
      // 있으면 «이 폴더를 믿겠습니까» 를 물어보는데, 서버에는 답할 사람이
      // 없다. 우리 서버의 일터는 우리가 만든 자리니 믿어도 된다.
      GEMINI_CLI_TRUST_WORKSPACE: "true",
    },
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
      settings: {
        path: ".gemini/settings.json",
        body: { security: { auth: { selectedType: "gemini-api-key" } } },
      },
    },
    args(ask) {
      // `--approval-mode yolo` 로 도구를 자동 승인한다. 사람이 없는 자리라
      // 물어보면 거기서 멈춘다. (`--yolo` 와 같은 뜻인데 이쪽이 새 이름이다.)
      const a = ["-p", ask.prompt, "--output-format", "json"];
      if (ask.model) a.push("-m", ask.model);
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
    modelSetting: "codex_model",
    modelHint: "비워 두면 Codex 기본값.",
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
      if (ask.model) a.push("-m", ask.model);
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

/**
 * 넣으신 것이 **키처럼 생겼는지** 본다. 아니면 까닭을 한국어로 돌려준다.
 *
 * 왜 필요한가
 *   키는 HTTP 머리글에 실려 나간다. 거기에는 **아스키 글자만** 들어간다.
 *   한글이 섞이면 이런 말이 나온다.
 *
 *     Cannot convert argument to a ByteString because the character at
 *     index 0 has a value of 51652 which is greater than 255
 *
 *   51652 는 «진» 이다. 안내 글자를 지우지 않고 그대로 넣으셨다는 뜻인데,
 *   저 영문만 보고 그걸 알아내는 것은 사실상 불가능하다. 실제로 그렇게
 *   한 번 헤맸다. 그러니 **넣는 자리에서** 잡는다.
 */
export function 키검사(값: string): string {
  const 글 = (값 ?? "").trim();
  if (!글) return "키가 비어 있습니다.";
  if (/[\s]/.test(글)) return "키에 빈칸이나 줄바꿈이 섞여 있습니다. 앞뒤가 잘리지 않았는지 보시고 다시 붙여넣어 주세요.";
  // 아스키(32~126) 밖의 글자 — 한글·따옴표 기호 따위.
  const 딴글자 = [...글].find((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) > 126);
  if (딴글자) {
    return `키에 «${딴글자}» 같은 글자가 들어 있습니다. API 키는 영문·숫자·기호로만 되어 있습니다. `
         + `안내 글자를 지우지 않고 넣으셨거나, 다른 것을 붙여넣으신 것 같습니다.`;
  }
  if (글.length < 20) return `키가 너무 짧습니다 (${글.length}자). 앞부분만 복사되지 않았는지 보아 주세요.`;
  return "";
}

export const ENGINE_IDS = Object.keys(ENGINES) as EngineId[];

export function 엔진(id: string | undefined): Engine {
  const 것 = ENGINES[(id ?? "") as EngineId];
  return 것 ?? ENGINES.claude;
}

/** 대시보드가 키를 저장해 둘 수 있는 이름 전부. 설정 화면이 이걸 쓴다. */
export const ENGINE_KEY_SETTINGS = ENGINE_IDS.map((id) => ENGINES[id].auth.settingKey);

/** 화면이나 기록에 새면 안 되는 값들의 설정 칸 이름. */
export const SECRET_SETTINGS = [
  ...ENGINE_IDS.map((id) => ENGINES[id].auth.settingKey),
  "unsplash_access_key", "pexels_api_key", "pixabay_api_key",
];

/** 모델을 적어 두는 칸 이름 전부. */
export const ENGINE_MODEL_SETTINGS = ENGINE_IDS.map((id) => ENGINES[id].modelSetting);
