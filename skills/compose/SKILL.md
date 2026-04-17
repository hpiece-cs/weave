---
name: weave-compose
description: Create a new workflow preset by composing installed skills. Opens an interactive tree UI in a NEW terminal window (macOS/Linux/Windows), waits for the user to finish there, closes the window, and reports what was saved. Never renders the tree inside the current Claude Code chat.
---

# /weave:compose

Use when the user wants to build a reusable multi-step workflow from installed skills.

## Rule — new window, always

The tree UI **must open in a separate terminal window**. Do not render it inline in the chat. If the auto-spawn fails, tell the user the exact reason and suggest the manual command — do not silently fall back to a chat tree.

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Step 1 — Inform, then spawn

Tell the user briefly (one sentence) before running the command:

> Opening the compose tree in a new terminal window. I'll wait here.

Then run (Bash tool, **timeout 600000 ms = 10 min** — this is a long-running call while the user interacts with the other window):

```bash
node "$WEAVE_CLI" compose-spawn
```

This call:
- Spawns a new terminal window (macOS: iTerm2 if `$TERM_PROGRAM=iTerm.app`, else Terminal.app via AppleScript; Linux: gnome-terminal / konsole / alacritty / kitty / xterm / x-terminal-emulator — first found; Windows: `cmd /c start`).
- Runs `node ~/.weave/bin/demo/compose-workflow.js` inside that window.
- Blocks until the demo finishes (user saves or quits) via a filesystem marker.
- Closes the window (macOS) or exits the shell (Linux/Windows) when done.

### Scope

The demo asks the user where to save: **project** (`<cwd>/.weave/workflows/`, default) or **global** (`~/.weave/workflows/`). Encourage project scope for workflows specific to this codebase; suggest global only for reusable-across-projects presets.

### Output JSON

```json
{ "success": true,  "terminal": "terminal.app|iterm2|gnome-terminal|...",
  "added":   ["<preset-name>"], "removed": [] }

{ "success": false, "reason": "unsupported platform: aix",
  "added":   [], "removed": [] }

{ "success": false, "reason": "no supported terminal emulator found ...",
  "added":   [], "removed": [] }

{ "success": false, "reason": "timeout waiting for compose to finish",
  "added":   [], "removed": [] }
```

## Step 2 — Handle result

### `success: true` with `added` non-empty

Confirm:

> ✓ Saved preset **`<name>`** (opened via `<terminal>`). Next: `/weave:run <name>`.

If you want details, run `node "$WEAVE_CLI" storage load <name>` — the returned object includes `_scope` indicating where it was saved. Show step count, source mix, and scope (`[project]` or `[global]`). If multi-source, add `⚠️ Cross-source — new session recommended at source boundaries.`

### `success: true` with `added` empty

The user quit the demo without saving. Tell them:

> No preset was saved. Retry with `/weave:compose` to reopen the window.

Do not render an in-chat tree.

### `success: false`

Report the reason honestly and suggest a manual alternative:

- `unsupported platform` →
  > Your platform (`<os>`) isn't supported by the auto-spawn. Run it manually in a terminal: `node ~/.weave/bin/demo/compose-workflow.js`
- `no supported terminal emulator found` (Linux) →
  > I couldn't find a terminal emulator to launch. Install one of: gnome-terminal / konsole / alacritty / kitty / xterm / x-terminal-emulator, then retry. Or run manually: `node ~/.weave/bin/demo/compose-workflow.js`
- `osascript failed ...` (macOS) →
  > The AppleScript call failed. Try manually: `node ~/.weave/bin/demo/compose-workflow.js`
- `timeout waiting for compose to finish` →
  > 10-minute timeout hit while the compose window was open. Retry and work through it faster, or set `--timeout` higher (not yet exposed — edit compose-spawn call site if needed).

## Notes

- The Bash call to `compose-spawn` blocks the current turn until the user finishes in the other window. Use a generous `timeout` argument (10 min) when invoking it.
- Do not offer a "chat tree" alternative. If the user explicitly asks for the chat version, decline and point them to run the demo script manually.
- On first use, macOS may ask for "Automation" permission to control Terminal.app — the user must allow it once.
