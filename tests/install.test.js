// Tests for install.js — copies runtime to <weave-home>/bin/ and skills to <claude-skills>/weave-*/.

'use strict';

const { test, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const INSTALLER = path.resolve(__dirname, '..', 'install.js');
const REPO_ROOT = path.resolve(__dirname, '..');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-install-home-'));
const WEAVE_HOME = path.join(TEST_HOME, '.weave');
const CLAUDE_SKILLS = path.join(TEST_HOME, '.claude', 'skills');

after(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(WEAVE_HOME, { recursive: true, force: true });
  fs.rmSync(path.join(TEST_HOME, '.claude'), { recursive: true, force: true });
});

function install(extraEnv = {}) {
  return spawnSync(process.execPath, [INSTALLER], {
    cwd: REPO_ROOT,
    env: { ...process.env, HOME: TEST_HOME, WEAVE_HOME, ...extraEnv },
    encoding: 'utf8',
  });
}

test('install copies cli.js and core/** to <weave-home>/bin/', () => {
  const r = install();
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'cli.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'core', 'scripts', 'runtime.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'core', 'scripts', 'storage.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'core', 'scripts', 'context-bridge.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'core', 'references', 'guard-defaults.json')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'core', 'hooks', 'weave-statusline.js')));
});

test('install copies demo/** to <weave-home>/bin/demo/', () => {
  install();
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'demo', 'compose-workflow.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'demo', 'compose-tree.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'demo', 'compose-preview.js')));
  assert.ok(fs.existsSync(path.join(WEAVE_HOME, 'bin', 'demo', 'run-workflow.js')));
});

test('install copies each skill to <claude-skills>/weave-<name>/SKILL.md', () => {
  install();
  const sourceDir = path.join(REPO_ROOT, 'skills');
  const names = fs.readdirSync(sourceDir).filter((n) => {
    return fs.statSync(path.join(sourceDir, n)).isDirectory();
  });
  assert.ok(names.length >= 12, `expected 12+ skills, found ${names.length}`);
  for (const name of names) {
    const target = path.join(CLAUDE_SKILLS, `weave-${name}`, 'SKILL.md');
    assert.ok(fs.existsSync(target), `missing: ${target}`);
  }
});

test('install makes cli.js executable', () => {
  install();
  const cliPath = path.join(WEAVE_HOME, 'bin', 'cli.js');
  const mode = fs.statSync(cliPath).mode;
  assert.ok(mode & 0o100, 'cli.js should be executable by owner');
});

test('install prints summary to stdout', () => {
  const r = install();
  assert.match(r.stdout, /installed/i);
  assert.ok(r.stdout.includes(WEAVE_HOME));
  assert.ok(r.stdout.includes(CLAUDE_SKILLS));
});

test('install is idempotent (re-install overwrites without error)', () => {
  const r1 = install();
  assert.strictEqual(r1.status, 0);
  const cliPath = path.join(WEAVE_HOME, 'bin', 'cli.js');
  const stat1 = fs.statSync(cliPath);
  const r2 = install();
  assert.strictEqual(r2.status, 0);
  const stat2 = fs.statSync(cliPath);
  assert.ok(stat2.mtimeMs >= stat1.mtimeMs);
});

test('installed cli.js actually runs end-to-end', () => {
  install();
  const cliPath = path.join(WEAVE_HOME, 'bin', 'cli.js');
  const r = spawnSync(process.execPath, [cliPath, 'help'], {
    env: { ...process.env, HOME: TEST_HOME, WEAVE_HOME },
    encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /usage/i);
  assert.match(r.stdout, /discover/);
});

test('install honors $WEAVE_HOME override', () => {
  const customHome = path.join(TEST_HOME, 'custom-weave-dir');
  const r = install({ WEAVE_HOME: customHome });
  assert.strictEqual(r.status, 0);
  assert.ok(fs.existsSync(path.join(customHome, 'bin', 'cli.js')));
  assert.ok(r.stdout.includes(customHome));
});
