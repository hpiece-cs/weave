// Tests for core/scripts/runtime.js
// Spec: docs/src-notes/core_scripts_runtime.md

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-runtime-home-'));
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-runtime-proj-'));
process.env.WEAVE_HOME = TEST_HOME;

const ORIGINAL_CWD = process.cwd();

const paths = require('../core/scripts/paths.js');
const storage = require('../core/scripts/storage.js');
const runtime = require('../core/scripts/runtime.js');

before(() => {
  process.chdir(TEST_PROJECT);
});

after(() => {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(paths.projectWeaveDir(TEST_PROJECT), { recursive: true, force: true });
  fs.rmSync(paths.WORKFLOWS_DIR, { recursive: true, force: true });
  if (fs.existsSync(paths.GLOBAL_CONFIG)) fs.unlinkSync(paths.GLOBAL_CONFIG);
});

function makePreset(name, stepOverrides = []) {
  const defaults = [
    { order: 1, skillId: 'superpowers:brainstorming', checkpoint: 'auto', interactive: true },
    { order: 2, skillId: 'superpowers:writing-plans', checkpoint: 'auto', interactive: true },
    { order: 3, skillId: 'superpowers:executing-plans', checkpoint: 'verify', interactive: false },
  ];
  const steps = stepOverrides.length ? stepOverrides : defaults;
  storage.save(name, { steps, tools: ['gsd:debug'] });
}

// ── Lock ────────────────────────────────────────────

test('acquireLock creates .lock atomically with wx flag', () => {
  const dir = paths.projectWeaveDir(TEST_PROJECT);
  fs.mkdirSync(dir, { recursive: true });
  const ok = runtime.acquireLock(dir);
  assert.strictEqual(ok, true);
  assert.ok(fs.existsSync(path.join(dir, '.lock')));
});

test('acquireLock fails when another fresh lock exists', () => {
  const dir = paths.projectWeaveDir(TEST_PROJECT);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.lock'),
    JSON.stringify({ pid: 99999, startedAt: new Date().toISOString() })
  );
  const ok = runtime.acquireLock(dir);
  assert.strictEqual(ok, false);
});

test('acquireLock reclaims stale lock older than 30s', () => {
  const dir = paths.projectWeaveDir(TEST_PROJECT);
  fs.mkdirSync(dir, { recursive: true });
  const staleAt = new Date(Date.now() - 60_000).toISOString();
  fs.writeFileSync(
    path.join(dir, '.lock'),
    JSON.stringify({ pid: 99999, startedAt: staleAt })
  );
  const ok = runtime.acquireLock(dir);
  assert.strictEqual(ok, true);
});

test('releaseLock removes .lock', () => {
  const dir = paths.projectWeaveDir(TEST_PROJECT);
  fs.mkdirSync(dir, { recursive: true });
  runtime.acquireLock(dir);
  runtime.releaseLock(dir);
  assert.ok(!fs.existsSync(path.join(dir, '.lock')));
});

// ── Config ──────────────────────────────────────────

test('loadConfig deep-merges global → project → workflow', () => {
  fs.mkdirSync(paths.WEAVE_HOME, { recursive: true });
  fs.writeFileSync(paths.GLOBAL_CONFIG, JSON.stringify({ securityScan: false, compactionRestore: 'full' }));
  fs.mkdirSync(paths.projectWeaveDir(TEST_PROJECT), { recursive: true });
  fs.writeFileSync(paths.projectConfig(TEST_PROJECT), JSON.stringify({ updateCheck: false }));
  const cfg = runtime.loadConfig({ compactionRestore: 'light' });
  assert.strictEqual(cfg.securityScan, false);
  assert.strictEqual(cfg.updateCheck, false);
  assert.strictEqual(cfg.compactionRestore, 'light');
});

test('loadConfig applies defaults when all layers absent', () => {
  const cfg = runtime.loadConfig();
  assert.strictEqual(cfg.defaultWorkflow, null);
  assert.strictEqual(cfg.securityScan, true);
  assert.strictEqual(cfg.updateCheck, true);
  assert.strictEqual(cfg.compactionRestore, 'auto');
});

// ── Session helpers ─────────────────────────────────

test('loadSession returns null when session.json missing', () => {
  assert.strictEqual(runtime.loadSession(), null);
});

test('saveSession writes session.json', () => {
  runtime.saveSession({ workflowName: 'w', steps: [] });
  assert.ok(fs.existsSync(paths.sessionPath(TEST_PROJECT)));
  const loaded = runtime.loadSession();
  assert.strictEqual(loaded.workflowName, 'w');
});

// ── Lifecycle ───────────────────────────────────────

test('start loads preset, acquires lock, marks step[0] in_progress', () => {
  makePreset('flow-a');
  const session = runtime.start('flow-a');
  assert.strictEqual(session.workflowName, 'flow-a');
  assert.strictEqual(session.currentStep, 0);
  assert.strictEqual(session.steps[0].status, 'in_progress');
  assert.ok(session.steps[0].startedAt);
  assert.strictEqual(session.steps[1].status, 'pending');
  assert.ok(fs.existsSync(paths.sessionPath(TEST_PROJECT)));
  assert.ok(fs.existsSync(paths.lockPath(TEST_PROJECT)));
});

test('end archives session and releases lock', () => {
  makePreset('flow-end');
  runtime.start('flow-end');
  const result = runtime.end();
  assert.ok(result.archivedTo);
  assert.ok(fs.existsSync(result.archivedTo));
  assert.ok(!fs.existsSync(paths.sessionPath(TEST_PROJECT)));
  assert.ok(!fs.existsSync(paths.lockPath(TEST_PROJECT)));
});

// ── Step ops ────────────────────────────────────────

test('advance marks current completed and next in_progress', () => {
  makePreset('flow-adv');
  runtime.start('flow-adv');
  const result = runtime.advance();
  assert.strictEqual(result.done, false);
  assert.strictEqual(result.completed, 'superpowers:brainstorming');
  assert.strictEqual(result.next, 'superpowers:writing-plans');
  assert.strictEqual(result.step, '2/3');
  const session = runtime.loadSession();
  assert.strictEqual(session.steps[0].status, 'completed');
  assert.ok(session.steps[0].completedAt);
  assert.strictEqual(session.steps[1].status, 'in_progress');
  assert.strictEqual(session.currentStep, 1);
});

test('advance returns done:true on last step', () => {
  makePreset('flow-done');
  runtime.start('flow-done');
  runtime.advance();
  runtime.advance();
  const result = runtime.advance();
  assert.strictEqual(result.done, true);
  assert.strictEqual(result.next, null);
});

test('rollback reverts current to pending and previous to in_progress', () => {
  makePreset('flow-rb');
  runtime.start('flow-rb');
  runtime.advance();
  const result = runtime.rollback();
  assert.strictEqual(result.rolledBackTo, 0);
  assert.strictEqual(result.skillId, 'superpowers:brainstorming');
  assert.match(result.warning, /파일/);
  const session = runtime.loadSession();
  assert.strictEqual(session.steps[1].status, 'pending');
  assert.deepStrictEqual(session.steps[1].outputs, []);
  assert.strictEqual(session.steps[0].status, 'in_progress');
  assert.strictEqual(session.currentStep, 0);
});

test('rollback throws on first step', () => {
  makePreset('flow-rb-first');
  runtime.start('flow-rb-first');
  assert.throws(() => runtime.rollback(), /first step|cannot rollback/i);
});

test('registerArtifacts merges Claude-reported and git-detected', () => {
  makePreset('flow-reg');
  runtime.start('flow-reg');
  const result = runtime.registerArtifacts({
    files: [{ path: 'docs/a.md', type: 'spec', summary: 'A', keywords: ['x'] }],
  });
  assert.strictEqual(result.registered, 1);
  const session = runtime.loadSession();
  assert.strictEqual(session.steps[0].outputs[0].path, 'docs/a.md');
  assert.strictEqual(session.steps[0].outputs[0].source, 'claude-reported');
});

test('gitSnapshot captures uncommitted/staged/untracked', () => {
  const gitProj = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-git-'));
  try {
    execSync('git init -q', { cwd: gitProj });
    execSync('git config user.email "t@t"; git config user.name "t"', { cwd: gitProj, shell: '/bin/bash' });
    fs.writeFileSync(path.join(gitProj, 'u.txt'), 'hi');
    process.chdir(gitProj);
    makePreset('flow-git');
    runtime.start('flow-git');
    const snap = runtime.gitSnapshot();
    assert.ok(Array.isArray(snap.untracked));
    assert.ok(snap.untracked.includes('u.txt'));
  } finally {
    process.chdir(TEST_PROJECT);
    fs.rmSync(gitProj, { recursive: true, force: true });
  }
});

// ── Queries ─────────────────────────────────────────

test('status returns {active:false} when no session', () => {
  const s = runtime.status();
  assert.strictEqual(s.active, false);
});

test('status returns progress when session active', () => {
  makePreset('flow-status');
  runtime.start('flow-status');
  const s = runtime.status();
  assert.strictEqual(s.active, true);
  assert.strictEqual(s.workflowName, 'flow-status');
  assert.strictEqual(s.currentStep, 'superpowers:brainstorming');
  assert.strictEqual(s.step, '1/3');
});

test('history lists completed step outputs', () => {
  makePreset('flow-hist');
  runtime.start('flow-hist');
  runtime.registerArtifacts({ files: [{ path: 'a.md', type: 'spec', summary: 'A', keywords: [] }] });
  runtime.advance();
  const h = runtime.history();
  assert.strictEqual(h.length, 1);
  assert.strictEqual(h[0].skillId, 'superpowers:brainstorming');
  assert.strictEqual(h[0].outputs[0].path, 'a.md');
});

test('ref filters by keyword: / step: / type: prefixes', () => {
  makePreset('flow-ref');
  runtime.start('flow-ref');
  runtime.registerArtifacts({
    files: [{ path: 'a.md', type: 'spec', summary: 's', keywords: ['auth', 'dash'] }],
  });
  runtime.advance();
  runtime.registerArtifacts({
    files: [{ path: 'b.md', type: 'arch', summary: 's', keywords: ['api'] }],
  });
  assert.strictEqual(runtime.ref('keyword:auth').length, 1);
  assert.strictEqual(runtime.ref('keyword:auth')[0].path, 'a.md');
  assert.strictEqual(runtime.ref('type:arch').length, 1);
  assert.strictEqual(runtime.ref('step:1').length, 1);
  assert.strictEqual(runtime.ref('step:1')[0].path, 'a.md');
});

test('ref without prefix searches across path + summary + keywords', () => {
  makePreset('flow-ref2');
  runtime.start('flow-ref2');
  runtime.registerArtifacts({
    files: [{ path: 'docs/foo.md', type: 'spec', summary: 'about bar', keywords: ['baz'] }],
  });
  assert.strictEqual(runtime.ref('foo').length, 1);
  assert.strictEqual(runtime.ref('bar').length, 1);
  assert.strictEqual(runtime.ref('baz').length, 1);
  assert.strictEqual(runtime.ref('qux').length, 0);
});

test('note appends to current step', () => {
  makePreset('flow-note');
  runtime.start('flow-note');
  const r = runtime.note('think about auth');
  assert.strictEqual(r.added, true);
  assert.strictEqual(r.totalNotes, 1);
  const session = runtime.loadSession();
  assert.strictEqual(session.notes[0].text, 'think about auth');
  assert.strictEqual(session.notes[0].step, 1);
});

test('restore returns light vs full context per compactionAware', () => {
  makePreset('flow-restore');
  runtime.start('flow-restore');
  runtime.registerArtifacts({ files: [{ path: 'a.md', type: 'spec', summary: 'A', keywords: [] }] });
  runtime.advance();
  const ctx = runtime.restore();
  assert.ok(ctx.session);
  assert.strictEqual(ctx.session.workflowName, 'flow-restore');
  assert.ok(['light', 'full'].includes(ctx.mode));
  assert.ok(Array.isArray(ctx.previousOutputs));
});

test('checkUpdate detects channel (marketplace/github/manual)', () => {
  const info = runtime.checkUpdate();
  assert.ok(['marketplace', 'github', 'manual'].includes(info.channel));
  assert.ok(typeof info.current === 'string');
});

test('isGitRepo detects .git presence', () => {
  assert.strictEqual(runtime.isGitRepo(), false);
  const gitProj = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-isgit-'));
  try {
    execSync('git init -q', { cwd: gitProj });
    process.chdir(gitProj);
    assert.strictEqual(runtime.isGitRepo(), true);
  } finally {
    process.chdir(TEST_PROJECT);
    fs.rmSync(gitProj, { recursive: true, force: true });
  }
});
