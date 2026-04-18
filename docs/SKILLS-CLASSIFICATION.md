# Weave Skills Classification — Process Lifecycle Framework

**Date:** 2026-04-17  
**Purpose:** Organize 12 Weave skills into meaningful process stages with recommended execution order.

---

## Process Lifecycle Stages

Weave skills map to five operational stages in workflow management:

```
┌─────────────────┐
│ 1. Design       │  compose, list, manage
├─────────────────┤
│ 2. Preparation  │  run (start)
├─────────────────┤
│ 3. Execution    │  help, next, note
├─────────────────┤
│ 4. Tracking     │  status, history, ref
├─────────────────┤
│ 5. Control      │  rollback, debug
└─────────────────┘
```

---

## Detailed Classification

### Stage 1: Design & Preset Management
*Plan and compose reusable workflow blueprints*

| Order | Skill | Function | When to Use |
|-------|-------|----------|-------------|
| 1.1 | `/weave:list` | Discover existing presets | Before composing — see what's available |
| 1.2 | `/weave:compose` | Create new workflow presets | Build custom multi-step workflows |
| 1.3 | `/weave:manage` | Edit/clone/delete/promote presets | Refine or redistribute workflow templates |

**Progression Logic:**
1. Check what presets exist (`list`)
2. Build new ones by selecting skills (`compose`)
3. Iterate and improve existing presets (`manage`)

---

### Stage 2: Preparation & Session Launch
*Initialize a workflow session and enter the execution loop*

| Order | Skill | Function | When to Use |
|-------|-------|----------|-------------|
| 2.1 | `/weave:run <name>` | Start executing a preset | Launch workflow, resume sessions, or restart |

**Progression Logic:**
- Single entry point for all workflow execution
- Handles session creation, resumption, and orchestration
- Leads directly into Stage 3 (Execution)

---

### Stage 3: Execution & Navigation
*Perform actual work steps within a running workflow*

| Order | Skill | Function | When to Use |
|-------|-------|----------|-------------|
| 3.1 | `/weave:help` | Step-specific guidance | At start of each step — see what's expected |
| 3.2 | *[Skill's SKILL.md content]* | Execute current step's work | Perform the actual task (superpowers, bmad, gsd, etc.) |
| 3.3 | `/weave:note <text>` | Add context for later steps | During execution — leave reminders for downstream |
| 3.4 | `/weave:next` | Advance to next step (fallback) | When auto-advance doesn't fire; manual progression |

**Progression Logic:**
1. Get guidance on what step needs (`help`)
2. Execute the step's actual work (skill SKILL.md)
3. Add notes or context as needed (`note`)
4. Move to next step automatically OR use `/weave:next` if needed

---

### Stage 4: Progress Tracking & Reference
*Query results from completed steps; maintain artifact visibility*

| Order | Skill | Function | When to Use |
|-------|-------|----------|-------------|
| 4.1 | `/weave:status` | View current session state | After context loss, during navigation, or for orientation |
| 4.2 | `/weave:history` | List completed steps & artifacts | Review what steps have produced (chronological) |
| 4.3 | `/weave:ref <query>` | Search artifacts by keyword/type/step | Find specific outputs during execution |

**Progression Logic:**
1. Check overall state and current position (`status`)
2. Review historical outputs in order (`history`)
3. Deep-search for specific artifacts (`ref`)

---

### Stage 5: Control & Troubleshooting
*Recover from errors, undo mistakes, or diagnose problems*

| Order | Skill | Function | When to Use |
|-------|-------|----------|-------------|
| 5.1 | `/weave:debug` | Dump full session state & config | Something seems wrong — inspect internals |
| 5.2 | `/weave:rollback` | Revert to previous step (state only) | Redo the last step; files/git untouched |

**Progression Logic:**
1. Diagnose the issue (`debug`) — view full state
2. Undo if needed (`rollback`) — reset to previous state
3. Resume execution from Stage 3

---

## Execution Flow Diagram

```
START
  │
  ├─→ [Stage 1] Design & Presets
  │     list → compose → manage
  │
  ├─→ [Stage 2] Preparation
  │     run (new/resume/restart)
  │
  ├─→ [Stage 3] Execution Loop ◄─────┐
  │     help → [skill work]        │
  │         → note (optional)      │
  │         → next (if needed)     │
  │                              │
  │     Each step completes      │
  │         ↓                    │
  │     More steps? ─────────────┘
  │         ↓
  │     No
  │         ↓
  ├─→ [Stage 4] Tracking
  │     status → history → ref
  │
  ├─→ [Stage 5] Control (if needed)
  │     debug → rollback → resume to Stage 3
  │
  └─→ END (workflow complete)
```

---

## Usage Patterns

### Pattern A: Fresh Start
```
/weave:list                    (Stage 1.1)
/weave:compose or /weave:run   (Stage 1.2 or Stage 2)
→ [Step 1: help, work, note]   (Stage 3)
→ [Step 2: help, work, note]   (Stage 3)
→ [Check status, history, ref] (Stage 4)
```

### Pattern B: Mid-Session Check-In
```
/weave:status                 (Stage 4.1)
/weave:help                   (Stage 3.1)
/weave:ref <artifact>         (Stage 4.3)
→ [Continue work]             (Stage 3)
```

### Pattern C: Recovery from Error
```
/weave:debug                  (Stage 5.1)
/weave:rollback               (Stage 5.2)
/weave:help                   (Stage 3.1)
→ [Redo step]                 (Stage 3)
```

### Pattern D: Workflow Refinement
```
/weave:manage                 (Stage 1.3)
→ edit steps/checkpoints
/weave:run                     (Stage 2)
→ [Execute refined workflow]   (Stage 3 → 4)
```

---

## Key Principles

1. **Linear Flow (Most Common):**
   - Stage 1 (Design) → Stage 2 (Start) → Stage 3 (Execute) → Stage 4 (Track) → Done

2. **Non-Linear Recovery:**
   - Mid-execution: Jump to Stage 4 (status/history/ref) without exiting Stage 3
   - Error recovery: Use Stage 5 (debug/rollback), then resume Stage 3

3. **Design Iteration:**
   - Stage 1 (manage) → Stage 2 (run) → Stage 3/4 → End
   - Loop back to Stage 1 to refine for next time

4. **Compaction Resilience:**
   - After context loss, use `status` (Stage 4.1) to restore
   - Then proceed with `help` (Stage 3.1) or other Stage 3 skills

---

## Stage Dependencies

```
Stage 1 (Design)         — Independent
  ↓
Stage 2 (Preparation)    — Depends on Stage 1 (must have a preset)
  ↓
Stage 3 (Execution)      — Depends on Stage 2 (must be in a session)
  ↓
Stage 4 (Tracking)       — Depends on Stage 3 (optional, any time)
  ↓
Stage 5 (Control)        — Depends on Stage 3 (error recovery only)
```

---

## Implementation Notes

### In `discover.js`
- Add `processStage` field to skill metadata
- Weave skills auto-tagged: e.g., `processStage: "design"`, `processStage: "execution"`

### In Preset Schema
- Optional `recommendedStages` array for user guidance
- Example: `"recommendedStages": ["design", "execution", "tracking"]`

### In Compose UI
- Group skills by process stage
- Show progression: "Stage 1 (Design) → Stage 2 (Prep) → Stage 3 (Run)"
- Suggest logical ordering within each stage

### In Status/Help Output
- Display current stage: `weave [3/4] my-flow — Execution stage`
- Link to next logical skill based on current stage

---

## Future Enhancements

1. **Auto-Stage Detection:** discover.js infers stage from skill type
2. **Stage-Based Checkpoints:** Different verification rules per stage
3. **Cross-Stage Workflows:** Allow side-quests to Stage 4 without exiting Stage 3
4. **Stage Profiling:** User preferences for stage navigation (skip certain stages, emphasize others)
