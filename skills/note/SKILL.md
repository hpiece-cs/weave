---
name: weave-note
description: Add a note to the current workflow step — appears in subsequent step wrappers as workflow-level context.
---

# /weave:note

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
