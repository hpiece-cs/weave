---
name: weave-debug
description: Debug a weave run — dump full session state plus config and git status for troubleshooting unexpected behavior.
---

# /weave:debug

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
