---
name: weave-manage
description: Edit, delete, clone, or promote/demote saved workflow presets — scope-aware (project vs global).
processStage: design
processOrder: 1.3
lifecycleGroup: workflow-library-management
lifecycleGroupNames:
  ko: 워크플로우 라이브러리 관리
  en: Workflow Library Management
lifecycleOrder: 1.3
usesWhen: Refine, iterate, or redistribute workflow presets
skillNames:
  ko: 워크플로우 관리
  en: Manage Presets
domain: preset-management
dataRole: preset-maintainer
scope: global|project
filePatterns:
  - input: ~/.weave/workflows/*.json + .weave/workflows/*.json
  - output: modified/deleted/cloned *.json presets
mutates: true
frequency: rare
---

# /weave:manage

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user wants to modify a saved preset (edit steps, delete, clone, or move between project and global scope).

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. List presets with scopes

```bash
node "$WEAVE_CLI" storage list-scopes
```

Show the user which presets exist and where. Ask what to do:

- **Edit** — change steps, checkpoints, tools
- **Clone** — copy to a new name (optionally to a different scope)
- **Delete** — remove a preset
- **Promote** — copy project preset to global (so it's reusable across projects)
- **Demote** — copy global preset to project (localize it)

### 2. Edit

```bash
node "$WEAVE_CLI" storage load <name> --scope=<project|global>
```

Show the current JSON. Ask what to change. Save back to the same scope:

```bash
node "$WEAVE_CLI" storage save <name> '<updated-json>' --scope=<project|global>
```

Note: `storage save` preserves the original `created` timestamp and bumps `updated`.

### 3. Clone

Same scope:

```bash
node "$WEAVE_CLI" storage clone <from> <to>
```

Cross scope (e.g., global → project):

```bash
node "$WEAVE_CLI" storage clone <from> <to> --from-scope=global --to-scope=project
```

### 4. Delete

Confirm first (destructive, no undo). Then:

```bash
node "$WEAVE_CLI" storage remove <name> --scope=<project|global>
```

Without `--scope` the project version is removed if it exists; otherwise global. Be explicit if the user cares.

### 5. Promote / Demote

Promote (project → global), keep project copy:

```bash
node "$WEAVE_CLI" storage clone <name> <name> --from-scope=project --to-scope=global
```

Or move (delete source):

```bash
node "$WEAVE_CLI" storage clone <name> <name> --from-scope=project --to-scope=global
node "$WEAVE_CLI" storage remove <name> --scope=project
```

## Safety

- Never delete without explicit confirmation.
- If a name exists in both scopes, ask which one the user means before acting.
- When promoting/demoting, state clearly whether this is a copy (both remain) or a move (source deleted).
