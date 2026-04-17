// Tests for core/scripts/guard.js
// Spec: docs/src-notes/core_scripts_guard.md

'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const guard = require('../core/scripts/guard.js');

test('checkGuards(0, session) always passes', () => {
  const session = { steps: [{ skillId: 'a', status: 'in_progress' }] };
  const result = guard.checkGuards(0, session);
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.warnings, []);
});

test('checkGuards honors step.requiresOutputsFrom when present', () => {
  const session = {
    steps: [
      { skillId: 'a', outputs: [{ path: 'x.txt' }] },
      { skillId: 'b', outputs: [] },
      { skillId: 'c', requiresOutputsFrom: [0] },
    ],
  };
  const result = guard.checkGuards(2, session);
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.warnings, []);
});

test('checkGuards falls back to previous step output check per defaults', () => {
  const session = {
    steps: [
      { skillId: 'a', outputs: [{ path: 'x.txt' }] },
      { skillId: 'b' },
    ],
  };
  const result = guard.checkGuards(1, session);
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(result.warnings, []);
});

test('checkGuards returns warnings array when prerequisites missing', () => {
  const session = {
    steps: [
      { skillId: 'a', outputs: [] },
      { skillId: 'b' },
    ],
  };
  const result = guard.checkGuards(1, session);
  assert.strictEqual(result.pass, false);
  assert.strictEqual(result.warnings.length, 1);
  assert.match(result.warnings[0], /step 1/i);
});

test('checkGuards with requiresOutputsFrom flags empty/missing outputs', () => {
  const session = {
    steps: [
      { skillId: 'a', outputs: [] },
      { skillId: 'b', outputs: [{ path: 'y.txt' }] },
      { skillId: 'c', requiresOutputsFrom: [0, 1] },
    ],
  };
  const result = guard.checkGuards(2, session);
  assert.strictEqual(result.pass, false);
  assert.strictEqual(result.warnings.length, 1);
  assert.match(result.warnings[0], /step 1/i);
});

test('loadDefaults reads guard-defaults.json', () => {
  const defaults = guard.loadDefaults();
  assert.strictEqual(typeof defaults, 'object');
  assert.strictEqual(defaults.defaults.requiresPreviousStepOutput, true);
});
