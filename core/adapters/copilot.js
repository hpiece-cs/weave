// core/adapters/copilot.js — GitHub Copilot CLI adapter.
// Reference: https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills
//
// Skill roots per Copilot docs:
//   User:     ~/.copilot/skills, ~/.claude/skills, ~/.agents/skills
//   Project:  .github/skills, .claude/skills, .agents/skills
//
// Skill format is identical SKILL.md + YAML frontmatter — default parser works.
// Install side: not implemented (Copilot invocation is just /<skill-name>,
// same slash convention as Claude; skills in ~/.claude/skills already work).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function detect(home) {
  return fs.existsSync(path.join(home, '.copilot'));
}

function targetDir(home) {
  return path.join(home, '.copilot', 'skills');
}

function render() {
  throw new Error('copilot adapter: render() is not implemented (read-only adapter)');
}

// Read-only adapter never writes files. Uninstall is a noop for interface parity.
function uninstall() {
  return { removed: [] };
}

module.exports = {
  name: 'copilot',
  label: 'Copilot CLI',
  detect,
  targetDir,
  render,
  uninstall,
  readOnly: true,
  requiresBash: true,
};
