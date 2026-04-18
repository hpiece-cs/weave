#!/usr/bin/env node
// Unified CLI entry point. SKILL.md files call `node cli.js <subcommand> [args...]`.
// Spec: docs/superpowers/specs/2026-04-17-core-interface-spec.md

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const discover = require('./core/scripts/discover.js');
const storage = require('./core/scripts/storage.js');
const guard = require('./core/scripts/guard.js');
const runtime = require('./core/scripts/runtime.js');
const bridge = require('./core/scripts/context-bridge.js');
const spawn = require('./core/scripts/spawn.js');

function usage() {
  return [
    'Usage: weave <subcommand> [args...]',
    '',
    'Commands:',
    '  discover [--all] [--debug]',
    '  storage save <name> <json> [--scope=project|global]   (default: project)',
    '  storage load <name> [--scope=project|global]',
    '  storage list                                          (all names, de-duped)',
    '  storage list-scopes                                   ([{name, scope}] with project priority)',
    '  storage remove <name> [--scope=project|global]',
    '  storage clone <from> <to> [--from-scope=..] [--to-scope=..]',
    '  guard <stepIndex> <sessionJsonPath>',
    '  context-bridge generate [stepIndex] [--auto]',
    '  runtime <start|end|advance|rollback|artifact-register|git-snapshot|',
    '           status|history|debug|ref|note|restore|check-update|is-git-repo|',
    '           session-outline|find-skill|insert-step|skip-step> [args...]',
    '  compose-spawn',
    '  compose-pick [--session-checked=id1,id2,...]      (single-pick for edit-session)',
    '  step prepare [--auto]                                 (guard + git-snapshot + wrapper)',
    '  step finish <artifacts-json>                          (register + advance + next wrapper)',
    '  help',
    '',
  ].join('\n');
}

function printJson(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

function extractFlag(args, prefix) {
  const match = args.find((a) => a.startsWith(prefix));
  if (!match) return null;
  return match.slice(prefix.length);
}

function stripFlags(args) {
  return args.filter((a) => !a.startsWith('--'));
}

function dispatchStorage(args) {
  const scope = extractFlag(args, '--scope=');
  const fromScope = extractFlag(args, '--from-scope=');
  const toScope = extractFlag(args, '--to-scope=');
  const positional = stripFlags(args);
  const [op, ...rest] = positional;

  switch (op) {
    case 'save': {
      const [name, json] = rest;
      if (!name || !json) throw new Error('storage save requires <name> <json>');
      return storage.save(name, json, scope ? { scope } : {});
    }
    case 'load': {
      const [name] = rest;
      if (!name) throw new Error('storage load requires <name>');
      return storage.load(name, scope ? { scope } : {});
    }
    case 'list':
      return storage.list();
    case 'list-scopes':
      return storage.listWithScope();
    case 'remove': {
      const [name] = rest;
      if (!name) throw new Error('storage remove requires <name>');
      return { removed: name, ...storage.remove(name, scope ? { scope } : {}) };
    }
    case 'clone': {
      const [from, to] = rest;
      if (!from || !to) throw new Error('storage clone requires <from> <to>');
      const opts = {};
      if (fromScope) opts.fromScope = fromScope;
      if (toScope) opts.toScope = toScope;
      return storage.clone(from, to, opts);
    }
    default:
      throw new Error(`Unknown storage op: ${op}`);
  }
}

function dispatchGuard(args) {
  const [stepArg, sessionPath] = args;
  if (stepArg === undefined || !sessionPath) {
    throw new Error('guard requires <stepIndex> <sessionJsonPath>');
  }
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  return guard.checkGuards(Number(stepArg), session);
}

function dispatchRuntime(args) {
  const [subcmd, ...rest] = args;
  switch (subcmd) {
    case 'start':
      return runtime.start(rest[0], { auto: rest.includes('--auto') });
    case 'end':
      return runtime.end();
    case 'advance':
      return runtime.advance();
    case 'rollback':
      return runtime.rollback();
    case 'artifact-register':
      return runtime.registerArtifacts(rest[0]);
    case 'git-snapshot':
      return runtime.gitSnapshot();
    case 'status':
      return runtime.status();
    case 'history':
      return runtime.history();
    case 'debug':
      return runtime.debug();
    case 'ref':
      return runtime.ref(rest.join(' '));
    case 'note':
      return runtime.note(rest.join(' '));
    case 'restore':
      return runtime.restore();
    case 'check-update':
      return runtime.checkUpdate();
    case 'is-git-repo':
      return { value: runtime.isGitRepo() };
    // Edit-session family — /weave:edit-session 이 호출
    case 'session-outline':
      return runtime.sessionOutline();
    case 'find-skill':
      return runtime.findSkill(rest.join(' '));
    case 'insert-step': {
      const positional = rest.filter((a) => !a.startsWith('--'));
      const afterFlag = rest.find((a) => a.startsWith('--after='));
      const confirm = rest.includes('--confirm');
      const after = afterFlag ? Number(afterFlag.slice('--after='.length)) : null;
      return runtime.insertStep(positional[0], after, { confirm });
    }
    case 'skip-step':
      return runtime.skipStep(rest[0]);
    default:
      throw new Error(`Unknown runtime subcommand: ${subcmd}`);
  }
}

function dispatchStep(args) {
  const [op, ...rest] = args;
  switch (op) {
    case 'prepare': {
      const session = runtime.loadSession();
      if (!session) throw new Error('No active session');
      const stepIndex = session.currentStep;
      const autoFlag = rest.includes('--auto') || session.autoMode;
      const guardResult = guard.checkGuards(stepIndex, session);
      runtime.gitSnapshot();
      const fresh = runtime.loadSession();
      const bridgeResult = bridge.generate(fresh, stepIndex, { autoMode: autoFlag });
      return {
        step: `${stepIndex + 1}/${fresh.steps.length}`,
        skillId: fresh.steps[stepIndex].skillId,
        checkpoint: fresh.steps[stepIndex].checkpoint || 'auto',
        guard: guardResult,
        wrapper: bridgeResult.wrapper,
        scanWarnings: bridgeResult.scanWarnings,
      };
    }
    case 'finish': {
      const [artifactsJson] = rest;
      runtime.registerArtifacts(artifactsJson);
      const adv = runtime.advance();
      if (adv.done) return adv;
      const session = runtime.loadSession();
      const bridgeResult = bridge.generate(session, session.currentStep, {
        autoMode: session.autoMode,
      });
      return {
        ...adv,
        transition: bridge.getTransitionAdvice(session),
        wrapper: bridgeResult.wrapper,
        scanWarnings: bridgeResult.scanWarnings,
      };
    }
    default:
      throw new Error(`Unknown step op: ${op}`);
  }
}

function dispatchBridge(args) {
  const [op, ...rest] = args;
  if (op !== 'generate') throw new Error(`Unknown context-bridge op: ${op}`);
  const session = runtime.loadSession();
  if (!session) throw new Error('No active session');
  const stepArg = rest.find((a) => !a.startsWith('--'));
  const stepIndex = stepArg !== undefined ? Number(stepArg) : session.currentStep;
  const autoMode = rest.includes('--auto') || session.autoMode;
  const result = bridge.generate(session, stepIndex, { autoMode });
  process.stdout.write(result.wrapper);
  if (result.scanWarnings.length > 0) {
    process.stderr.write(
      `\n[weave] security scan warnings:\n${JSON.stringify(result.scanWarnings, null, 2)}\n`
    );
  }
  return null;
}

function main() {
  const [, , subcommand, ...args] = process.argv;

  if (!subcommand) {
    process.stderr.write(usage());
    process.exit(2);
  }

  if (subcommand === 'help' || subcommand === '--help' || subcommand === '-h') {
    process.stdout.write(usage());
    return;
  }

  try {
    switch (subcommand) {
      case 'discover': {
        const result = discover.discoverAll({
          workflowOnly: !args.includes('--all'),
          debug: args.includes('--debug'),
        });
        printJson(result);
        return;
      }
      case 'storage':
        printJson(dispatchStorage(args));
        return;
      case 'guard':
        printJson(dispatchGuard(args));
        return;
      case 'runtime':
        printJson(dispatchRuntime(args));
        return;
      case 'context-bridge':
        dispatchBridge(args);
        return;
      case 'compose-spawn': {
        const before = storage.list();
        const result = spawn.spawnCompose();
        const after = storage.list();
        const added = after.filter((n) => !before.includes(n));
        const removed = before.filter((n) => !after.includes(n));
        printJson({ ...result, added, removed });
        return;
      }
      case 'compose-pick': {
        // /weave:edit-session insert picker 용. 새 터미널 창에 compose-workflow 를
        // --single-pick 모드로 띄우고, 고른 스킬 ID 를 반환한다.
        // 옵션: --session-checked=id1,id2   (세션에 이미 있는 스킬 배지 표시)
        const sessionChecked = extractFlag(args, '--session-checked=');
        const ids = sessionChecked ? sessionChecked.split(',').filter(Boolean) : [];
        const result = spawn.spawnComposePicker(ids);
        printJson(result);
        return;
      }
      case 'step':
        printJson(dispatchStep(args));
        return;
      default:
        process.stderr.write(`Unknown command: ${subcommand}\n${usage()}`);
        process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}

main();

void path;
