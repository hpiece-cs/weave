# Weave Skills Detailed Classification
**Based on: Function, Data Structures, File I/O, and Name Patterns**

**Date:** 2026-04-17

---

## Overview

This refined classification considers:
- **Skill name patterns** (weave-* prefix, action words)
- **Input data structures** (what each reads)
- **Output data structures** (what each writes)
- **File scopes** (~/.weave/ vs {project}/.weave/)
- **Interaction patterns** (read-only vs write vs orchestration)

---

## Classification by Data Domain

### Domain 1: Preset Repository Management
**Scope:** `~/.weave/workflows/` (global/project scope)  
**Focus:** Workflow template CRUD operations  
**Characteristics:** Long-lived, reusable, cross-project

| Skill | Function | Input | Output | Operation |
|-------|----------|-------|--------|-----------|
| **compose** | Create new preset | installed skills list | `*.json` preset file | CREATE |
| **list** | List presets | preset files | terminal: list display | READ |
| **manage** | Edit/clone/delete | preset JSON | preset JSON (modified) | UPDATE/DELETE |

**File Pattern:** `~/.weave/workflows/<name>.json` and `.weave/workflows/<name>.json` (project override)  
**Schema:** `schemaVersion`, `name`, `steps[]`, `config`, `tools`

---

### Domain 2: Session State Management  
**Scope:** `{project}/.weave/session.json` (project-local)  
**Focus:** Workflow execution state, progress tracking  
**Characteristics:** Ephemeral, session-specific, one active per project

| Skill | Function | Input | Output | Operation |
|-------|----------|-------|--------|-----------|
| **run** | Execute workflow | preset JSON + cli args | session.json (new/updated) | ORCHESTRATE |
| **next** | Advance step | artifact metadata (user input) | session.json (step advanced) | STATE_TRANSITION |
| **note** | Annotate step | note text | session.json.notes[] (appended) | METADATA_APPEND |

**File Pattern:** `{project}/.weave/session.json`  
**Schema:** `currentStep`, `steps[]`, `notes[]`, `autoDecisions[]`, `outputs[]`

---

### Domain 3: Session Query & Introspection
**Scope:** `{project}/.weave/session.json` (read-only views)  
**Focus:** Extracting and presenting session data  
**Characteristics:** Non-destructive, exploratory, aids navigation

| Skill | Function | Input | Output | Operation |
|-------|----------|-------|--------|-----------|
| **status** | Show current state | session.json | terminal: step/workflow/mode display | READ + RESTORE |
| **history** | List completed steps | session.json.steps[completed] | terminal: artifacts/timestamps | READ |
| **ref** | Search artifacts | session.json.outputs[] + query | terminal: matching artifacts | SEARCH |

**Data Patterns:**  
- `status`: Reads `currentStep`, `workflowName`, `checkpoint`, `autoMode`
- `history`: Reads `steps[status=completed]`, `outputs[]`, `completedAt`
- `ref`: Searches `outputs[].path`, `outputs[].keywords`, `outputs[].type`, `outputs[].stepOrder`

---

### Domain 4: Session Control & Recovery
**Scope:** `{project}/.weave/session.json` (write + diagnostic)  
**Focus:** State repair, rollback, debugging  
**Characteristics:** Intervention-oriented, error recovery

| Skill | Function | Input | Output | Operation |
|-------|----------|-------|--------|-----------|
| **rollback** | Undo previous step | session.json | session.json (state reverted) | STATE_REVERT |
| **debug** | Dump full diagnostics | session.json + config.json + git | terminal: comprehensive state dump | DIAGNOSTIC |

**File Pattern:**  
- `rollback`: Modifies `currentStep`, `steps[].status`, `steps[].outputs`
- `debug`: Reads `session.json`, `{project}/.weave/config.json`, `git status`

---

### Domain 5: Guidance & Navigation
**Scope:** session.json + skill references  
**Focus:** User orientation during execution  
**Characteristics:** Interactive, context-aware, ephemeral output

| Skill | Function | Input | Output | Operation |
|-------|----------|-------|--------|-----------|
| **help** | Step-specific guidance | session.json + SKILL.md | terminal: available tools, step expectations | READ + GUIDE |

**Data Patterns:**  
- Reads `session.json` for context
- Reads current step's SKILL.md from `{skillSource}/skills/{skillName}/SKILL.md`
- Outputs available tools list from `session.config.tools`

---

## Classification by Interaction Pattern

### Pattern A: Stateless Read-Only Tools
**Characteristics:** No session modification, pure information retrieval

- **list** — reads `~/.weave/workflows/` + `.weave/workflows/` → format for display
- **status** — reads session.json → human-readable output (+ optional restore)
- **history** — reads session.json.steps[] → chronological artifact display
- **ref** — reads session.json.outputs[] + regex → search results
- **help** — reads session.json + SKILL.md → contextual guidance

**Usage:** Can call anytime without side effects

---

### Pattern B: Session Mutation Tools
**Characteristics:** Modify `session.json` state (progression, metadata)

- **run** — creates/updates session.json (main orchestrator)
- **next** — advances session.json.currentStep (step completion)
- **note** — appends to session.json.notes[] (metadata enrichment)
- **rollback** — reverts session.json.steps[].status (error recovery)

**Usage:** Changes session state; must be in active session

---

### Pattern C: Preset Mutation Tools
**Characteristics:** Modify `~/.weave/workflows/*.json` (preset templates)

- **compose** — creates new `.json` preset (interactive)
- **manage** — edits/deletes/clones `.json` presets (batch operations)
- **list** — reads presets (discovery before use)

**Usage:** Project-wide or cross-project; affects future sessions

---

### Pattern D: Diagnostic Tools
**Characteristics:** Deep introspection without modification

- **debug** — dumps session.json + config.json + git metadata (troubleshooting)

**Usage:** Invoked when something seems wrong; informs recovery decisions

---

## Classification by Execution Frequency

### Per-Workflow (Rare)
Called once per workflow design cycle:
- **compose** — create new preset once, reuse many times
- **list** — browse presets occasionally

### Per-Workflow-Session (Rare)
Called once per session start:
- **run** — launch workflow

### Per-Step (Frequent)
Called during each step execution:
- **help** — start of each step
- **[actual skill work]** — superpowers, bmad, gsd, etc.
- **next** — end of each step (automatic or manual)
- **note** (optional) — during steps needing context

### On-Demand (Variable)
Called as needed during session:
- **status** — check progress anytime
- **ref** — lookup artifacts during work
- **history** — review past outputs
- **rollback** — recovery only
- **debug** — diagnosis only

### Maintenance (Rare)
Called between sessions:
- **manage** — refine presets after feedback

---

## Unified Classification Grid

```
┌──────────────────────────┬──────────────────┬─────────────┬──────────┐
│ Domain                   │ Scope             │ File Pattern│ Op Type  │
├──────────────────────────┼──────────────────┼─────────────┼──────────┤
│ PRESET MANAGEMENT        │ global/project    │ workflows/  │ CRUD     │
│  compose                 │ ~/.weave/         │ *.json      │ CREATE   │
│  list                    │ ~/.weave/ +       │ *.json      │ READ     │
│  manage                  │ .weave/           │ *.json      │ UPDATE   │
├──────────────────────────┼──────────────────┼─────────────┼──────────┤
│ SESSION ORCHESTRATION    │ project-local     │ session.json│ MUTATE   │
│  run                     │ {proj}/.weave/    │ +.lock      │ ORCHEST. │
│  next                    │ {proj}/.weave/    │ +archive/   │ ADVANCE  │
│  note                    │ {proj}/.weave/    │             │ ANNOTATE │
├──────────────────────────┼──────────────────┼─────────────┼──────────┤
│ SESSION QUERY            │ project-local     │ session.json│ READ     │
│  status                  │ {proj}/.weave/    │ (+ restore) │ QUERY    │
│  history                 │ {proj}/.weave/    │             │ QUERY    │
│  ref                     │ {proj}/.weave/    │             │ SEARCH   │
├──────────────────────────┼──────────────────┼─────────────┼──────────┤
│ SESSION CONTROL          │ project-local     │ session.json│ MUTATE   │
│  rollback                │ {proj}/.weave/    │             │ REVERT   │
│  debug                   │ {proj}/.weave/ +  │ config.json │ DIAGNOSE │
│                          │ git status        │ + .git      │          │
├──────────────────────────┼──────────────────┼─────────────┼──────────┤
│ GUIDANCE                 │ hybrid            │ session.json│ GUIDE    │
│  help                    │ {proj}/.weave/ +  │ + SKILL.md  │ CONTEXT  │
│                          │ skill sources     │             │          │
└──────────────────────────┴──────────────────┴─────────────┴──────────┘
```

---

## Recommended Ordering Within Domains

### Domain 1: Preset Management (Design Phase)
```
1.1 list     ← Discover what's available
1.2 compose  ← Create new based on discovery
1.3 manage   ← Refine and share
```

**Rationale:** Lookup → Create → Maintain (natural workflow progression)

### Domain 2: Session Orchestration (Execution Loop)
```
2.1 run      ← Start session (entry point)
2.2 next     ← (Within run loop) Advance steps
2.3 note     ← (Within run loop, optional) Add context
```

**Rationale:** Start → Advance → Annotate (linear progression during run)

### Domain 3: Session Query (On-Demand)
```
3.1 status   ← "Where am I?" (orientation)
3.2 history  ← "What have we done?" (chronological review)
3.3 ref      ← "Find X" (targeted lookup)
```

**Rationale:** Broad state → Historical view → Targeted search (funnel)

### Domain 4: Session Control (Error Recovery)
```
4.1 debug    ← Diagnose what went wrong
4.2 rollback ← Undo the error
```

**Rationale:** Diagnose → Recover (diagnostic-then-action)

### Domain 5: Guidance
```
5.1 help     ← Single entry point for orientation
```

---

## Data Flow Diagram

```
PRESET LIFECYCLE
════════════════════════════════════════════
 ~/.weave/workflows/*.json
        ↑ (compose)
        │ ← (list, manage)
        ↓ (run: loads preset)

SESSION LIFECYCLE
════════════════════════════════════════════
 {proj}/.weave/session.json
        ↑ (run creates)
        │ (next, note: writes)
        │ ← (status, history, ref: reads)
        │ ← (rollback, debug: diagnostics)
        ↓ (end: archives to {proj}/.weave/archive/)
```

---

## Skill Invocation Dependency Chain

```
START
  │
  ├─→ Preset Management Domain
  │     └─ list → compose → manage
  │
  ├─→ Session Orchestration Domain (entry point: run)
  │     └─ run (creates session.json)
  │          ├─ next (advances in loop)
  │          └─ note (optional, enriches)
  │
  ├─→ Session Query Domain (anytime during session)
  │     ├─ status (orientation)
  │     ├─ history (review)
  │     └─ ref (search)
  │
  ├─→ Guidance Domain (within session steps)
  │     └─ help (context at each step)
  │
  ├─→ Session Control Domain (error recovery)
  │     ├─ debug (diagnose)
  │     └─ rollback (undo)
  │
  └─→ END
```

---

## File System Layout (Reference)

```
~/.weave/                             ← Global scope (cross-project)
├── workflows/
│   ├── my-flow.json                  ← Preset (read/write by: compose, list, manage)
│   └── another.json
├── cache/
│   └── update-check.json
└── config.json                        ← Global config (read by: debug)

{project}/.weave/                     ← Project scope (session-specific)
├── session.json                       ← Active session (r/w: run, next, note, rollback)
├── .lock                              ← Session lock (r/w: run, rollback)
├── config.json                        ← Project config override (read by: debug)
├── workflows/                         ← Project-local presets (override global)
│   └── local-flow.json
└── archive/                           ← Completed sessions
    └── 20260417-abc123.json           ← Historical session (read by: history)

{skill-source}/skills/                ← Skill definitions
├── {skill-name}/
│   └── SKILL.md                       ← Skill definition (read by: help, run)
```

---

## Implementation Roadmap

### Phase 1: Metadata Enrichment
- ✅ Add `processStage`, `processOrder` to each SKILL.md
- [ ] Add `dataRoles`, `filePatterns`, `scope` metadata
- [ ] Update discover.js to extract and organize metadata

### Phase 2: UI Grouping
- [ ] Compose UI: Group skills by domain (preset → session → query → control)
- [ ] Status output: Show current domain + skill
- [ ] Help output: Suggest next logical domain

### Phase 3: Documentation
- [ ] User guide organized by domain
- [ ] File system architecture document
- [ ] Troubleshooting matrix (error → domain → recovery skill)

---

## Quick Reference Table

| Skill | Domain | Scope | Mutates | Frequency | Typical Sequence |
|-------|--------|-------|---------|-----------|------------------|
| compose | Preset Mgmt | global | ✓ | rare | 1.2 |
| list | Preset Mgmt | global | ✗ | rare | 1.1 |
| manage | Preset Mgmt | global | ✓ | rare | 1.3 |
| run | Orchestration | project | ✓ | rare (per session) | 2.1 |
| next | Orchestration | project | ✓ | frequent (per step) | 2.2 |
| note | Orchestration | project | ✓ | variable | 2.3 |
| status | Query | project | ✗ | variable | 3.1 |
| history | Query | project | ✗ | variable | 3.2 |
| ref | Query | project | ✗ | variable | 3.3 |
| help | Guidance | hybrid | ✗ | frequent (per step) | 5.1 |
| rollback | Control | project | ✓ | rare (recovery) | 4.2 |
| debug | Control | project | ✗ | rare (diagnosis) | 4.1 |
