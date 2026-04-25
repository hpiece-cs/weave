---
name: weave-run
description: "Execute a saved workflow preset step-by-step — start session, then loop on `step prepare` → skill runs → `step finish`. Supports --auto autonomous mode. Uses combined commands to minimize Bash roundtrips."
processStage: preparation
processOrder: 2.1
lifecycleGroup: active-session-management
lifecycleGroupNames:
  ko: 활성 세션 관리
  en: Active Session Management
lifecycleOrder: 2.1
usesWhen: Launch or resume a workflow execution session
skillNames:
  ko: 세션 시작
  en: Start Session
domain: session-orchestration
dataRole: session-orchestrator
scope: project
filePatterns:
  - input: "~/.weave/workflows/*.json (preset) + {proj}/.weave/session.json (resume)"
  - output: "{proj}/.weave/session.json + {proj}/.weave/.lock"
mutates: true
frequency: rare-per-session
---

# /weave:run

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user invokes `/weave:run <preset>` or asks to execute a saved workflow.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Performance note

Each loop iteration uses only **two** Bash calls: `step prepare` (guard + git-snapshot + wrapper in one shot) and `step finish` (artifact-register + advance + next wrapper in one shot). Do not call `runtime status`, `guard`, `git-snapshot`, `context-bridge generate`, `runtime artifact-register`, or `runtime advance` separately — they're all bundled.

## Flow

### 1. Check for existing session

```bash
node "$WEAVE_CLI" runtime status
```

If `active: true`, ask the user whether to resume or end (`runtime end`) before starting.

### 2. Start the preset

```bash
node "$WEAVE_CLI" runtime start <preset-name>          # interactive
node "$WEAVE_CLI" runtime start <preset-name> --auto   # autonomous mode
```

### 3. Prepare the first step

```bash
node "$WEAVE_CLI" step prepare
```

Returns JSON:

```json
{
  "step": "1/N",
  "skillId": "...",
  "checkpoint": "auto|verify|decision",
  "guard": { "pass": true, "warnings": [] },
  "wrapper": "# Weave Workflow: ...\n...(full markdown wrapper)...",
  "scanWarnings": []
}
```

**Read the `wrapper` field and follow its instructions verbatim.** The wrapper embeds the current skill's SKILL.md surrounded by weave context (previous outputs, notes, tools, completion procedure). Do not use the `Skill` tool — that would hand off control and break the loop.

### 4. Finish the step

After the skill's work is done, collect the files created/modified and call:

```bash
node "$WEAVE_CLI" step finish '{"files":[{"path":"...","type":"...","summary":"...","keywords":[...]}]}'
```

Returns:

```json
{
  "completed": "<skillId>",
  "next": "<next skillId>" | null,
  "step": "N/M",
  "checkpoint": "auto|verify|decision",
  "done": false,
  "transition": { "recommendation": "continue|new_session|complete", "reason": "..." },
  "wrapper": "(next step's wrapper markdown)"
}
```

### 5. Checkpoint + transition handling

Before proceeding to the next iteration:

- If `checkpoint === "verify"`: ask the user to confirm the step's output.
- If `checkpoint === "decision"`: ask the user to make a choice.
- If `checkpoint === "auto"`: proceed silently (even in `--auto` mode).
- If `transition.recommendation === "new_session"`: tell the user "다음 단계는 다른 시스템이라 새 대화를 권장합니다. [here] 이 대화에서 계속 / [new] 새 대화에서 시작." Pause.

### 6. Loop

If `done === false`, read the new `wrapper` from the `step finish` response and repeat from step 4.

### 7. End

When `done === true`:

```bash
node "$WEAVE_CLI" runtime end
```

Report archive path. Session state moves to `.weave/archive/<sessionId>.json`.
