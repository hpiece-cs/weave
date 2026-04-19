#!/usr/bin/env node
// run-workflow.js — End-to-end demo of the weave run loop (non-interactive).
//
// Scripts through: preset save → start → per-step (git-snapshot, context-bridge,
// simulated artifact-register, advance) → end (archive).
//
// Useful as:
//   - Smoke test that runtime + context-bridge + storage + guard chain e2e
//   - Reference for how SKILL.md files should drive the weave CLI
//
// Run: node demo/run-workflow.js
// Honors $WEAVE_HOME. Creates session state under $CWD/.weave/.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const storage = require('../core/scripts/storage.js');
const runtime = require('../core/scripts/runtime.js');
const guard = require('../core/scripts/guard.js');
const bridge = require('../core/scripts/context-bridge.js');

// ── ANSI (suppressed when NO_COLOR=1 or non-TTY) ────
const USE_COLOR = !process.env.NO_COLOR && process.stdout.isTTY;
const c = (code) => (s) => (USE_COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = c(1);
const dim = c(2);
const green = c(32);
const yellow = c(33);
const cyan = c(36);

const PRESET_NAME = 'demo-run-workflow';

function section(title) {
  console.log(`\n${bold(cyan(`── ${title} `))}${cyan('─'.repeat(Math.max(0, 60 - title.length)))}`);
}

function makeFixtureSkill(dir, name, body) {
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, body, 'utf8');
  return file;
}

function buildFixturePreset(skillsDir) {
  const s1 = makeFixtureSkill(
    skillsDir,
    'brainstorm',
    '# Fixture: Brainstorm\n\nDraft a short spec.\n'
  );
  const s2 = makeFixtureSkill(
    skillsDir,
    'plan',
    '# Fixture: Plan\n\nTurn the spec into a plan.\n'
  );
  const s3 = makeFixtureSkill(
    skillsDir,
    'execute',
    '# Fixture: Execute\n\nImplement the plan.\n'
  );

  return {
    name: PRESET_NAME,
    steps: [
      {
        order: 1,
        skillId: 'demo:brainstorm',
        checkpoint: 'auto',
        interactive: true,
        skillPath: s1,
      },
      {
        order: 2,
        skillId: 'demo:plan',
        checkpoint: 'auto',
        interactive: true,
        skillPath: s2,
        requiresOutputsFrom: [0],
      },
      {
        order: 3,
        skillId: 'demo:execute',
        checkpoint: 'verify',
        interactive: false,
        skillPath: s3,
        requiresOutputsFrom: [1],
      },
    ],
    tools: ['superpowers:systematic-debugging'],
  };
}

function showStatus(label) {
  const s = runtime.status();
  if (!s.active) {
    console.log(`  ${dim('status:')} ${yellow('inactive')}`);
    return;
  }
  console.log(
    `  ${dim('status:')} ${green(s.step)}  ${s.currentStep}  ${dim(`[${s.checkpoint}]`)}  ${dim(label || '')}`
  );
}

function snippet(text, lines = 6) {
  const split = text.split('\n');
  const head = split.slice(0, lines).join('\n');
  return split.length > lines ? `${head}\n${dim(`… (${split.length - lines} more lines)`)}` : head;
}

function runStep(stepIndex) {
  const session = runtime.loadSession();
  const step = session.steps[stepIndex];

  section(`Step ${stepIndex + 1}/${session.steps.length}: ${step.skillId}`);

  const g = guard.checkGuards(stepIndex, session);
  console.log(`  ${dim('guard:')} pass=${g.pass}  warnings=${JSON.stringify(g.warnings)}`);

  const snap = runtime.gitSnapshot();
  console.log(`  ${dim('gitSnapshot:')} ${snap ? JSON.stringify(snap) : '(not a git repo)'}`);

  const { wrapper, scanWarnings } = bridge.generate(session, stepIndex);
  console.log(`  ${dim('context-bridge wrapper preview:')}`);
  for (const line of snippet(wrapper, 5).split('\n')) console.log(`    ${line}`);
  if (scanWarnings.length) {
    console.log(`  ${yellow('scanWarnings:')} ${JSON.stringify(scanWarnings)}`);
  }

  const artifact = {
    files: [
      {
        path: `docs/demo-step${stepIndex + 1}.md`,
        type: 'demo',
        summary: `Output from ${step.skillId}`,
        keywords: ['demo', `step-${stepIndex + 1}`],
      },
    ],
  };
  const reg = runtime.registerArtifacts(artifact);
  console.log(`  ${dim('artifact-register:')} registered=${reg.registered}`);

  const adv = runtime.advance();
  console.log(
    `  ${dim('advance:')} completed=${adv.completed} next=${adv.next || '(end)'} step=${adv.step} done=${adv.done}`
  );

  const advice = bridge.getTransitionAdvice(runtime.loadSession());
  console.log(`  ${dim('transition:')} ${JSON.stringify(advice)}`);
}

function main() {
  section(`Weave e2e demo — ${PRESET_NAME}`);

  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-demo-skills-'));
  try {
    const preset = buildFixturePreset(fixtureDir);
    storage.save(PRESET_NAME, preset);
    console.log(`  ${dim('preset saved:')} ${PRESET_NAME}`);

    runtime.start(PRESET_NAME);
    showStatus('(after start)');

    const total = preset.steps.length;
    for (let i = 0; i < total; i++) {
      runStep(i);
    }

    section('End session');
    const end = runtime.end();
    console.log(`  ${dim('archived →')} ${end.archivedTo}`);
    showStatus('(after end)');

    console.log(`\n${green(bold('✓ e2e run complete.'))}`);
  } finally {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
    try {
      storage.remove(PRESET_NAME);
    } catch {
      /* already gone */
    }
  }
}

main();
