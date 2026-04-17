---
name: weave-list
description: List saved workflow presets from both project (<cwd>/.weave/workflows/) and global (~/.weave/workflows/) scopes with step counts, source mix, and scope badge.
---

# /weave:list

Use when the user asks to see saved workflow presets.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Get presets with scope

```bash
node "$WEAVE_CLI" storage list-scopes
```

Returns `[{ name, scope }]`. When a name exists in both scopes, project wins (that's the one `/weave:run` picks by default).

### 2. Load each for detail

For each entry, load to get step count + source mix:

```bash
node "$WEAVE_CLI" storage load <name> --scope=<scope>
```

(Use explicit scope so you get the right file when both exist.)

### 3. Present

Group by scope, project first. One line per preset:

```
[project]
- my-flow        5 steps   [superpowers]            updated 2026-04-17
- feature-ship   7 steps   [bmad → gsd]             updated 2026-04-14

[global]
- tdd            5 steps   [superpowers]            updated 2026-03-02
- phase-loop     5 steps   [gsd]                    updated 2026-02-18
```

- If only one scope has presets, skip the empty section.
- If a name exists in both scopes, show project version in `[project]` and a note `(also in [global])`.
- If no presets anywhere: tell the user to create one with `/weave:compose`.
