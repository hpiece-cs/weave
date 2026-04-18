---
name: weave-help
description: Show workflow-level help — what the current step expects, which tools are available, what commands exist. Adapts to session state.
processStage: execution
processOrder: 3.1
lifecycleGroup: current-step-guidance
lifecycleGroupNames:
  ko: 현재 단계 가이드
  en: Current Step Guidance
lifecycleOrder: 3.1
usesWhen: Get step-specific guidance at the start of each step
skillNames:
  ko: 도움말
  en: Get Help
domain: guidance
dataRole: contextual-guide
scope: project
filePatterns:
  - input: {proj}/.weave/session.json + {skillSource}/skills/{skillName}/SKILL.md
  - output: terminal display (step info, available tools, next step)
mutates: false
frequency: frequent-per-step
---

# /weave:help

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user asks "what do I do now?" or "what commands does weave have?".

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Check session state

```bash
node "$WEAVE_CLI" runtime status
```

### 2a. Active session — step-specific help

Load the session via `runtime debug` to get full step info. Summarize:

- Current step: `<skillId>` — checkpoint `<type>`
- What this step expects to produce (from step's usageTrigger/outputs if available)
- Available tools: from `session.tools`
- Active notes: from `session.notes`
- Next step preview: `<next skillId>`

### 2b. No active session — command reference

Show the weave command map:

```
/weave:compose    — build a new workflow preset
/weave:run <name> — execute a saved preset
/weave:list       — show saved presets
/weave:manage     — edit/clone/delete presets

During a run:
  /weave:status   — current progress
  /weave:history  — completed step artifacts
  /weave:ref      — search artifacts
  /weave:note     — add a note for later steps
  /weave:next     — manually advance (fallback)
  /weave:rollback — back up one step
  /weave:debug    — dump full state
```

### 3. Point to docs

For deeper reference, mention the design docs under `docs/superpowers/` in the weave repo.
