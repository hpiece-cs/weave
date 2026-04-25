# Weave

> 한국어: [README.ko.md](README.ko.md)

**Agentic workflow composer for agentic coding CLIs** — Claude Code, opencode, Gemini CLI, Copilot CLI, and Codex. Weave discovers skills installed across your CLI's plugins and extensions, chains them into reusable **workflow presets**, and orchestrates step-by-step execution. Session state lives on the filesystem, so you survive context compaction, rollback, and resume across sessions.

- **Repo:** [github.com/hpiece-cs/weave](https://github.com/hpiece-cs/weave)
- **Supported CLIs:** Claude Code, opencode, Gemini CLI, Copilot CLI, Codex
  - Direct install targets (`--target=...`): `claude`, `opencode`, `gemini`, `codex`
  - Copilot CLI reads `~/.claude/skills/`, so `--target=claude` (or the default install) serves it automatically — no separate flag needed.
- **Node:** 18+

---

## Why Weave

The agentic-coding ecosystem already hosts **several agentic workflows with distinct flavors** — superpowers, GSD, BMAD, WDS, GDS, and a growing long tail of custom skills. Each one is a **bundle of tradeoffs**: none is perfect, none is useless.

Real projects **never fit inside just one of them.** Yet most tooling assumes you've picked a camp. So everyone ends up mixing methodologies informally — with no way to reproduce, share, or audit the blend.

This is Weave's core bet: **let you design, pin, and reuse your own hybrid workflow across methodology boundaries.**

### The hybrid-workflow advantage

- **Cherry-pick the best stage from each methodology.** Freely combine the strong stages of one methodology with the strong stages of another — all in one preset.
- **Cover each methodology's weakness with another's strength.** Where one framework goes shallow, substitute or reinforce with a skill from another framework that's strong at that stage.
- **Aligned on Weave's shared lifecycle.** From Onboarding to Retrospective, Weave defines a canonical set of phases, and every skill is placed on it — so skills from different methodologies appear as **alternatives at the same phase**. Seams become visible, substitutions become cheap.
- **Freeze your blend.** A sequence that worked on one feature becomes a JSON preset, reproducible for the next feature, the next teammate, the next quarter.
- **Keep different blends per project.** Frontend, backend, game, research — the `project` scope lets each repo carry a methodology mix tuned to its domain.
- **Cheap to evolve.** A new skill or a new methodology? Swap one step in the preset. You don't rewrite the process.

### Strengths at a glance

| | |
|---|---|
| **Unified skill discovery** | One view across every installed plugin. Methodology boundaries dissolve. |
| **Weave's shared lifecycle taxonomy** | Every skill is placed on Weave's canonical phase map — skills from different methodologies appear as **alternatives at the same phase**. The starting point for mix-and-match. |
| **Reusable presets** | Proven hybrid flows frozen as JSON. Compose once, run forever. |
| **Context-proof** | State on disk survives compaction, crashes, new terminals. `/weave:status` restores mid-step. |
| **Team vs personal scopes** | Commit `project` presets to share; keep `global` presets as personal recipes. Different blends per repo. |
| **Autonomy with guardrails** | `checkpoint=auto/verify/decision` encodes where humans step in. |
| **Reversible execution** | `/weave:rollback` re-runs steps. Git owns files, weave owns execution. |

### What it unlocks

- **Build your own methodology.** A composition picked from the strong stages of multiple frameworks = **your workflow**. No vendor lock-in.
- **Version-control your team's hybrid.** "How we work here" stops being verbal lore and becomes a committed preset.
- **Per-project optimal blends.** Frontend, backend, game, research — each repo runs its own preset; context-switch cost drops.
- **Long-horizon persistence.** Multi-day, multi-session migrations or refactors run on a hybrid preset that resumes cleanly.
- **Auditable hybrid runs.** `archive/` preserves which methodology's skill produced what artifact, when.
- **A/B methodologies.** Run two preset variants over the same phase and measure — turn methodology choice from religion into evidence.

---

## How it works

Weave's design reduces to one line: **"the agent executes, Weave owns the state."** Skills themselves are never touched. Weave is a thin orchestration layer wrapped around them.

### Four operating stages

From the user's perspective, Weave follows four stages.

**1. Discover — align every installed skill on a single map**

When plugins are installed, Weave scans each `SKILL.md` and decides which phase it belongs to. Skills from different methodologies line up on **Weave's shared lifecycle** as alternatives at the same phase — the starting point for hybrid workflows.

**2. Compose — pick from a tree, freeze as a preset**

`/weave:compose` opens a tree picker in a new terminal window. You expand phases, check the skills you want, give it a name and a scope (project or global), and save. The output is a single JSON file — readable, committable, editable.

**3. Run — a cycle that repeats per step**

`/weave:run <name>` walks the preset one step at a time. Each step follows the same cycle:

- **Preconditions** — git state, required tools, concurrency lock.
- **Context injection** — prior artifacts, your notes, and available tools are merged into the current skill's instructions before handing off to the agent.
- **Skill execution** — the agent reads the merged instructions and works naturally. Weave stays out of this span.
- **Artifact capture** — generated files are attached to the step so later phases and searches can find them.
- **Checkpoint decision** — auto-advance, ask the user to verify, or ask the user to choose.
- **Advance** — move to the next step, or archive the session at the end.

The key property of this cycle: **each step knows what the previous steps produced.** It's not a list of independent runs — artifacts from one phase flow into the next as input.

**4. Recover — pause and resume at any time**

All session state lives as JSON on disk. So:

- **Context limits don't matter** — `/weave:status` reconstructs the current step's context and resumes.
- **New terminal, reboot, whatever** — state is read straight from the project directory.
- **Wrong step? Roll back** — `/weave:rollback` just moves the step pointer. Files on disk stay as they are; git handles them.

### Two layers

Simplified for the user:

- **Top — the instructions layer.** 13 skills surfaced through each CLI's native command or skill surface (`/weave:compose`, `/weave-run`, `/skills`, …). The agent reads and executes them.
- **Bottom — the state layer.** Presets, sessions, artifacts, locks. All files, all human-readable.

This split keeps Weave independent of any particular agent implementation and mostly immune to model / CLI / version upgrades.

### Autonomy vs. manual, balanced

Each step in a preset carries two flags:

- **Checkpoint** — auto-advance, user verify, or user decide.
- **Interactive** — whether the skill itself requires user input.

Running with `--auto` only skips steps that are both auto-advance and non-interactive. Everything else still stops. **Autonomy is never traded against safety** — where the human belongs is already baked into the preset.

### One-line summary

Every installed skill placed on a **phase map**, your chosen blend **frozen as a file**, execution state **kept on disk** — step by step. That's all Weave is.

---

## Install

Prerequisites: **Node 18+** and `git`.

### 1. Clone the repository

```bash
git clone https://github.com/hpiece-cs/weave.git
cd weave
```

### 2. Run the installer

```bash
node install.js                          # auto-detect all configured CLIs
node install.js --target=claude          # Claude Code only
node install.js --target=codex           # Codex only (global scope)
node install.js --target=codex --scope=project
node install.js --target=claude,opencode # multiple targets at once
node install.js --dry-run                # preview without writing
```

This copies:

- Runtime → `~/.weave/bin/` (override with `$WEAVE_HOME`)
- Skills per target:
  - `--target=claude` → `~/.claude/skills/weave-*/SKILL.md` → `/weave:*` (13 commands)
  - `--target=opencode` → `~/.config/opencode/command/weave-*.md` → `/weave-*` (13 commands)
  - `--target=gemini` → `~/.gemini/commands/weave/*.toml` → `/weave:*` (13 commands)
  - `--target=codex` → `~/.codex/skills/weave-*/SKILL.md` (native Codex skills)
  - `--target=codex --scope=project` → `<project>/.agents/skills/weave-*/SKILL.md`

Copilot CLI is **covered by the claude target**: Copilot scans `~/.claude/skills/` by design, so a `--target=claude` install automatically surfaces the 13 weave commands inside Copilot CLI as `/weave-*`. No separate Copilot flag exists.

`--scope` defaults to `global`. `--scope=project` is currently supported only for `--target=codex`. Auto-detect install always uses `global` scope.

When `--target` is omitted, the installer probes `~/.claude/`, `~/.gemini/`, `~/.config/opencode/`, `.codex`, and `.agents` and installs to every CLI it finds (falling back to Claude Code if none are detected).

The installer is idempotent — rerunning is safe.

### 3. Verify

Open your CLI and check that Weave is visible on that surface.

- Claude Code · Gemini CLI → `/weave:<name>` (namespace support)
- opencode · Copilot CLI → `/weave-<name>` (hyphen — these surfaces flatten the namespace)
- Codex → native skill discovery via `/skills`; skills can also be explicitly mentioned with Codex's `$skill-name` syntax

### Update

```bash
cd weave
git pull
node install.js
```

### Uninstall

```bash
node install.js --uninstall                           # remove every detected target + runtime
node install.js --uninstall --target=gemini           # remove one CLI only (runtime stays)
node install.js --uninstall --target=codex            # remove global Codex skills only
node install.js --uninstall --target=codex --scope=project
node install.js --uninstall --target=claude,opencode  # remove several CLIs
node install.js --uninstall --dry-run                 # preview what would be removed
```

What gets removed:

- `--target=claude` → `~/.claude/skills/weave-*/` (this also removes the commands Copilot CLI was reading — single source)
- `--target=opencode` → `~/.config/opencode/command/weave-*.md`
- `--target=gemini` → `~/.gemini/commands/weave/*.toml` (+ the empty `weave/` namespace dir)
- `--target=codex` → `~/.codex/skills/weave-*/`
- `--target=codex --scope=project` → `<project>/.agents/skills/weave-*/`
- No `--target` → every detected CLI above **plus** `~/.weave/bin/` (the runtime)

`~/.weave/workflows/` is **never** removed automatically — it holds your global workflow presets. Delete manually if you no longer need them:

```bash
rm -rf ~/.weave/workflows
```

If the repo is gone, a one-liner still works:

```bash
rm -rf ~/.weave ~/.claude/skills/weave-* ~/.gemini/commands/weave ~/.config/opencode/command/weave-*.md
```

## Quick start

1. **Compose** a preset — picks skills via a tree UI in a new terminal window:
   ```
   /weave:compose
   ```
2. **Run** it step-by-step:
   ```
   /weave:run my-flow
   ```
   Add `--auto` for autonomous mode (skips user prompts at `checkpoint=auto` steps).
3. **Check progress / resume** after compaction:
   ```
   /weave:status
   ```

## Command Surfaces

Surfaced through each supported CLI's native entrypoint. Claude Code · Gemini CLI use `/weave:*`; opencode · Copilot CLI use `/weave-*`; Codex uses `/skills` and supports explicit skill mentions with its `$skill-name` syntax.

Codex examples:

```text
/skills            # browse installed Weave skills
$weave-run my-flow
$weave-status
$weave-compose
```

| Command | Purpose |
|---|---|
| `/weave:compose` | Create a new preset (tree-picker UI). |
| `/weave:list` | List saved presets (project + global). |
| `/weave:run <name>` | Run a preset step-by-step. `--auto` for autonomous. |
| `/weave:status` | Current session status / restore after compaction. |
| `/weave:history` | Completed steps and artifacts. |
| `/weave:ref <query>` | Search artifacts (`keyword:`, `step:`, `type:`). |
| `/weave:note <text>` | Attach a note to the current step. |
| `/weave:next` | Manual advance when auto-advance stalls. |
| `/weave:rollback` | Revert to previous step (files untouched). |
| `/weave:debug` | Dump session + config + git state. |
| `/weave:manage` | Edit / clone / delete / promote / demote presets. |
| `/weave:edit-session` | Modify the **active** session — skip pending steps or insert new ones (session only, preset template untouched). |
| `/weave:help` | Context-aware help. |

For Codex, read those rows as the matching skill names: `weave-compose`, `weave-list`, `weave-run`, `weave-status`, and so on. Use `/skills` to browse them, or mention them with Codex's `$skill-name` form.

## File layout

```
~/.weave/
├── bin/                    ← runtime (cli.js + core/)
├── workflows/              ← global presets
└── cache/                  ← internal markers

~/.claude/skills/
└── weave-*/SKILL.md        ← 13 slash-command skills

<project>/.weave/
├── session.json            ← active session state
├── .lock                   ← session lock (stale after 30s)
├── workflows/              ← project-local presets
└── archive/                ← finished sessions
```

## Scope — project vs global

- **Project** (`<cwd>/.weave/workflows/`) — lives with the code; commit to share with the team. Default scope for `compose`. Wins on name collision.
- **Global** (`~/.weave/workflows/`) — shared across every project. For personal recipes (TDD loop, review loop, etc.).

Use `/weave:manage` to promote (project → global) or demote.

## CLI (scripting)

Every slash command routes through `~/.weave/bin/cli.js`. For scripting:

```bash
node ~/.weave/bin/cli.js help
node ~/.weave/bin/cli.js discover --workflow-only
node ~/.weave/bin/cli.js storage list-scopes
node ~/.weave/bin/cli.js runtime status
```

## Documentation

- [**User Manual**](docs/MANUAL.md) — full command reference, walkthroughs, troubleshooting.

## License

MIT
