---
name: weave-rollback
description: Revert session state to the previous step — resets outputs and completion timestamps, does NOT touch files or git history.
processStage: control
processOrder: 5.2
lifecycleGroup: session-recovery-diagnostics
lifecycleGroupNames:
  ko: 세션 복구 및 진단
  en: Session Recovery & Diagnostics
lifecycleOrder: 5.2
usesWhen: Undo the previous step and redo it (state only; files unchanged)
skillNames:
  ko: 단계 복구
  en: Undo Step
domain: session-control
dataRole: state-reverter
scope: project
filePatterns:
  - input: {proj}/.weave/session.json
  - output: {proj}/.weave/session.json (currentStep--, steps[].status reverted)
mutates: true
frequency: rare-on-error
---

# /weave:rollback

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user wants to redo the previous step (e.g., realized the output was wrong).

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Confirm intent

Rollback is destructive to session state (not files). Confirm with the user:

> Rollback resets the current step to `pending` and the previous step to `in_progress`. File changes and git commits are **not** reverted. Proceed?

### 2. Perform rollback

```bash
node "$WEAVE_CLI" runtime rollback
```

Result: `{ rolledBackTo, skillId, warning }`.

### 3. Regenerate previous step's wrapper

```bash
node "$WEAVE_CLI" context-bridge generate
```

Read the wrapper and resume the previous step.

### 4. First-step error

If the user is already on step 1, `rollback` throws. Explain: "You're on the first step — nothing to roll back to. Use `/weave:run` to restart the preset, or end the session with `runtime end`."

## Notes

- If the user wants to also revert file changes, direct them to `git` (e.g., `git checkout -- <files>` or `git reset`). Weave does not touch the filesystem on rollback.
