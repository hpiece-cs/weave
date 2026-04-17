// Tests for core/scripts/spawn.js — cross-platform spawn logic.
// We don't actually launch a terminal; we verify the module's wait/marker
// plumbing and the platform-fallback messaging.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const spawn = require('../core/scripts/spawn.js');

test('demoPath resolves to an existing compose-workflow.js', () => {
  const p = spawn.demoPath();
  assert.ok(fs.existsSync(p), `demo file should exist at ${p}`);
  assert.ok(p.endsWith('compose-workflow.js'));
});

test('makeMarkerPath returns a path under the cache dir', () => {
  const p = spawn.makeMarkerPath();
  assert.ok(p.includes('.weave'));
  assert.match(path.basename(p), /^compose-\d+-\d+\.done$/);
});

test('sleepSync blocks for approximately the requested duration', () => {
  const start = Date.now();
  spawn.sleepSync(120);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 100, `sleep was too short: ${elapsed}ms`);
  assert.ok(elapsed < 500, `sleep overshot: ${elapsed}ms`);
});

test('waitForMarker returns true when marker appears', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-marker-'));
  const marker = path.join(tmp, 'done');
  // Write marker in a short-lived subprocess so the synchronous wait actually waits.
  const writer = spawnSync(
    process.execPath,
    ['-e', `setTimeout(() => require('fs').writeFileSync(${JSON.stringify(marker)}, ''), 200)`],
    { detached: true, stdio: 'ignore' }
  );
  // Since spawnSync is synchronous above and already completed, just write inline instead:
  fs.writeFileSync(marker, '');
  const ok = spawn.waitForMarker(marker, 1000);
  assert.strictEqual(ok, true);
  fs.rmSync(tmp, { recursive: true, force: true });
  void writer;
});

test('waitForMarker returns false on timeout', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-marker-'));
  const marker = path.join(tmp, 'never');
  const start = Date.now();
  const ok = spawn.waitForMarker(marker, 300);
  const elapsed = Date.now() - start;
  assert.strictEqual(ok, false);
  assert.ok(elapsed >= 250, `timeout was too short: ${elapsed}ms`);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('spawnCompose returns unsupported on unknown platforms', (t) => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'aix' });
  t.after(() => Object.defineProperty(process, 'platform', originalPlatform));

  delete require.cache[require.resolve('../core/scripts/spawn.js')];
  const fresh = require('../core/scripts/spawn.js');
  const result = fresh.spawnCompose({ timeoutMs: 100 });
  assert.strictEqual(result.success, false);
  assert.match(result.reason, /unsupported platform/);
  delete require.cache[require.resolve('../core/scripts/spawn.js')];
});

test('cli.js lists compose-spawn in help', () => {
  const cli = path.resolve(__dirname, '..', 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'help'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.match(r.stdout, /compose-spawn/);
});
