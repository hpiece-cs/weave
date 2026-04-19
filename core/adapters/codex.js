// core/adapters/codex.js — OpenAI Codex CLI adapter.
// Codex removed custom prompts in 0.117.0 and migrated to a Skills system.
// Authoritative reference: codex-rs/core-skills/src/loader.rs.
//
// Skill root resolution (in precedence order):
//   Repo:  <project-root>/.agents/skills/**/SKILL.md
//   User:  $CODEX_HOME/skills/ (= ~/.codex/skills/, deprecated but still read)
//   User:  $HOME/.agents/skills/
//   Admin: /etc/codex/skills/  (skipped — we only read user/project)
//
// Codex does NOT read ~/.claude/skills/ — unlike opencode/copilot.
//
// Install side: not implemented — we do not emit Codex-native slash commands
// (Codex has no direct /name slash, only the /skills menu).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function detect(home) {
  return fs.existsSync(path.join(home, '.codex'))
    || fs.existsSync(path.join(home, '.agents'));
}

// Install is not meaningful for Codex yet — keep these as stubs so the
// adapter interface is uniform, but install.js should skip this adapter.
function targetDir(home) {
  return path.join(home, '.agents', 'skills');
}

function render() {
  throw new Error('codex adapter: render() is not implemented (read-only adapter)');
}

// Read-only adapter never writes files, so uninstall has nothing to clean up.
// Provide the hook anyway so callers can treat every adapter uniformly.
function uninstall() {
  return { removed: [] };
}

module.exports = {
  name: 'codex',
  label: 'Codex',
  detect,
  targetDir,
  render,
  uninstall,
  readOnly: true,          // weave install.js should skip this adapter
  requiresBash: true,
};
