// Tests for core/scripts/paths.js
// Spec: docs/src-notes/core_scripts_paths.md

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const os = require('node:os');
const path = require('node:path');
const paths = require('../core/scripts/paths.js');

test('PLUGIN_ROOT resolves to weave repo root', () => {
  // tests/paths.test.js → path.resolve(__dirname, '..') === repo root
  assert.strictEqual(paths.PLUGIN_ROOT, path.resolve(__dirname, '..'));
});

test('WEAVE_HOME resolves to ~/.weave/', () => {
  assert.strictEqual(paths.WEAVE_HOME, path.join(os.homedir(), '.weave'));
});

test('WORKFLOWS_DIR resolves to ~/.weave/workflows/', () => {
  assert.strictEqual(
    paths.WORKFLOWS_DIR,
    path.join(os.homedir(), '.weave', 'workflows')
  );
});

test('CACHE_DIR resolves to ~/.weave/cache/', () => {
  assert.strictEqual(
    paths.CACHE_DIR,
    path.join(os.homedir(), '.weave', 'cache')
  );
});

test('GLOBAL_CONFIG resolves to ~/.weave/config.json', () => {
  assert.strictEqual(
    paths.GLOBAL_CONFIG,
    path.join(os.homedir(), '.weave', 'config.json')
  );
});

test('projectWeaveDir defaults to cwd', () => {
  assert.strictEqual(
    paths.projectWeaveDir(),
    path.join(process.cwd(), '.weave')
  );
});

test('projectWeaveDir honors explicit projectRoot', () => {
  const custom = '/tmp/weave-test-project';
  assert.strictEqual(paths.projectWeaveDir(custom), path.join(custom, '.weave'));
});

test('sessionPath/lockPath/archiveDir/projectConfig are rooted under projectWeaveDir', () => {
  const custom = '/tmp/weave-test-project';
  const weaveDir = path.join(custom, '.weave');
  assert.strictEqual(paths.sessionPath(custom), path.join(weaveDir, 'session.json'));
  assert.strictEqual(paths.lockPath(custom), path.join(weaveDir, '.lock'));
  assert.strictEqual(paths.archiveDir(custom), path.join(weaveDir, 'archive'));
  assert.strictEqual(paths.projectConfig(custom), path.join(weaveDir, 'config.json'));
});

test('WEAVE_HOME honors process.env.WEAVE_HOME override', () => {
  const original = process.env.WEAVE_HOME;
  const modulePath = require.resolve('../core/scripts/paths.js');

  try {
    process.env.WEAVE_HOME = '/custom/weave-root';
    delete require.cache[modulePath];
    const reloaded = require('../core/scripts/paths.js');
    assert.strictEqual(reloaded.WEAVE_HOME, '/custom/weave-root');
    assert.strictEqual(reloaded.WORKFLOWS_DIR, '/custom/weave-root/workflows');
  } finally {
    if (original === undefined) delete process.env.WEAVE_HOME;
    else process.env.WEAVE_HOME = original;
    delete require.cache[modulePath];
    require('../core/scripts/paths.js'); // restore shared cache
  }
});
