'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate WEAVE_HOME before loading modules (source-registry resolves CACHE_DIR eagerly).
const WEAVE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-reg-'));
process.env.WEAVE_HOME = WEAVE_TMP;

const sourceRegistry = require('../core/scripts/source-registry.js');

// ── buildPrefixCounts ──────────────────────────────────────

test('buildPrefixCounts — hyphen-segmented accumulation', () => {
  const counts = sourceRegistry.buildPrefixCounts([
    'bmad-create-prd',
    'bmad-dev-story',
    'bmad-cis-storytelling',
    'bmad-cis-design-thinking',
  ]);
  assert.strictEqual(counts.get('bmad'), 4);
  assert.strictEqual(counts.get('bmad-cis'), 2);
  assert.strictEqual(counts.get('bmad-create'), 1);
  assert.strictEqual(counts.get('bmad-cis-storytelling'), 1);
});

test('buildPrefixCounts — handles no-hyphen names', () => {
  const counts = sourceRegistry.buildPrefixCounts(['superpowers', 'superpowers']);
  assert.strictEqual(counts.get('superpowers'), 2);
});

// ── longestMatch ───────────────────────────────────────────

test('longestMatch — picks longest applicable boundary', () => {
  const b = new Set(['bmad', 'bmad-cis']);
  assert.strictEqual(sourceRegistry.longestMatch('bmad-cis-foo', b), 'bmad-cis');
  assert.strictEqual(sourceRegistry.longestMatch('bmad-foo', b), 'bmad');
  assert.strictEqual(sourceRegistry.longestMatch('bmad', b), 'bmad');
  assert.strictEqual(sourceRegistry.longestMatch('other-skill', b), null);
});

// ── derivePrefixes ─────────────────────────────────────────

function makeHomeSkill(dir) {
  return {
    filePath: path.join('/home/x/.claude/skills', dir, 'SKILL.md'),
    type: 'home-skill',
    parsed: { name: dir, description: '', body: '' },
  };
}

test('derivePrefixes — cluster >= minClusterSize forms boundary', () => {
  const parsed = [
    makeHomeSkill('newfw-foo'),
    makeHomeSkill('newfw-bar'),
    makeHomeSkill('newfw-baz'),
  ];
  const { prefixes, assignments } = sourceRegistry.derivePrefixes(parsed, {
    seed: [],
    minClusterSize: 2,
  });
  assert.ok(prefixes.includes('newfw'));
  for (const item of parsed) {
    assert.strictEqual(assignments[item.filePath].source, 'newfw');
    assert.strictEqual(assignments[item.filePath].signal, 'derivation');
  }
});

test('derivePrefixes — singleton below threshold is orphan', () => {
  const parsed = [makeHomeSkill('loner-foo')];
  const { assignments } = sourceRegistry.derivePrefixes(parsed, {
    seed: [],
    minClusterSize: 2,
  });
  assert.strictEqual(assignments[parsed[0].filePath].source, 'loner-foo');
  assert.strictEqual(assignments[parsed[0].filePath].signal, 'unknown');
});

test('derivePrefixes — seed provides cold-start boundary even with 1 file', () => {
  const parsed = [makeHomeSkill('bmad-only')];
  const { prefixes, assignments } = sourceRegistry.derivePrefixes(parsed, {
    seed: ['bmad'],
    minClusterSize: 2,
  });
  assert.ok(prefixes.includes('bmad'));
  assert.strictEqual(assignments[parsed[0].filePath].source, 'bmad');
  assert.strictEqual(assignments[parsed[0].filePath].signal, 'seed');
});

test('derivePrefixes — longest seed wins (bmad-cis beats bmad)', () => {
  const parsed = [makeHomeSkill('bmad-cis-storytelling')];
  const { assignments } = sourceRegistry.derivePrefixes(parsed, {
    seed: ['bmad', 'bmad-cis'],
  });
  assert.strictEqual(assignments[parsed[0].filePath].source, 'bmad-cis');
});

test('derivePrefixes — existingRegistry preserves assignments (id stability)', () => {
  const prevPath = '/home/x/.claude/skills/legacy-foo/SKILL.md';
  const existingRegistry = {
    schemaVersion: 1,
    assignments: {
      [prevPath]: { source: 'legacy', signal: 'derivation', firstSeen: '2026-01-01T00:00:00Z' },
    },
  };
  // Even though only 1 file and no seed, registry retains its source.
  const parsed = [{ filePath: prevPath, type: 'home-skill', parsed: { name: 'foo' } }];
  const { assignments } = sourceRegistry.derivePrefixes(parsed, {
    seed: [],
    existingRegistry,
    minClusterSize: 2,
  });
  assert.strictEqual(assignments[prevPath].source, 'legacy');
  assert.strictEqual(assignments[prevPath].firstSeen, '2026-01-01T00:00:00Z');
});

test('derivePrefixes — plugin skills use pluginContext.name, signal=plugin', () => {
  const p = {
    filePath: '/plugins/foo/skills/bar/SKILL.md',
    type: 'plugin-skill',
    pluginContext: { name: 'foo-plugin' },
    parsed: { name: 'bar' },
  };
  const { assignments } = sourceRegistry.derivePrefixes([p], {});
  assert.strictEqual(assignments[p.filePath].source, 'foo-plugin');
  assert.strictEqual(assignments[p.filePath].signal, 'plugin');
});

test('derivePrefixes — command uses parent dir name, signal=command-dir', () => {
  const c = {
    filePath: '/home/x/.claude/commands/gsd/plan-phase.md',
    type: 'home-command',
    parsed: { name: 'plan-phase' },
  };
  const { assignments } = sourceRegistry.derivePrefixes([c], {});
  assert.strictEqual(assignments[c.filePath].source, 'gsd');
  assert.strictEqual(assignments[c.filePath].signal, 'command-dir');
});

test('derivePrefixes — retains historical assignments for absent files', () => {
  const absentPath = '/home/x/.claude/skills/gone/SKILL.md';
  const existingRegistry = {
    schemaVersion: 1,
    assignments: {
      [absentPath]: { source: 'historic', signal: 'derivation', firstSeen: '...' },
    },
  };
  const { assignments } = sourceRegistry.derivePrefixes([], {
    existingRegistry,
  });
  assert.ok(absentPath in assignments, 'historical entry retained');
  assert.strictEqual(assignments[absentPath].source, 'historic');
});

// ── persistence ────────────────────────────────────────────

test('saveRegistry + loadRegistry — round trip', () => {
  // Use a fresh subdir so this test does not collide with other tests.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-reg-rt-'));
  const prevHome = process.env.WEAVE_HOME;
  process.env.WEAVE_HOME = tmp;
  // Re-require in an isolated module path (node:module cache).
  delete require.cache[require.resolve('../core/scripts/paths.js')];
  delete require.cache[require.resolve('../core/scripts/source-registry.js')];
  const reg = require('../core/scripts/source-registry.js');

  reg.saveRegistry({
    prefixes: ['bmad', 'gds'],
    assignments: {
      '/a/SKILL.md': { source: 'bmad', signal: 'seed', firstSeen: 'now' },
    },
  });
  const loaded = reg.loadRegistry();
  assert.ok(loaded);
  assert.strictEqual(loaded.schemaVersion, 1);
  assert.deepStrictEqual(loaded.derivedPrefixes, ['bmad', 'gds']);
  assert.strictEqual(loaded.assignments['/a/SKILL.md'].source, 'bmad');

  // Restore
  process.env.WEAVE_HOME = prevHome;
  delete require.cache[require.resolve('../core/scripts/paths.js')];
  delete require.cache[require.resolve('../core/scripts/source-registry.js')];
});

test('loadRegistry — returns null on missing/corrupt/wrong schema', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-reg-corrupt-'));
  const prevHome = process.env.WEAVE_HOME;
  process.env.WEAVE_HOME = tmp;
  delete require.cache[require.resolve('../core/scripts/paths.js')];
  delete require.cache[require.resolve('../core/scripts/source-registry.js')];
  const reg = require('../core/scripts/source-registry.js');

  assert.strictEqual(reg.loadRegistry(), null);

  // Wrong schema
  fs.mkdirSync(path.join(tmp, 'cache'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, 'cache', 'source-registry.json'),
    JSON.stringify({ schemaVersion: 999, assignments: {} })
  );
  assert.strictEqual(reg.loadRegistry(), null);

  // Corrupt JSON
  fs.writeFileSync(path.join(tmp, 'cache', 'source-registry.json'), 'not json');
  assert.strictEqual(reg.loadRegistry(), null);

  process.env.WEAVE_HOME = prevHome;
  delete require.cache[require.resolve('../core/scripts/paths.js')];
  delete require.cache[require.resolve('../core/scripts/source-registry.js')];
});

// ── resolveSource ──────────────────────────────────────────

test('resolveSource — returns assignment source or null', () => {
  const reg = {
    assignments: {
      '/a/b': { source: 'foo', signal: 'seed', firstSeen: 'now' },
    },
  };
  assert.strictEqual(sourceRegistry.resolveSource('/a/b', reg), 'foo');
  assert.strictEqual(sourceRegistry.resolveSource('/missing', reg), null);
  assert.strictEqual(sourceRegistry.resolveSource('/a/b', null), null);
});

// ── diffAssignments ────────────────────────────────────────

test('diffAssignments — detects id churn, ignores unchanged and new', () => {
  const prev = {
    '/a': { source: 'bmad' },
    '/b': { source: 'gds' },
    '/c': { source: 'wds' },
  };
  const next = {
    '/a': { source: 'bmad' },          // unchanged
    '/b': { source: 'gds-v2' },         // changed
    '/d': { source: 'newfw' },          // new (not a churn)
  };
  const changed = sourceRegistry.diffAssignments(prev, next);
  assert.strictEqual(changed.length, 1);
  assert.deepStrictEqual(changed[0], {
    filePath: '/b',
    prevSource: 'gds',
    nextSource: 'gds-v2',
  });
});
