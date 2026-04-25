---
name: weave-note
description: Add a note to the current workflow step — appears in subsequent step wrappers as workflow-level context.
processStage: execution
processOrder: 3.3
lifecycleGroup: active-session-management
lifecycleGroupNames:
  ko: 활성 세션 관리
  en: Active Session Management
lifecycleOrder: 2.3
usesWhen: Leave context or reminders for downstream steps during execution
skillNames:
  ko: 메모 추가
  en: Add Note
domain: session-orchestration
dataRole: context-annotator
scope: project
filePatterns:
  - input: "{proj}/.weave/session.json + note text"
  - output: "{proj}/.weave/session.json (notes[] appended)"
mutates: true
frequency: variable
---

# /weave:note

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user wants to leave a reminder or context note for later steps in the workflow.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Capture the note text

The note text is everything after `/weave:note` in the user's message, OR ask the user for it if unclear.

### 2. Add

```bash
node "$WEAVE_CLI" runtime note "<text>"
```

Result: `{ added: true, totalNotes: <n> }`.

### 3. Confirm

Tell the user: "Note added (step <N>, <totalNotes> total)." Notes appear in the `## Notes` section of every subsequent step's orchestration wrapper.

## Errors

- "No active session" — the user needs to start a workflow with `/weave:run <preset>` first.
