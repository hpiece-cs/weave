// End-to-end demo test: demo/run-workflow.js walks a preset from start to end.

'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEMO = path.resolve(__dirname, '..', 'demo', 'run-workflow.js');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-demo-home-'));
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-demo-proj-'));

after(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
});

function run(args) {
  return spawnSync(process.execPath, [DEMO, ...args], {
    cwd: TEST_PROJECT,
    env: { ...process.env, WEAVE_HOME: TEST_HOME, NO_COLOR: '1' },
    encoding: 'utf8',
  });
}

test('run-workflow.js walks a fixture preset start→advance→end', () => {
  const r = run([]);
  if (r.status !== 0) {
    console.error('STDOUT:', r.stdout);
    console.error('STDERR:', r.stderr);
  }
  assert.strictEqual(r.status, 0, r.stderr);

  // Expected milestones in stdout
  assert.match(r.stdout, /demo-run-workflow/);
  assert.match(r.stdout, /Step 1\/3/);
  assert.match(r.stdout, /Step 2\/3/);
  assert.match(r.stdout, /Step 3\/3/);
  assert.match(r.stdout, /Weave Workflow:/);
  assert.match(r.stdout, /advance.*done/is);
  assert.match(r.stdout, /archived/i);

  // Session cleaned up, archive exists
  const sessionFile = path.join(TEST_PROJECT, '.weave', 'session.json');
  assert.ok(!fs.existsSync(sessionFile), 'session.json should be removed after end');
  const archiveDir = path.join(TEST_PROJECT, '.weave', 'archive');
  assert.ok(fs.existsSync(archiveDir), 'archive dir should exist');
  assert.ok(fs.readdirSync(archiveDir).length > 0, 'archive should contain session');
});
