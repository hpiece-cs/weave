---
name: weave-status
description: Show current workflow session status, or restore context after compaction if a session exists but the conversation has been compacted.
---

# /weave:status

Use when the user asks where they are in the workflow, or after context compaction to rehydrate state.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Get status

```bash
node "$WEAVE_CLI" runtime status
```

Result shape: `{ active, workflowName, sessionId, currentStep, step, status, autoMode, checkpoint }` or `{ active: false }`.

### 2. Active session

Show: `weave [<step>] <workflowName>  — current: <currentStep>  [<checkpoint>]  (autoMode: <bool>)`.

### 3. Compaction restore

If the user is resuming after conversation compaction (mentions "compaction", "context lost", or the conversation looks rehydrated):

```bash
node "$WEAVE_CLI" runtime restore
```

Result: `{ session, mode: "light"|"full", previousOutputs, notes }`.

Then regenerate the current step's orchestration wrapper:

```bash
node "$WEAVE_CLI" context-bridge generate
```

Read the wrapper and continue from where the user left off.

### 4. No active session

Suggest `/weave:run <preset>` or `/weave:list` to see available presets.
