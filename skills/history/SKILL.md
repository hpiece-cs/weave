---
name: weave-history
description: Show workflow history — completed steps with their registered artifacts and timestamps.
processStage: tracking
processOrder: 4.2
lifecycleGroup: progress-monitoring
lifecycleGroupNames:
  ko: 진행상황 모니터링
  en: Progress Monitoring
lifecycleOrder: 4.2
usesWhen: Review completed steps and their artifacts in chronological order
skillNames:
  ko: 완료 항목 조회
  en: View History
domain: session-query
dataRole: history-reviewer
scope: project
filePatterns:
  - input: {proj}/.weave/session.json (steps[status=completed])
  - output: terminal display (step order, artifacts, timestamps, keywords)
mutates: false
frequency: variable
---

# /weave:history

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user wants to see what has been produced so far in the current workflow.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Fetch

```bash
node "$WEAVE_CLI" runtime history
```

Result: array of `{ order, skillId, completedAt, outputs[] }` for completed steps.

### 2. Present

For each completed step, show:

```
  <N>. <skillId>   (completed <time>)
       ↳ <path>  [<type>]  "<summary>"   keywords: <list>
```

Group per step; list all outputs under each. If no completed steps, tell the user the workflow hasn't produced anything yet.

### 3. No active session

Tell the user to start a workflow with `/weave:run <preset>` or show archived sessions under `.weave/archive/`.
