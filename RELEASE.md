# Release Notes

> 한국어: [001-release-notes-v0.1.0.ko.md](RELEASE_Ko.md)

## v0.1.2 — Codex support

**Release date:** 2026-04-25

Weave now installs into **Codex CLI** as a first-class target — alongside Claude Code, Gemini CLI, opencode, and Copilot CLI.

### What this means

You can run the same Weave presets you already use elsewhere from inside Codex. No extra config — just install and Weave shows up in Codex's native skill picker.

### Install

Pick the scope that fits how you use Codex:

```bash
# Most users — install once, available everywhere
node install.js --target=codex

# Per-project install (e.g. team-shared presets in a repo)
node install.js --target=codex --scope=project
```

| Scope | Where it lands | When to use |
|---|---|---|
| `global` (default) | `~/.codex/skills/` | Personal workflows across all your projects |
| `project` | `<cwd>/.agents/skills/` | Repo-scoped, committable setups |

> `--scope=project` is currently Codex-only. Other targets (claude, gemini, opencode) install globally.

### How to use it in Codex

Codex doesn't use slash commands like `/weave:run` — it uses **skill mentions**.

1. Type `/skills` in Codex to browse installed Weave skills.
2. Or mention a skill directly:

   ```
   $weave-run my-preset
   $weave-status
   $weave-compose
   ```

Cheat sheet — what to type in each CLI:

| You used to type… | In Codex, type… |
|---|---|
| `/weave:run` | `$weave-run` |
| `/weave:status` | `$weave-status` |
| `/weave:compose` | `$weave-compose` |
| `/weave:list` | `$weave-list` |

> Note: the custom `/weave:*` slash entrypoints aren't guaranteed in Codex — use `/skills` or `$skill-name` instead.

### Uninstall

```bash
node install.js --uninstall --target=codex                  # global
node install.js --uninstall --target=codex --scope=project  # project-local
```

## v0.1.1 — Patch release

**Release date:** 2026-04-22

Bug-fix release tightening skill discovery and preset application.

### Fixes

- **Project-scoped skill discovery.** Fixed the lookup logic in workflow skill auto-discovery so skills under the project path are resolved correctly.
- **Preset validation.** Added a check for missing skills when applying a preset, so presets referencing uninstalled skills surface the issue instead of failing silently.

## v0.1.0 — First public release

**Release date:** 2026-04-19

First public release of Weave — an agentic workflow composer that discovers installed skills across agentic coding CLIs, chains them into reusable presets, and orchestrates step-by-step execution with on-disk session state.

### Highlights

- **Multi-CLI support.** Install targets: `claude`, `opencode`, `gemini`. Copilot CLI is served automatically through `~/.claude/skills/`.
- **Unified skill discovery.** A single phase map aligns skills from different methodologies (superpowers, GSD, BMAD, WDS, GDS, …) as alternatives at the same stage.
- **13 slash commands.** Compose, run, list, status, history, ref, note, next, rollback, debug, manage, edit-session, help.
- **Context-proof execution.** Session state lives on disk — `/weave:status` reconstructs the current step after compaction, crashes, or a new terminal.
- **Reusable presets.** Freeze a proven hybrid flow as a single JSON file. Project-scoped presets are committable; global presets work as personal recipes.
- **Reversible steps.** `/weave:rollback` rewinds the step pointer without touching files (git owns files, weave owns execution).
- **Autonomy with guardrails.** `checkpoint=auto/verify/decision` + `interactive` flags encode where humans step in. `--auto` only skips steps that are explicitly safe to skip.

### What's included

**Runtime (`core/`)**

- `scripts/` — `paths`, `storage`, `discover`, `guard`, `runtime`, `context-bridge`, `cli-detect`, `skill-cache`, `source-registry`, `spawn`
- `adapters/` — pluggable install-target adapters for `claude`, `gemini`, `opencode`, `codex`, `copilot`
- `hooks/weave-statusline.js` — optional status line hook
- `references/guard-defaults.json` — default preconditions

**Slash commands (13 SKILL.md files)**

| Command | Purpose |
|---|---|
| `/weave:compose` | Create a new preset (tree-picker UI in a new terminal). |
| `/weave:list` | List saved presets (project + global). |
| `/weave:run <name>` | Run a preset step-by-step. `--auto` for autonomous. |
| `/weave:status` | Current session status / restore after compaction. |
| `/weave:history` | Completed steps and artifacts. |
| `/weave:ref <query>` | Search artifacts by keyword / step / type. |
| `/weave:note <text>` | Attach a note to the current step. |
| `/weave:next` | Manual advance when auto-advance stalls. |
| `/weave:rollback` | Revert to previous step (files untouched). |
| `/weave:debug` | Dump session + config + git state. |
| `/weave:manage` | Edit / clone / delete / promote / demote presets. |
| `/weave:edit-session` | Modify the active session — skip pending steps or insert new ones. |
| `/weave:help` | Context-aware help. |

**Installer (`install.js`)**

- Auto-detects configured CLIs (`--target` omitted) or installs to specific ones (`--target=claude,opencode`).
- Idempotent — rerunning is safe.
- `--dry-run` previews changes without writing.
- `--uninstall` removes adapter-scoped skills + runtime. User data (`~/.weave/workflows/`) is always preserved.

### Supported platforms

- **Node:** 18+
- **CLIs:** Claude Code, opencode, Gemini CLI, Copilot CLI

### Install

```bash
git clone https://github.com/hpiece-cs/weave.git
cd weave
node install.js
```

See [../README.md](../README.md) for full options.

### License

MIT
