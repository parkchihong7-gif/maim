import { spawn } from "node:child_process";
import { config } from "../config.js";

export interface RunClaudeOptions {
  prompt: string;
  /** 예: ["WebSearch"], ["Read"] — 정확히 필요한 도구만 명시적으로 허용한다. */
  allowedTools?: string[];
  /** 작업 디렉터리 밖의 파일(예: 이미지 후보)에 접근해야 할 때 지정. */
  addDir?: string;
  /** true면 도구를 전부 비활성화한다 (검색이 필요 없는 창작 카테고리용). */
  noTools?: boolean;
  timeoutMs?: number;
}

export interface ClaudeEnvelope {
  result: string;
  is_error: boolean;
  total_cost_usd?: number;
  [key: string]: unknown;
}

/**
 * `claude -p`를 서브프로세스로 호출한다. Anthropic API 종량 과금이 아니라
 * 사용자가 이미 보유한 Claude 구독(Pro/Max) 한도 내에서 동작한다.
 */
export async function runClaude(options: RunClaudeOptions): Promise<ClaudeEnvelope> {
  const args = [
    "-p",
    options.prompt,
    "--output-format",
    "json",
    "--permission-mode",
    "acceptEdits",
  ];

  if (options.noTools) {
    args.push("--tools", "");
  } else if (options.allowedTools && options.allowedTools.length > 0) {
    args.push("--allowedTools", options.allowedTools.join(","));
  }

  if (options.addDir) {
    args.push("--add-dir", options.addDir);
  }

  const timeoutMs = options.timeoutMs ?? 180_000;

  return new Promise((resolve, reject) => {
    const child = spawn(config.claudeBin, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`claude -p timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`claude -p exited with code ${code}: ${stderr.slice(0, 2000)}`));
        return;
      }
      try {
        const envelope = JSON.parse(stdout) as ClaudeEnvelope;
        resolve(envelope);
      } catch (err) {
        reject(
          new Error(
            `claude -p output was not a valid JSON envelope: ${(err as Error).message}\n${stdout.slice(0, 2000)}`,
          ),
        );
      }
    });
  });
}
