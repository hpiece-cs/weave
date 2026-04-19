// core/adapters/claude.js — Claude Code skill adapter.
// Maps SKILL.md → ~/.claude/skills/weave-<name>/SKILL.md (verbatim copy).
// This is the original install.js behavior, lifted into an adapter.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function detect(home) {
  return fs.existsSync(path.join(home, '.claude'));
}

function targetDir(home) {
  return path.join(home, '.claude', 'skills');
}

function render(skill) {
  // Claude Code expects one directory per skill containing SKILL.md. The
  // directory name is "weave-<name>" so the slash command surfaces as
  // /weave:<name> (Claude Code strips the "weave-" prefix for the ':' form).
  return {
    filename: path.join(`weave-${skill.name}`, 'SKILL.md'),
    content: skill.raw,
  };
}

// Remove every weave-* skill dir under ~/.claude/skills/. Idempotent: returns
// an empty list when the target dir is missing or has no matching entries.
function uninstall(home, { dryRun = false } = {}) {
  const dir = targetDir(home);
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
  name: 'claude',
  label: 'Claude Code',
  detect,
  targetDir,
  render,
  uninstall,
  requiresBash: true,
};
