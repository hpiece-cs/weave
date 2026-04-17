---
name: weave-next
description: Manually advance to the next workflow step — fallback for when auto-advance fails (e.g., after context compaction dropped the wrapper, or the skill didn't produce a clear end signal).
---

# /weave:next

Use when the user is in a workflow but the auto-advance did not fire after a step finished.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Confirm current state

```bash
node "$WEAVE_CLI" runtime status
```

### 2. Capture artifacts for the completed step

Ask the user (or infer from the conversation) which files were created/modified. Build a JSON payload:

```json
{
  "files": [
    { "path": "docs/spec.md", "type": "spec", "summary": "One-line summary", "keywords": ["k1"] }
  ]
}
```

Register:

```bash
node "$WEAVE_CLI" runtime artifact-register '<json>'
```

### 3. Advance

```bash
node "$WEAVE_CLI" runtime advance
```

Result: `{ completed, next, step, checkpoint, done }`.

### 4. Generate next wrapper

If not `done`, regenerate the next step's orchestration context:

```bash
node "$WEAVE_CLI" context-bridge generate
```

Read the wrapper and continue the run loop.

### 5. If done

Call `runtime end` to archive the session.

## Notes

- Use `/weave:rollback` if you advanced too eagerly.
- `/weave:next` is explicit — it does not add safety confirmations the user didn't ask for.
