// Tests for cli.js — unified subcommand dispatcher.

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.resolve(__dirname, '..', 'cli.js');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-cli-home-'));
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-cli-proj-'));

function run(args, { cwd = TEST_PROJECT } = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    env: { ...process.env, WEAVE_HOME: TEST_HOME },
    encoding: 'utf8',
  });
}

after(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(path.join(TEST_HOME, 'workflows'), { recursive: true, force: true });
  fs.rmSync(path.join(TEST_PROJECT, '.weave'), { recursive: true, force: true });
});

// ── usage / errors ──────────────────────────────────

test('no args prints usage and exits non-zero', () => {
  const r = run([]);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /usage/i);
});

test('help prints usage to stdout', () => {
  const r = run(['help']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /usage/i);
  assert.match(r.stdout, /discover/);
  assert.match(r.stdout, /storage/);
  assert.match(r.stdout, /runtime/);
});

test('unknown command exits non-zero with message', () => {
  const r = run(['not-a-command']);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /unknown/i);
});

// ── discover ────────────────────────────────────────

test('discover returns JSON array', () => {
  const r = run(['discover']);
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout);
  assert.ok(Array.isArray(parsed));
});

// ── storage ─────────────────────────────────────────

test('storage list returns [] when no presets', () => {
  const r = run(['storage', 'list']);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), []);
});

test('storage save then load round-trips a preset', () => {
  const preset = JSON.stringify({ steps: [{ order: 1, skillId: 'a:b' }] });
  const save = run(['storage', 'save', 'flow-x', preset]);
  assert.strictEqual(save.status, 0);
  const load = run(['storage', 'load', 'flow-x']);
  assert.strictEqual(load.status, 0);
  const parsed = JSON.parse(load.stdout);
  assert.strictEqual(parsed.name, 'flow-x');
  assert.strictEqual(parsed.steps[0].skillId, 'a:b');
});

test('storage list returns saved preset names', () => {
  run(['storage', 'save', 'one', JSON.stringify({ steps: [] })]);
  run(['storage', 'save', 'two', JSON.stringify({ steps: [] })]);
  const r = run(['storage', 'list']);
  assert.deepStrictEqual(JSON.parse(r.stdout).sort(), ['one', 'two']);
});

// ── guard ───────────────────────────────────────────

test('guard <idx> <sessionPath> returns GuardResult JSON', () => {
  const sessionFile = path.join(TEST_PROJECT, 'session-fixture.json');
  fs.writeFileSync(
    sessionFile,
    JSON.stringify({ steps: [{ skillId: 'a' }, { skillId: 'b' }] })
  );
  const r = run(['guard', '0', sessionFile]);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), { pass: true, warnings: [] });
});

// ── runtime ─────────────────────────────────────────

test('runtime status returns {active:false} when no session', () => {
  const r = run(['runtime', 'status']);
  assert.strictEqual(r.status, 0);
  assert.deepStrictEqual(JSON.parse(r.stdout), { active: false });
});

test('runtime start then status reflects active session', () => {
  // Pre-fill skillPath so runtime.start doesn't require discover lookup.
  const skillFile = path.join(TEST_PROJECT, 'fixture-a.md');
  fs.writeFileSync(skillFile, '# Fixture a\n');
  const preset = JSON.stringify({
    steps: [
      { order: 1, skillId: 'a:one', checkpoint: 'auto', skillPath: skillFile },
      { order: 2, skillId: 'a:two', checkpoint: 'auto', skillPath: skillFile },
    ],
  });
  run(['storage', 'save', 'cli-flow', preset]);
  const started = run(['runtime', 'start', 'cli-flow']);
  assert.strictEqual(started.status, 0, started.stderr);
  const s = run(['runtime', 'status']);
  const parsed = JSON.parse(s.stdout);
  assert.strictEqual(parsed.active, true);
  assert.strictEqual(parsed.workflowName, 'cli-flow');
  assert.strictEqual(parsed.currentStep, 'a:one');
});

// ── context-bridge ──────────────────────────────────

// ── storage scope flags ─────────────────────────────

test('storage save defaults to project scope', () => {
  const preset = JSON.stringify({ steps: [] });
  run(['storage', 'save', 'p-default', preset]);
  // The preset should be in project (.weave/workflows), not global (TEST_HOME/workflows)
  const projFile = path.join(TEST_PROJECT, '.weave', 'workflows', 'p-default.json');
  const globFile = path.join(TEST_HOME, 'workflows', 'p-default.json');
  assert.ok(fs.existsSync(projFile));
  assert.ok(!fs.existsSync(globFile));
});

test('storage save --scope=global writes to global dir', () => {
  const preset = JSON.stringify({ steps: [] });
  const r = run(['storage', 'save', 'g-scope', preset, '--scope=global']);
  assert.strictEqual(r.status, 0);
  const globFile = path.join(TEST_HOME, 'workflows', 'g-scope.json');
  assert.ok(fs.existsSync(globFile));
});

test('storage list-scopes returns [{name, scope}]', () => {
  run(['storage', 'save', 'p-only', JSON.stringify({ steps: [] })]);
  run(['storage', 'save', 'g-only', JSON.stringify({ steps: [] }), '--scope=global']);
  const r = run(['storage', 'list-scopes']);
  assert.strictEqual(r.status, 0);
  const parsed = JSON.parse(r.stdout).sort((a, b) => a.name.localeCompare(b.name));
  assert.deepStrictEqual(parsed, [
    { name: 'g-only', scope: 'global' },
    { name: 'p-only', scope: 'project' },
  ]);
});

// ── step (combined) ─────────────────────────────────

test('step prepare returns guard + wrapper in one call', () => {
  const skillFile = path.join(TEST_PROJECT, 'fix-step.md');
  fs.writeFileSync(skillFile, '# Step Fixture\n');
  const preset = JSON.stringify({
    steps: [
      { order: 1, skillId: 'fix:one', checkpoint: 'auto', skillPath: skillFile },
      { order: 2, skillId: 'fix:two', checkpoint: 'auto', skillPath: skillFile },
    ],
  });
  run(['storage', 'save', 'step-flow', preset]);
  run(['runtime', 'start', 'step-flow']);
  const r = run(['step', 'prepare']);
  assert.strictEqual(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.step, '1/2');
  assert.strictEqual(parsed.skillId, 'fix:one');
  assert.strictEqual(parsed.guard.pass, true);
  assert.match(parsed.wrapper, /# Step Fixture/);
});

test('step finish registers + advances + returns next wrapper', () => {
  const skillFile = path.join(TEST_PROJECT, 'fix-step2.md');
  fs.writeFileSync(skillFile, '# Step Fixture\n');
  const preset = JSON.stringify({
    steps: [
      { order: 1, skillId: 'fix:one', checkpoint: 'auto', skillPath: skillFile },
      { order: 2, skillId: 'fix:two', checkpoint: 'auto', skillPath: skillFile },
    ],
  });
  run(['storage', 'save', 'step-flow2', preset]);
  run(['runtime', 'start', 'step-flow2']);
  const artifacts = JSON.stringify({
    files: [{ path: 'a.md', type: 'spec', summary: 'A', keywords: [] }],
  });
  const r = run(['step', 'finish', artifacts]);
  assert.strictEqual(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.done, false);
  assert.strictEqual(parsed.completed, 'fix:one');
  assert.strictEqual(parsed.next, 'fix:two');
  assert.match(parsed.wrapper, /Step 2\/2: fix:two/);
});

test('step finish returns done:true on last step without wrapper', () => {
  const skillFile = path.join(TEST_PROJECT, 'fix-step3.md');
  fs.writeFileSync(skillFile, '# Step Fixture\n');
  const preset = JSON.stringify({
    steps: [{ order: 1, skillId: 'fix:only', checkpoint: 'auto', skillPath: skillFile }],
  });
  run(['storage', 'save', 'step-flow3', preset]);
  run(['runtime', 'start', 'step-flow3']);
  const r = run(['step', 'finish', JSON.stringify({ files: [] })]);
  const parsed = JSON.parse(r.stdout);
  assert.strictEqual(parsed.done, true);
  assert.strictEqual(parsed.wrapper, undefined);
});

test('context-bridge generate emits wrapper markdown for active session', () => {
  const skillFile = path.join(TEST_PROJECT, 'fixture-skill.md');
  fs.writeFileSync(skillFile, '# Fixture Skill\n\nDo the thing.\n');
  const preset = JSON.stringify({
    steps: [{ order: 1, skillId: 'fix:one', checkpoint: 'auto', skillPath: skillFile }],
  });
  run(['storage', 'save', 'cb-flow', preset]);
  run(['runtime', 'start', 'cb-flow']);
  const r = run(['context-bridge', 'generate']);
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /# Weave Workflow: cb-flow/);
  assert.match(r.stdout, /Step 1\/1: fix:one/);
  assert.match(r.stdout, /# Fixture Skill/);
});
