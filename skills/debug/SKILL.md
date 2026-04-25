---
name: weave-debug
description: Debug a weave run — dump full session state plus config and git status for troubleshooting unexpected behavior.
processStage: control
processOrder: 5.1
lifecycleGroup: session-recovery-diagnostics
lifecycleGroupNames:
  ko: 세션 복구 및 진단
  en: Session Recovery & Diagnostics
lifecycleOrder: 5.1
usesWhen: Diagnose problems or inspect full session state and configuration
skillNames:
  ko: 상태 진단
  en: Diagnose
domain: session-control
dataRole: diagnostician
scope: project
filePatterns:
  - input: "{proj}/.weave/session.json + {proj}/.weave/config.json + git status"
  - output: "terminal display (comprehensive state dump, steps table, config, git status)"
mutates: false
frequency: rare-on-error
---

# /weave:debug

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when something seems wrong with a running workflow and the user wants to inspect internal state.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Dump

```bash
node "$WEAVE_CLI" runtime debug
```

Result: `{ session, config, gitRepo }`.

### 2. Present concisely

Show the user:
- Session: workflowName, sessionId, currentStep, autoMode
- Steps table: order, skillId, status, outputs count, startedAt/completedAt
- Config: which settings are non-default
- Git repo: yes/no
- Active notes, autoDecisions

Do not paste the raw JSON wholesale. Highlight anything that looks wrong (e.g., step status `in_progress` with a past `completedAt`, missing outputs, stale lock).

### 3. Common issues

- **Stale lock** (`.weave/.lock` from a crashed session): the next `runtime start` will reclaim automatically after 30s. To force, delete `.weave/.lock`.
- **Wrong step status** after a crash: `runtime rollback` resets the current step.
- **Missing artifacts**: check whether `artifact-register` was called after the step. Use `/weave:next` to re-run the completion routine.
