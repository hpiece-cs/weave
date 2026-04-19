# Weave — User Manual

> 한국어: [MANUAL.ko.md](MANUAL.ko.md)

Weave is an agentic workflow composer for agentic coding CLIs — Claude Code, opencode, Gemini CLI, and Copilot CLI. It discovers skills installed across your CLI's plugins and extensions, lets you chain them into reusable **workflow presets**, and orchestrates their execution step-by-step — persisting state to the filesystem so you can survive context compaction, rollback, and resume across sessions.

---

## Table of Contents

1. [Install](#1-install)
2. [Core concepts](#2-core-concepts)
3. [Command reference](#3-command-reference)
4. [End-to-end walkthrough](#4-end-to-end-walkthrough)
5. [Scopes — project vs global](#5-scopes--project-vs-global)
6. [Context compaction & session recovery](#6-context-compaction--session-recovery)
7. [CLI (for scripting)](#7-cli-for-scripting)
8. [Preset JSON shape](#8-preset-json-shape)
9. [Troubleshooting](#9-troubleshooting)
10. [Where things live](#10-where-things-live)
11. [Stage taxonomy (compose grouping)](#11-stage-taxonomy-compose-grouping)
12. [Badges reference](#12-badges-reference)

---

## 1. Install

**Supported CLIs:** Claude Code, opencode, Gemini CLI, Copilot CLI. Codex CLI is not supported (its skill roots don't overlap with any install target).

From the weave repo:

```bash
node install.js                                       # auto-detect configured CLIs
node install.js --target=claude                       # Claude Code only
node install.js --target=claude,opencode,gemini       # explicit multi-target
node install.js --dry-run                             # preview only
```

Copies:

| Target | Writes to | Slash form |
|---|---|---|
| `claude` | `~/.claude/skills/weave-*/SKILL.md` | `/weave:<name>` |
| `opencode` | `~/.config/opencode/command/weave-*.md` | `/weave-<name>` |
| `gemini` | `~/.gemini/commands/weave/*.toml` | `/weave:<name>` |

Plus the runtime → `~/.weave/bin/` (override via `$WEAVE_HOME`).

**Copilot CLI — implicit via claude.** Copilot scans `~/.claude/skills/` at startup, so a `--target=claude` install surfaces the same 13 commands inside Copilot CLI as `/weave-<name>`. There is **no** `--target=copilot` flag; it would be redundant.

Targets are auto-detected by the presence of `~/.claude/`, `~/.config/opencode/`, and `~/.gemini/`. When none are detected, Claude Code is installed as a fallback. Codex CLI has a read-only adapter (used only by discover/detect) and will refuse `--target=codex`.

### Uninstall

```bash
node install.js --uninstall                           # remove every detected CLI + ~/.weave/bin/
node install.js --uninstall --target=gemini           # remove one CLI (runtime stays)
node install.js --uninstall --target=claude,opencode  # remove several
node install.js --uninstall --dry-run                 # preview
```

Removal scope per target:

| Target | What gets deleted |
|---|---|
| `claude` | `~/.claude/skills/weave-*/` (this is the same path Copilot CLI reads — Copilot loses the commands too) |
| `opencode` | `~/.config/opencode/command/weave-*.md` |
| `gemini` | `~/.gemini/commands/weave/*.toml` + the empty `weave/` namespace dir |

`~/.weave/workflows/` is **never** removed automatically — it holds your saved global presets. Delete manually (`rm -rf ~/.weave/workflows`) only if you want those gone.

To re-install after an update, run `node install.js` again — it's idempotent.

## 2. Core concepts

| Term | Meaning |
|---|---|
| **Skill** | A single unit of Claude capability (e.g., `superpowers:brainstorming`). Lives as a `SKILL.md` file under `~/.claude/plugins/...` or `~/.claude/skills/`. |
| **Preset** | A named, reusable ordered sequence of skills. JSON under `.weave/workflows/<name>.json`. |
| **Session** | One execution of a preset. Tracks current step, outputs, notes. Stored at `<project>/.weave/session.json`. |
| **Scope** | Where a preset lives: `project` (`<cwd>/.weave/workflows/`) or `global` (`~/.weave/workflows/`). |
| **Step** | One entry in a preset. Has `skillId`, `checkpoint`, `interactive`, optional `requiresOutputsFrom`. |
| **Checkpoint** | What happens after a step: `auto` (advance), `verify` (user confirms), `decision` (user picks). |
| **Artifact** | A file produced by a step (spec, plan, code). Reported to weave via `artifact-register`. |

## 3. Command reference

All commands are exposed as slash commands on every supported CLI. Claude Code and Gemini CLI render them as `/weave:<name>` (namespace-aware); opencode and Copilot CLI render them as `/weave-<name>` (flat menu).

| Command | Purpose |
|---|---|
| `/weave:compose` | Create a new preset. Opens a new terminal window with an interactive tree picker. |
| `/weave:list` | Show saved presets (project + global). |
| `/weave:run <name>` | Execute a preset step-by-step. Add `--auto` for autonomous mode. |
| `/weave:status` | Current session state, or restore after compaction. |
| `/weave:history` | Completed steps with their artifacts. |
| `/weave:ref <query>` | Search artifacts: `keyword:X`, `step:N`, `type:K`, or freeform. |
| `/weave:note <text>` | Add a note to the current step (surfaces in future step wrappers). |
| `/weave:next` | Manually advance when auto-advance missed. |
| `/weave:rollback` | Revert current step to `pending`, previous step to `in_progress`. Files untouched. |
| `/weave:debug` | Dump full session + config + git state. |
| `/weave:manage` | Edit / clone / delete / promote / demote presets. |
| `/weave:edit-session` | Modify the **active** session — skip pending steps or insert new ones. Touches `session.json` only; preset template stays intact. |
| `/weave:help` | Adaptive help (step-level when active, command map otherwise). |

## 4. End-to-end walkthrough

### Create a preset

```
/weave:compose
```

- A new terminal window pops up (Terminal.app / iTerm2 / gnome-terminal / etc. depending on OS).
- The picker shows **all discovered skills grouped by 30 canonical phase stages** in project-time order (Onboarding → Alignment → Discovery → Research → Requirements → Design → Planning → Test Strategy → Implementation → Review → QA → CI/CD → User Testing → Ship → Retrospective → Milestone Close → Evolution), plus three cross-cutting bands (Control · Docs · Progress).
- Within each group, skills are sorted by methodology priority (`wds → bmad → bmad-testarch → bmad-cis → gds → gsd → superpowers`), then curated step order, then alphabetically.
- Navigate with `Up`/`Down` (or `PageUp`/`PageDown` to jump 10 rows); `+`/`-` (or `Right`/`Left`) expand/collapse a phase group — `Left` on a skill row jumps back to its parent template; `Space` or `Enter` toggles a skill (or activates `SAVE`/`QUIT`); `a` toggles-all in the focused group; `r` reloads the skill list (ignores cache — useful after installing/removing plugins); `s` jumps to the `SAVE` action; `q` or `Ctrl+C` quits without saving.
- `Enter` on `SAVE` → asks for preset name + scope (`project` default).
- If name conflicts in that scope: choose `overwrite` / `rename` / `cancel`.
- Window closes automatically; your CLI shows `✓ Saved preset X`.

**Locale.** The picker, status messages, prompts, and phase descriptions follow `$LANG` — Korean (`ko_*`) or English (default). The cache invalidates automatically when the locale changes, so switching terminals between languages always shows the right strings.

### Run it

```
/weave:run my-flow
```

Claude starts a session and walks each step:
1. `guard` checks prerequisites
2. `git-snapshot` captures state
3. `context-bridge generate` injects the current skill's SKILL.md wrapped with weave context (previous outputs, notes, tools)
4. Skill runs naturally — Claude follows the SKILL.md text
5. `artifact-register` records files produced
6. `advance` moves to next step
7. Repeat until done; `end` archives the session

### During a run

| Want to | Type |
|---|---|
| See progress | `/weave:status` |
| See what's been produced | `/weave:history` or `/weave:ref keyword:api` |
| Leave context for later steps | `/weave:note consider auth middleware` |
| Force-advance when stuck | `/weave:next` |
| Undo last step | `/weave:rollback` |
| Skip pending step / insert a new one | `/weave:edit-session` |
| Inspect internals | `/weave:debug` |

### Autonomous mode

```
/weave:run my-flow --auto
```

Skills with `checkpoint=auto` and `interactive=false` advance without prompting. `verify`/`decision` checkpoints and interactive skills still pause.

## 5. Scopes — project vs global

**Project** (`<cwd>/.weave/workflows/`)
- Lives with the codebase; commit it to share with your team.
- Default scope for `compose`.
- Picked first when you `run`.

**Global** (`~/.weave/workflows/`)
- Shared across all projects.
- Good for personal recipes (TDD loop, code review loop).
- Picked when the same name doesn't exist in project.

Name collisions: project wins. Use `/weave:list` to see both with scope badges, and `/weave:manage` to promote (project → global) or demote (global → project).

## 6. Context compaction & session recovery

Weave's session state lives in `.weave/session.json` — survives context compaction since it's on disk.

After compaction:
```
/weave:status
```
Claude calls `runtime restore` and regenerates the current step's wrapper. You pick up where you left off.

After crashing / new terminal:
Same — `/weave:status` auto-restores. If the `.lock` is stale (crashed process), the next `runtime start` reclaims it after 30s. To force: `rm <project>/.weave/.lock`.

## 7. CLI (for scripting)

All commands route through `~/.weave/bin/cli.js`:

```bash
node ~/.weave/bin/cli.js help
node ~/.weave/bin/cli.js discover --workflow-only

# storage
node ~/.weave/bin/cli.js storage list-scopes
node ~/.weave/bin/cli.js storage save my-flow '<json>' [--scope=project|global]
node ~/.weave/bin/cli.js storage load my-flow [--scope=project|global]
node ~/.weave/bin/cli.js storage remove my-flow [--scope=project|global]
node ~/.weave/bin/cli.js storage clone <from> <to> [--from-scope=..] [--to-scope=..]

# runtime — 18 subcommands total (status + 17 others)
node ~/.weave/bin/cli.js runtime status
# also: start, end, advance, rollback, artifact-register, git-snapshot,
#       history, debug, ref, note, restore, check-update, is-git-repo,
#       session-outline, find-skill, insert-step, skip-step

# step (used by /weave:run internally)
node ~/.weave/bin/cli.js step prepare [--auto]            # guard + git-snapshot + wrapper
node ~/.weave/bin/cli.js step finish '<artifacts-json>'   # register + advance + next wrapper

# context-bridge / guard (low-level helpers)
node ~/.weave/bin/cli.js context-bridge generate [stepIndex] [--auto]
node ~/.weave/bin/cli.js guard <stepIndex> <sessionJsonPath>

# compose (open / re-pick in a new terminal window)
node ~/.weave/bin/cli.js compose-spawn
node ~/.weave/bin/cli.js compose-pick [--session-checked=id1,id2,...]   # single-pick for /weave:edit-session
```

Run `node ~/.weave/bin/cli.js help` for the canonical usage string.

## 8. Preset JSON shape

```json
{
  "schemaVersion": 1,
  "name": "my-flow",
  "created": "2026-04-17T...",
  "updated": "2026-04-17T...",
  "steps": [
    {
      "order": 1,
      "skillId": "superpowers:brainstorming",
      "checkpoint": "auto",
      "interactive": true
    },
    {
      "order": 2,
      "skillId": "superpowers:writing-plans",
      "checkpoint": "auto",
      "interactive": true,
      "requiresOutputsFrom": [0]
    }
  ],
  "tools": ["gsd:debug"]
}
```

Edit by hand anytime, or via `/weave:manage`.

## 9. Troubleshooting

| Symptom | Fix |
|---|---|
| `/weave:compose` "Weave not installed" | `node install.js` from the weave repo. |
| Compose terminal doesn't open (macOS) | macOS "Automation" permission — allow once in System Settings → Privacy & Security. |
| Compose terminal doesn't open (Linux) | Install one of: gnome-terminal, konsole, alacritty, kitty, xterm. |
| "Preset not found: X" | Wrong scope or name. `/weave:list` shows all. |
| "Another weave session is running" | Stale lock. Wait 30s for auto-reclaim, or delete `<project>/.weave/.lock`. |
| Step got stuck, no auto-advance | `/weave:next` with file list, or `/weave:debug` to inspect. |
| Wrong output, want to redo | `/weave:rollback` then re-run the step. Files on disk are NOT reverted — use git if needed. |

## 10. Where things live

```
~/.weave/
├── bin/                   ← runtime (cli.js + core/ + demo/)
├── workflows/             ← global presets
└── cache/                 ← internal markers

~/.claude/skills/
└── weave-*/SKILL.md       ← 13 slash-command skills

<project>/.weave/
├── session.json           ← current session state
├── .lock                  ← session lock (auto-reclaims after 30s stale)
├── workflows/             ← project-local presets
└── archive/               ← completed sessions
```

## 11. Stage taxonomy (compose grouping)

Weave's discover layer classifies every Agentic Workflow skill into one of 30 canonical stages used for grouping in the compose picker and for intra-stage sorting in `discoverAll` output:

**Main flow (project-time, 27)**
Onboarding · Alignment · Discovery · Research · Requirements — Mapping · Requirements — Spec · Requirements — Validation · Design — UX · Design — Architecture · Design — Narrative/Content · Design — Asset Spec · Planning — Epics · Planning — Stories · Planning — Sprint · Test Strategy · Implementation — Dev · Implementation — Assets · Code Review · Test — Automation · QA — NFR · QA — Review/Trace · CI/CD · User Testing · Integration & Ship · Retrospective · Milestone Close · Evolution

**Cross-cutting bands (3)**
Control · Docs · Progress

Classification pipeline: `processStage` frontmatter → `OVERRIDE_TABLE` → `STAGE_KEYWORDS` → `'Other'`.

## 12. Badges reference

The compose UI shows 2-3 letter badges next to each skill: `Q|I`, `W|M|I`, etc. Full reference: [badges.md](badges.md) / [badges.ko.md](badges.ko.md).

