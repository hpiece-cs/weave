# Compose UI badges

> 한국어: [badges.ko.md](badges.ko.md)


In the compose tree demos, each skill row shows one or more single-letter badges separated by `|` between the checkbox and the skill name. The count and layout depend on which demo:

| Demo | Layout | Example |
|---|---|---|
| `demo/compose-workflow.js` (default) | `[complexity]\|[interactive]` | `Q\|I` |
| `demo/compose-tree.js` | `[category]\|[complexity]\|[interactive]` | `W\|M\|I` |
| `demo/compose-preview.js` | same fields, different placement | `[W] Q I` |

All values come from `core/scripts/discover.js` and are inferred from each SKILL.md's description, body size, and internal `Skill` invocations — there's no manual tagging.

## 1. Complexity — skill "weight"

Source: `discover.js::inferComplexity()`. Based on total body length + number of sub-skill invocations.

| Badge | Color | Meaning | Threshold |
|---|---|---|---|
| `Q` | cyan | **quick** — light and short | body < 1000 chars, 0 sub-skill invocations |
| `M` | yellow | **medium** — mid-weight | body ≥ 1000 chars OR 1+ invocations |
| `F` | red | **full** — orchestrator-scale | body ≥ 5000 chars OR 3+ invocations |

Examples:
- `Q`: `superpowers:verification-before-completion`, `gsd:help`
- `M`: `bmad:create-prd`
- `F`: `gsd:execute-phase`, `bmad:dev-story` (wraps many sub-skills)

## 2. Interactive — does it need user dialogue

Source: `discover.js::detectInteractive()`. Regex over description + body for `asks user`, `prompts`, `user selects/chooses/decides`, or literal `interactive`.

| Badge | Color | Meaning |
|---|---|---|
| `I` | yellow | **interactive** — pauses for user input during run (pauses even in `--auto` mode) |
| (blank) | — | non-interactive — runs to completion on its own |

Examples:
- `I`: `superpowers:brainstorming`, `bmad:create-prd`
- blank: `superpowers:test-driven-development`, `gsd:execute-phase`

## 3. Category — skill "personality" (tree/preview only)

Source: demo-level `classify()` function (not in discover.js). Pattern-matches name + description.

| Badge | Color | Meaning | Example |
|---|---|---|---|
| `W` | green | **workflow** — produces artifacts (spec/plan/code) | `bmad:create-prd`, `gsd:plan-phase` |
| `P` | magenta | **persona** — role switch (BMad agent-*, GDS agent-*) | `bmad-agent-analyst`, `gds-agent-game-dev` |
| `C` | yellow | **control** — session control flow | `gsd:rollback`, `gsd:pause-work`, `superpowers:receiving-code-review` |
| `U` | dim | **utility** — config/helpers, hidden by default (`u` key toggles visibility) | `gsd:settings`, `gsd:help` |

## Related non-badge fields

Shown elsewhere in the UI (template header, detail view):

| Field | Values | Meaning |
|---|---|---|
| `[source]` | `superpowers`, `bmad`, `gsd`, `wds`, `gds`, `bmad-testarch`, `bmad-cis` | Owning plugin |
| `phase` | Discovery, Requirements, Design, Planning, Implementation, Review/QA, Completion, Control, Other, Phase 0–8 | Workflow stage (used as group header in `compose-tree.js`) |
| `defaultCheckpoint` | `auto`, `verify`, `decision` | After-step behavior: auto-advance / require user confirm / require user choice |
| `compactionAware` | true / false | Skill handles its own context-compaction recovery (weave can inject lighter restore) |

## Legend line

Every compose demo prints a compact legend near the bottom — if in doubt, read that line:

```
Badges:  Q=quick  M=medium  F=full  ·  I=interactive
```

(tree/preview add `W=workflow P=persona C=control`.)
