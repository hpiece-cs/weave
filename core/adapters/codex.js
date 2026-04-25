// core/adapters/codex.js — OpenAI Codex CLI adapter.
// Codex removed custom prompts in 0.117.0 and migrated to a Skills system.
// Authoritative reference: codex-rs/core-skills/src/loader.rs.
//
// Skill root resolution (in precedence order):
//   Repo:  <project-root>/.agents/skills/**/SKILL.md
//   User:  $CODEX_HOME/skills/ (= ~/.codex/skills/)
//   User:  $HOME/.agents/skills/  (vendor-neutral compatibility path)
//   Admin: /etc/codex/skills/  (skipped — we only read user/project)
//
// Codex does NOT read ~/.claude/skills/ — unlike opencode/copilot.
//
// Install side: supported for native skills only. We install the repo's
// SKILL.md files directly into Codex-visible roots.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function detect(home) {
  return fs.existsSync(path.join(home, '.codex'))
    || fs.existsSync(path.join(home, '.agents'));
}

function targetDir(home, options = {}) {
  const scope = options.scope || 'global';
  const cwd = options.cwd || process.cwd();
  if (scope === 'project') {
    return path.join(cwd, '.agents', 'skills');
  }
  return path.join(home, '.codex', 'skills');
}

function render(skill) {
  return {
    filename: path.join(`weave-${skill.name}`, 'SKILL.md'),
    content: skill.raw,
  };
}

function uninstall(home, { dryRun = false, scope = 'global', cwd } = {}) {
  const dir = targetDir(home, { scope, cwd });
  const removed = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { removed };
  }
  for (const e of entries) {
    if (!e.isDirectory() || !e.name.startsWith('weave-')) continue;
    const full = path.join(dir, e.name);
    if (!dryRun) fs.rmSync(full, { recursive: true, force: true });
    removed.push(full);
  }
  return { removed };
}

module.exports = {
  name: 'codex',
  label: 'Codex',
  detect,
  targetDir,
  render,
  uninstall,
  requiresBash: true,
};
