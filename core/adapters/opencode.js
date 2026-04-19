// core/adapters/opencode.js — opencode slash-command adapter.
// Maps SKILL.md → ~/.config/opencode/command/weave-<name>.md, which opencode
// surfaces as /weave-<name> in its slash menu.
//
// opencode also auto-discovers ~/.claude/skills/**/SKILL.md and merges those
// into its command list (src/skill/index.ts, EXTERNAL_DIRS=['.claude','.agents']).
// So if the claude adapter is also run, opencode has two sources for the same
// name — the command file (written here) wins because cfg.command entries are
// iterated before skills (src/command/index.ts:104-159) and later entries are
// skipped when the name already exists.
//
// File shape (opencode markdown command):
//   ---
//   description: "..."
//   ---
//   <SKILL.md body>
//   $ARGUMENTS        # user argv is substituted here at invocation time

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function detect(home) {
  return fs.existsSync(path.join(home, '.config', 'opencode'));
}

function targetDir(home) {
  // opencode scans {command,commands}/**/*.md under ~/.config/opencode/.
  // 'command' (singular) matches the convention already used by other
  // plugins on this machine; both names are equivalent per the glob.
  return path.join(home, '.config', 'opencode', 'command');
}


// YAML double-quoted string — escape the same way as JSON. Always quote so
// descriptions with ':', '#', or leading/trailing whitespace parse cleanly.
function encodeYamlString(value) {
  const safe = (value || '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .trim();
  return '"' + safe + '"';
}

function render(skill) {
  const body = (skill.body || '').replace(/\s+$/, '') + '\n\nUser arguments: $ARGUMENTS';
  const content = [
    '---',
    'description: ' + encodeYamlString(skill.description),
    '---',
    '',
    body,
    '',
  ].join('\n');
  return {
    filename: `weave-${skill.name}.md`,
    content,
  };
}

// Remove every weave-*.md file we placed in ~/.config/opencode/command/.
// Only those — we never touch a non-weave command. Idempotent.
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
    if (!e.isFile() || !e.name.startsWith('weave-') || !e.name.endsWith('.md')) continue;
    const full = path.join(dir, e.name);
    if (!dryRun) fs.unlinkSync(full);
    removed.push(full);
  }
  return { removed };
}

module.exports = {
  name: 'opencode',
  label: 'opencode',
  detect,
  targetDir,
  render,
  uninstall,
  requiresBash: true,      // opencode has a shell tool; fenced bash in body works
};
