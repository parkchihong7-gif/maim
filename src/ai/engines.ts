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
 *   claude   Claude Pro/Max 구독 한도 안에서
 *   gemini   **개인 구글 계정이면 하루 1,000건 무료**
 *   codex    ChatGPT Plus 구독으로
 *
 * 왜 API 를 직접 안 쓰나
 *   API 는 **글 한 편마다 돈이 나간다.** 이 상품은 매일 몇 편씩 쓰는
 *   물건이라 그 구조로는 팔 수가 없다. 그리고 뉴스형 카테고리에 필요한
 *   웹 검색을 이 도구들은 안에 갖고 있다 — 순수 API 에는 없어서 검색
 *   엔진을 따로 붙여야 한다.
 */

export type EngineId = "claude" | "gemini" | "codex";

export interface RunAsk {
  prompt: string;
  /** 웹 검색이 필요한가. 뉴스형 카테고리에서만 참이다. */
  needsSearch?: boolean;
  /** 이 폴더의 파일을 읽어야 한다 (이미지 고르기). */
  readDir?: string;
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
  /** 명령줄 인자를 짠다. */
  args(ask: RunAsk): string[];
  /** 돌려받은 글에서 **답 글자**를 꺼낸다. 못 꺼내면 던진다. */
  answer(stdout: string): string;
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
    cost: "**개인 구글 계정이면 무료입니다.** 하루 1,000건 · 분당 60건. "
        + "따로 구독하실 것이 없습니다.",
    bin: "gemini",
    install: "npm install -g @google/gemini-cli",
    login: "gemini",
    home: ".gemini",
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
    args(ask) {
      // `codex exec` 가 사람 없이 도는 자리다. `--json` 은 **한 덩어리가
      // 아니라 줄마다 하나씩** 나오는 꼴이라, 아래 answer() 에서 마지막
      // 답 줄을 골라낸다.
      return ["exec", ask.prompt, "--json"];
    },
    answer(stdout) {
      // 줄 단위 JSON. 뒤에서부터 읽으며 글이 담긴 첫 줄을 쓴다.
      const 줄들 = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
      for (let i = 줄들.length - 1; i >= 0; i--) {
        let 칸: Record<string, unknown>;
        try { 칸 = JSON.parse(줄들[i]) as Record<string, unknown>; } catch { continue; }
        if (칸.error) throw new Error(String(칸.error));
        const 글 = 칸.text ?? 칸.message ?? 칸.content ?? 칸.result ?? 칸.response;
        if (typeof 글 === "string" && 글.trim()) return 글.trim();
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
