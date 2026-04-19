// cli-detect.js — identify which CLI spawned this process by inspecting env.
// Each CLI sets a recognizable env var on child shell processes; weave uses
// that signal to decide which per-CLI discover adapter to activate.
//
// Signal sources (verified against each CLI's source):
//   claude   — CLAUDECODE=1 (Claude Code)
//   opencode — OPENCODE=1 (opencode/packages/opencode/src/index.ts:108)
//   codex    — CODEX_THREAD_ID=<uuid> (codex/config/src/shell_environment.rs:7)
//   gemini   — GEMINI_CLI=1 (Gemini CLI shell tool docs)
//   copilot  — COPILOT_AGENT_SESSION_ID=<id> (github/copilot-cli changelog)
//
// Override: WEAVE_CLI env var takes priority over any signal.
//   Values: 'claude' | 'opencode' | 'codex' | 'copilot' | 'gemini' | 'all'
//
// Fallback: when no signal matches, return 'claude' to preserve legacy
// behavior (weave was Claude-first originally and most callers expect that).

'use strict';

const KNOWN_CLIS = ['claude', 'opencode', 'codex', 'copilot', 'gemini'];

// Ordered list so a deterministic winner emerges when a pathological case
// has multiple signal vars set. First match wins; order = priority.
const SIGNALS = [
  ['claude',   (env) => env.CLAUDECODE === '1' || Boolean(env.CLAUDE_CODE_ENTRYPOINT)],
  ['opencode', (env) => env.OPENCODE === '1' || Boolean(env.OPENCODE_PID)],
  ['codex',    (env) => Boolean(env.CODEX_THREAD_ID)],
  ['gemini',   (env) => env.GEMINI_CLI === '1'],
  ['copilot',  (env) => Boolean(env.COPILOT_AGENT_SESSION_ID)],
];

const FALLBACK = 'claude';

function detectRunningCli(env) {
  const e = env || process.env;
  const override = e.WEAVE_CLI;
  if (override) {
    if (override === 'all' || KNOWN_CLIS.includes(override)) return override;
    // Unknown override — treat as fallback, don't crash. Caller can warn.
    return FALLBACK;
  }
  for (const [name, match] of SIGNALS) {
    if (match(e)) return name;
  }
  return FALLBACK;
}

module.exports = {
  detectRunningCli,
  KNOWN_CLIS,
  SIGNALS,
  FALLBACK,
};
