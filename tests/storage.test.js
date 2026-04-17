// Tests for core/scripts/storage.js
// Spec: docs/src-notes/core_scripts_storage.md

'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Isolate both WEAVE_HOME (global) and a project cwd before requiring paths/storage.
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-storage-home-'));
const TEST_PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-storage-proj-'));
process.env.WEAVE_HOME = TEST_HOME;

const ORIGINAL_CWD = process.cwd();

const paths = require('../core/scripts/paths.js');
const storage = require('../core/scripts/storage.js');

before(() => {
  process.chdir(TEST_PROJECT);
});

after(() => {
  process.chdir(ORIGINAL_CWD);
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.rmSync(TEST_PROJECT, { recursive: true, force: true });
});

beforeEach(() => {
  fs.rmSync(paths.WORKFLOWS_DIR, { recursive: true, force: true });
  fs.rmSync(paths.projectWorkflowsDir(TEST_PROJECT), { recursive: true, force: true });
});

// ── save (default scope = project) ──────────────────

test('save writes file at projectWorkflowsDir/<name>.json by default', () => {
  storage.save('flow-a', { steps: [] });
  assert.ok(fs.existsSync(path.join(paths.projectWorkflowsDir(TEST_PROJECT), 'flow-a.json')));
  assert.ok(!fs.existsSync(path.join(paths.WORKFLOWS_DIR, 'flow-a.json')));
});

test('save with scope:global writes to WORKFLOWS_DIR', () => {
  storage.save('flow-g', { steps: [] }, { scope: 'global' });
  assert.ok(fs.existsSync(path.join(paths.WORKFLOWS_DIR, 'flow-g.json')));
  assert.ok(!fs.existsSync(path.join(paths.projectWorkflowsDir(TEST_PROJECT), 'flow-g.json')));
});

test('save returns { path, scope }', () => {
  const r = storage.save('flow-r', { steps: [] });
  assert.strictEqual(r.scope, 'project');
  assert.ok(r.path.endsWith('flow-r.json'));
});

test('save accepts object and JSON string', () => {
  storage.save('as-obj', { steps: [{ order: 1 }] });
  storage.save('as-str', JSON.stringify({ steps: [{ order: 2 }] }));
  assert.deepStrictEqual(storage.load('as-obj').steps, [{ order: 1 }]);
  assert.deepStrictEqual(storage.load('as-str').steps, [{ order: 2 }]);
});

test('save auto-sets schemaVersion/created/updated', () => {
  storage.save('meta', { steps: [] });
  const preset = storage.load('meta');
  assert.strictEqual(preset.schemaVersion, storage.CURRENT_SCHEMA);
  assert.ok(typeof preset.created === 'string' && preset.created.length > 0);
  assert.ok(typeof preset.updated === 'string' && preset.updated.length > 0);
});

test('re-save preserves created, updates updated', async () => {
  storage.save('stamps', { steps: [] });
  const first = storage.load('stamps');
  await new Promise((r) => setTimeout(r, 10));
  storage.save('stamps', { steps: [{ order: 1 }] });
  const second = storage.load('stamps');
  assert.strictEqual(second.created, first.created);
  assert.notStrictEqual(second.updated, first.updated);
});

// ── load ────────────────────────────────────────────

test('load returns parsed preset with _scope', () => {
  storage.save('loadable', { steps: [{ order: 1 }], tools: ['x'] });
  const preset = storage.load('loadable');
  assert.strictEqual(preset.name, 'loadable');
  assert.strictEqual(preset._scope, 'project');
  assert.deepStrictEqual(preset.tools, ['x']);
});

test('load throws on missing preset', () => {
  assert.throws(() => storage.load('does-not-exist'), /not found/i);
});

test('load prefers project when preset exists in both scopes', () => {
  storage.save('dup', { steps: [{ order: 1 }] }, { scope: 'global' });
  storage.save('dup', { steps: [{ order: 2 }] }, { scope: 'project' });
  const preset = storage.load('dup');
  assert.strictEqual(preset._scope, 'project');
  assert.strictEqual(preset.steps[0].order, 2);
});

test('load with explicit scope:global reads global even if project exists', () => {
  storage.save('dup2', { steps: [{ order: 1 }] }, { scope: 'global' });
  storage.save('dup2', { steps: [{ order: 2 }] }, { scope: 'project' });
  const g = storage.load('dup2', { scope: 'global' });
  assert.strictEqual(g._scope, 'global');
  assert.strictEqual(g.steps[0].order, 1);
});

test('load falls through to global when project missing', () => {
  storage.save('glo-only', { steps: [{ order: 9 }] }, { scope: 'global' });
  const preset = storage.load('glo-only');
  assert.strictEqual(preset._scope, 'global');
  assert.strictEqual(preset.steps[0].order, 9);
});

test('load auto-migrates preset without schemaVersion', () => {
  fs.mkdirSync(paths.projectWorkflowsDir(TEST_PROJECT), { recursive: true });
  fs.writeFileSync(
    path.join(paths.projectWorkflowsDir(TEST_PROJECT), 'legacy.json'),
    JSON.stringify({ name: 'legacy', steps: [] })
  );
  const preset = storage.load('legacy');
  assert.strictEqual(preset.schemaVersion, storage.CURRENT_SCHEMA);
});

// ── list ────────────────────────────────────────────

test('list returns names from both scopes (de-duped)', () => {
  storage.save('one', { steps: [] });
  storage.save('two', { steps: [] }, { scope: 'global' });
  storage.save('both', { steps: [] }, { scope: 'project' });
  storage.save('both', { steps: [] }, { scope: 'global' });
  const names = storage.list().sort();
  assert.deepStrictEqual(names, ['both', 'one', 'two']);
});

test('list returns empty when no workflows exist in either scope', () => {
  assert.deepStrictEqual(storage.list(), []);
});

test('listWithScope annotates each name with its scope, project wins', () => {
  storage.save('p-only', { steps: [] }, { scope: 'project' });
  storage.save('g-only', { steps: [] }, { scope: 'global' });
  storage.save('both', { steps: [] }, { scope: 'project' });
  storage.save('both', { steps: [] }, { scope: 'global' });
  const entries = storage.listWithScope().sort((a, b) => a.name.localeCompare(b.name));
  assert.deepStrictEqual(entries, [
    { name: 'both', scope: 'project' },
    { name: 'g-only', scope: 'global' },
    { name: 'p-only', scope: 'project' },
  ]);
});

// ── remove ──────────────────────────────────────────

test('remove deletes project preset by default', () => {
  storage.save('rm-p', { steps: [] });
  storage.remove('rm-p');
  assert.ok(!fs.existsSync(path.join(paths.projectWorkflowsDir(TEST_PROJECT), 'rm-p.json')));
});

test('remove with scope:global deletes only global', () => {
  storage.save('rm-g', { steps: [] }, { scope: 'project' });
  storage.save('rm-g', { steps: [] }, { scope: 'global' });
  storage.remove('rm-g', { scope: 'global' });
  assert.ok(!fs.existsSync(path.join(paths.WORKFLOWS_DIR, 'rm-g.json')));
  assert.ok(fs.existsSync(path.join(paths.projectWorkflowsDir(TEST_PROJECT), 'rm-g.json')));
});

test('remove without scope prefers project', () => {
  storage.save('rm-both', { steps: [] }, { scope: 'project' });
  storage.save('rm-both', { steps: [] }, { scope: 'global' });
  storage.remove('rm-both');
  assert.ok(!fs.existsSync(path.join(paths.projectWorkflowsDir(TEST_PROJECT), 'rm-both.json')));
  assert.ok(fs.existsSync(path.join(paths.WORKFLOWS_DIR, 'rm-both.json')));
});

test('remove throws on missing preset', () => {
  assert.throws(() => storage.remove('ghost'), /not found/i);
});

// ── clone ───────────────────────────────────────────

test('clone copies preset with fresh created timestamp (project → project)', async () => {
  storage.save('src', { steps: [{ order: 1 }], tools: ['t'] });
  const src = storage.load('src');
  await new Promise((r) => setTimeout(r, 10));
  storage.clone('src', 'dst');
  const dst = storage.load('dst');
  assert.strictEqual(dst.name, 'dst');
  assert.deepStrictEqual(dst.steps, src.steps);
  assert.deepStrictEqual(dst.tools, src.tools);
  assert.notStrictEqual(dst.created, src.created);
  assert.strictEqual(dst._scope, 'project');
});

test('clone can cross scopes (global → project)', () => {
  storage.save('g-src', { steps: [{ order: 1 }] }, { scope: 'global' });
  storage.clone('g-src', 'p-dst', { fromScope: 'global', toScope: 'project' });
  const dst = storage.load('p-dst');
  assert.strictEqual(dst._scope, 'project');
  assert.strictEqual(dst.steps[0].order, 1);
});

// ── migratePreset ───────────────────────────────────

test('migratePreset adds schemaVersion when absent', () => {
  const out = storage.migratePreset({ name: 'x', steps: [] });
  assert.strictEqual(out.schemaVersion, storage.CURRENT_SCHEMA);
});

test('migratePreset is idempotent when schemaVersion already set', () => {
  const input = { name: 'x', schemaVersion: storage.CURRENT_SCHEMA, steps: [] };
  const out = storage.migratePreset(input);
  assert.strictEqual(out, input);
});
