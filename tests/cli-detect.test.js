// Tests for core/scripts/cli-detect.js — env-var based CLI detection.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { detectRunningCli, KNOWN_CLIS, FALLBACK } = require('../core/scripts/cli-detect.js');

test('detectRunningCli returns "claude" on CLAUDECODE=1', () => {
  assert.strictEqual(detectRunningCli({ CLAUDECODE: '1' }), 'claude');
});

test('detectRunningCli returns "claude" on CLAUDE_CODE_ENTRYPOINT', () => {
  assert.strictEqual(detectRunningCli({ CLAUDE_CODE_ENTRYPOINT: 'cli' }), 'claude');
});

test('detectRunningCli returns "opencode" on OPENCODE=1', () => {
  assert.strictEqual(detectRunningCli({ OPENCODE: '1' }), 'opencode');
});

test('detectRunningCli returns "opencode" on OPENCODE_PID', () => {
  assert.strictEqual(detectRunningCli({ OPENCODE_PID: '12345' }), 'opencode');
});

test('detectRunningCli returns "codex" on CODEX_THREAD_ID', () => {
  assert.strictEqual(detectRunningCli({ CODEX_THREAD_ID: 'abc-123' }), 'codex');
});

test('detectRunningCli returns "gemini" on GEMINI_CLI=1', () => {
  assert.strictEqual(detectRunningCli({ GEMINI_CLI: '1' }), 'gemini');
});

test('detectRunningCli returns "copilot" on COPILOT_AGENT_SESSION_ID', () => {
  assert.strictEqual(detectRunningCli({ COPILOT_AGENT_SESSION_ID: 'sess-x' }), 'copilot');
});

test('detectRunningCli fallback is "claude" when no signal present', () => {
  assert.strictEqual(detectRunningCli({}), FALLBACK);
  assert.strictEqual(FALLBACK, 'claude');
});

test('WEAVE_CLI override beats any env signal', () => {
  // Multiple signals + override — override wins
  assert.strictEqual(
    detectRunningCli({ CLAUDECODE: '1', OPENCODE: '1', WEAVE_CLI: 'codex' }),
    'codex'
  );
});

test('WEAVE_CLI="all" is accepted as-is', () => {
  assert.strictEqual(detectRunningCli({ WEAVE_CLI: 'all' }), 'all');
});

test('WEAVE_CLI with unknown value falls back to "claude" (does not crash)', () => {
  assert.strictEqual(detectRunningCli({ WEAVE_CLI: 'bogus-cli' }), 'claude');
});

test('SIGNALS priority — claude beats opencode when both present (deterministic)', () => {
  // Pathological case: both CLAUDECODE and OPENCODE set.
  // SIGNALS list has claude first → claude wins.
  assert.strictEqual(
    detectRunningCli({ CLAUDECODE: '1', OPENCODE: '1' }),
    'claude'
  );
});

test('KNOWN_CLIS contains the five supported CLIs', () => {
  assert.deepStrictEqual(
    KNOWN_CLIS.sort(),
    ['claude', 'codex', 'copilot', 'gemini', 'opencode']
  );
});
