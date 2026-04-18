# Weave

> 한국어: [README.ko.md](README.ko.md)

**Agentic workflow composer for Claude Code.** Weave discovers skills installed across your Claude Code plugins, chains them into reusable **workflow presets**, and orchestrates step-by-step execution. Session state lives on the filesystem, so you survive context compaction, rollback, and resume across sessions.

- **Repo:** `/Users/Work/git/claude/skills/weave` (filesystem-only; not a git repo)
- **Supported CLI:** Claude Code (v1). `gemini-cli` / `copilot` / `codex` / `opencode` are reserved for future adapters.
- **Node:** 18+

---

## Why Weave

The Claude Code ecosystem already hosts **several agentic workflows with distinct flavors** — superpowers, GSD, BMAD, WDS, GDS, and a growing long tail of custom skills. Each one is a **bundle of tradeoffs**: none is perfect, none is useless.

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

- **Top — the instructions layer.** 13 skills surfaced as slash commands (`/weave:compose`, `/weave:run`, …). The agent reads and executes them.
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
node install.js
```

This copies:

- Runtime → `~/.weave/bin/` (override with `$WEAVE_HOME`)
- Skills → `~/.claude/skills/weave-*/` (13 slash commands)

The installer is idempotent — rerunning is safe.

### 3. Verify

Open Claude Code and type `/weave:` — the 13 slash commands should appear in the command list.

### Update

```bash
cd weave
git pull
node install.js
```

### Uninstall

```bash
rm -rf ~/.weave ~/.claude/skills/weave-*
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

## Slash commands

All exposed as Claude Code skills under `/weave:*`.

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

## File layout

```
~/.weave/
├── bin/                    ← runtime (cli.js + core/ + demo/)
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
