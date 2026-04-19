// core/adapters/index.js — CLI adapter registry for weave skill deployment.
// Each adapter converts a single SKILL.md into the format that a specific CLI's
// slash-command system expects, and tells install.js where to put it.
//
// Adapter contract:
//   name        : string            — registry key
//   label       : string            — human-readable name (install.js logs)
//   detect(home): boolean           — quick probe: is this CLI configured?
//                                     Used for auto-target selection
//   targetDir(home): string         — absolute dir under which render(...).filename is written
//   render(skill): {filename, content}
//                                   — filename is relative to targetDir
//                                   — content is the full file bytes
//   requiresBash: boolean           — adapter metadata: does the CLI execute bash in slash cmds?
//                                     (used to pick fallback rendering in future adapters)
//
// The `skill` input passed to render():
//   {
//     name: 'status',                // dir name under skills/ (no 'weave-' prefix)
//     raw: '<SKILL.md bytes>',       // full file, untouched
//     frontmatter: '<yaml text>',    // between --- fences
//     description: '<frontmatter description>',
//     body: '<everything after closing --->',
//   }

'use strict';

const os = require('node:os');

const claude = require('./claude.js');
const gemini = require('./gemini.js');

const REGISTRY = {
  claude,
  gemini,
};

function getAdapter(name) {
  const adapter = REGISTRY[name];
  if (!adapter) throw new Error(`Unknown adapter: ${name}`);
  return adapter;
}

function listAdapters() {
  return Object.keys(REGISTRY);
}

// Auto-detect which CLIs are set up on this machine.
// Used when install.js runs without --target=...
function detectTargets(home) {
  const h = home || os.homedir();
  const hits = [];
  for (const [name, adapter] of Object.entries(REGISTRY)) {
    try {
      if (adapter.detect(h)) hits.push(name);
    } catch {
      /* detection never throws */
    }
  }
  return hits;
}

// Very small frontmatter parser — mirrors discover.js:parseSkillMd but decoupled
// so install.js can run without pulling the full discover stack.
function parseSkillMd(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { frontmatter: '', description: '', body: content };
  }
  const frontmatter = match[1];
  const body = match[2];
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  const description = descMatch ? descMatch[1].trim().replace(/^["']|["']$/g, '') : '';
  return { frontmatter, description, body };
}

module.exports = {
  getAdapter,
  listAdapters,
  detectTargets,
  parseSkillMd,
  REGISTRY,
};
