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

module.exports = {
  name: 'claude',
  label: 'Claude Code',
  detect,
  targetDir,
  render,
  requiresBash: true,
};
