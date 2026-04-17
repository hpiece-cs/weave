// Tests for skills/**/SKILL.md — structural + content checks.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

function readSkill(name) {
  return fs.readFileSync(path.join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
}

function parseFrontmatter(content) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content);
  if (!match) return null;
  const front = {};
  for (const line of match[1].split('\n')) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim());
    if (kv) front[kv[1]] = kv[2];
  }
  return { front, body: match[2] };
}

const EXPECTED_SKILLS = [
  { name: 'compose', description: /compose|create|workflow/i, contains: ['compose-spawn'] },
  { name: 'run', description: /run|execute/i, contains: ['runtime start', 'context-bridge generate', 'runtime advance'] },
  { name: 'list', description: /list/i, contains: ['storage list'] },
  { name: 'manage', description: /manage|edit|delete|clone/i, contains: ['storage'] },
  { name: 'status', description: /status/i, contains: ['runtime status'] },
  { name: 'debug', description: /debug/i, contains: ['runtime debug'] },
  { name: 'note', description: /note/i, contains: ['runtime note'] },
  { name: 'history', description: /history/i, contains: ['runtime history'] },
  { name: 'help', description: /help/i, contains: ['runtime'] },
  { name: 'next', description: /next|advance/i, contains: ['runtime advance'] },
  { name: 'rollback', description: /rollback|previous/i, contains: ['runtime rollback'] },
  { name: 'ref', description: /ref|search|artifact/i, contains: ['runtime ref'] },
];

test('all 12 expected skills exist', () => {
  const present = fs.readdirSync(SKILLS_DIR).filter((n) =>
    fs.existsSync(path.join(SKILLS_DIR, n, 'SKILL.md'))
  );
  assert.strictEqual(present.length, EXPECTED_SKILLS.length);
  for (const spec of EXPECTED_SKILLS) {
    assert.ok(present.includes(spec.name), `missing skill: ${spec.name}`);
  }
});

for (const spec of EXPECTED_SKILLS) {
  test(`skills/${spec.name}/SKILL.md is well-formed`, () => {
    const content = readSkill(spec.name);
    const parsed = parseFrontmatter(content);
    assert.ok(parsed, `${spec.name}: missing frontmatter`);
    assert.strictEqual(parsed.front.name, `weave-${spec.name}`);
    assert.match(parsed.front.description, spec.description);

    // No leftover TODO markers in body
    assert.doesNotMatch(parsed.body, /^\s*TODO\s*$/m, `${spec.name}: bare TODO line`);
    assert.doesNotMatch(parsed.body, /TODO:/i, `${spec.name}: TODO: marker`);

    // Must include the CLI resolver prelude
    assert.match(parsed.body, /WEAVE_CLI=/);
    assert.match(parsed.body, /cli\.js/);

    // Must reference expected subcommands
    for (const needle of spec.contains) {
      assert.ok(
        parsed.body.includes(needle),
        `${spec.name}: body missing reference to "${needle}"`
      );
    }
  });
}
