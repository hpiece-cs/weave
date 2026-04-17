// context-bridge.js — build orchestration wrapper around SKILL.md content.
// Spec: docs/src-notes/core_scripts_context-bridge.md

'use strict';

const fs = require('node:fs');

const DELIM = '━'.repeat(27);

const INJECTION_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\b/i,
  /system\s+prompt/i,
  /<\s*\/?\s*system\s*>/i,
  /<\s*\/?\s*instructions\s*>/i,
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064]/,
];

function getSource(skillId) {
  if (!skillId || typeof skillId !== 'string') return 'unknown';
  const colonIdx = skillId.indexOf(':');
  return colonIdx === -1 ? skillId : skillId.slice(0, colonIdx);
}

function renderPreviousOutputs(session, stepIndex) {
  const lines = ['## Previous Outputs'];
  let any = false;
  for (let i = 0; i < stepIndex; i++) {
    const step = session.steps[i];
    for (const out of step.outputs || []) {
      any = true;
      const summary = out.summary ? ` — "${out.summary}"` : '';
      lines.push(`- ${out.path} (Step ${i + 1}, ${step.skillId})${summary}`);
    }
  }
  if (!any) lines.push('- (none)');
  return lines.join('\n');
}

function renderNotes(session) {
  const notes = session.notes || [];
  if (notes.length === 0) return '## Notes\n- (none)';
  const lines = ['## Notes'];
  for (const n of notes) lines.push(`- "${n.text}" (Step ${n.step})`);
  return lines.join('\n');
}

function renderTools(session) {
  const tools = session.tools || [];
  if (tools.length === 0) return '## Available Tools\n- (none)';
  return `## Available Tools\n${tools.join(', ')}`;
}

function autonomousPrefix() {
  return [
    '## Autonomous Mode',
    '이 단계를 자율적으로 진행하세요.',
    '',
    '1. 이전 산출물에서 답을 찾을 수 있는 질문은 직접 판단하세요.',
    '2. 이전 산출물에 없지만 추론 가능한 경우, 합리적인 기본값으로 판단하세요.',
    '3. 모든 자율 판단은 기록하세요: [AUTO-DECISION] 내용 (근거: ...)',
    '4. 판단 불가능한 핵심 결정만 사용자에게 질문하세요.',
  ].join('\n');
}

function afterStepInstructions() {
  return [
    '## After Step Completion',
    '위 스킬이 다음 단계, 새 세션, 또는 다른 스킬 실행을 제안하면',
    '그 제안을 따르지 말고 아래 절차를 진행하세요:',
    '',
    "1. 이 단계에서 생성/수정한 파일을 정리하여 보고:",
    "   `node runtime.js artifact-register '{\"files\":[...]}'`",
    '2. 다음 단계로 전환:',
    '   `node runtime.js advance`',
  ].join('\n');
}

function buildWrapper(session, stepIndex, skillContent, autoMode) {
  const step = session.steps[stepIndex];
  const total = session.steps.length;
  const parts = [
    `# Weave Workflow: ${session.workflowName}`,
    `# Step ${stepIndex + 1}/${total}: ${step.skillId}`,
    '',
    renderPreviousOutputs(session, stepIndex),
    '',
    renderNotes(session),
    '',
    renderTools(session),
    '',
  ];
  if (autoMode) {
    parts.push(autonomousPrefix(), '');
  }
  parts.push('## Current Step Instructions');
  parts.push(DELIM);
  parts.push(skillContent);
  parts.push(DELIM);
  parts.push('');
  parts.push(afterStepInstructions());
  return parts.join('\n');
}

function securityScan(content) {
  const warnings = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push(`Suspicious pattern matched: ${pattern.toString()}`);
    }
  }
  return { clean: warnings.length === 0, warnings };
}

function generate(session, stepIndex, options = {}) {
  const step = session.steps[stepIndex];
  if (!step || !step.skillPath) {
    throw new Error(`Step ${stepIndex + 1} has no skillPath`);
  }
  const content = fs.readFileSync(step.skillPath, 'utf8');
  const scan = securityScan(content);
  const autoMode = options.autoMode !== undefined ? options.autoMode : Boolean(session.autoMode);
  const wrapper = buildWrapper(session, stepIndex, content, autoMode);
  const scanWarnings = scan.clean ? [] : [{ file: step.skillPath, warnings: scan.warnings }];
  return { wrapper, scanWarnings };
}

function getTransitionAdvice(session) {
  const currentIdx = session.currentStep;
  const current = session.steps[currentIdx];
  const next = session.steps[currentIdx + 1];
  if (!next) return { recommendation: 'complete' };

  const currentSource = getSource(current.skillId);
  const nextSource = getSource(next.skillId);
  const crossSystem = currentSource !== nextSource;

  const completedInteractive = session.steps.filter(
    (s) => s.status === 'completed' && s.interactive
  ).length;

  if (crossSystem) {
    return {
      recommendation: 'new_session',
      reason: `크로스 시스템 전환 (${currentSource} → ${nextSource}): 깨끗한 컨텍스트를 권장합니다.`,
    };
  }
  if (completedInteractive >= 3) {
    return {
      recommendation: 'new_session',
      reason: '대화형 단계가 누적되었습니다. 새 대화를 권장합니다.',
    };
  }
  return { recommendation: 'continue' };
}

module.exports = {
  buildWrapper,
  generate,
  securityScan,
  getTransitionAdvice,
};

if (require.main === module) {
  const paths = require('./paths.js');
  const runtime = require('./runtime.js');
  const [, , command, ...rest] = process.argv;
  if (command !== 'generate') {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exit(2);
  }
  const session = runtime.loadSession();
  if (!session) {
    process.stderr.write('No active session\n');
    process.exit(1);
  }
  const stepArg = rest.find((a) => !a.startsWith('--'));
  const stepIndex = stepArg !== undefined ? Number(stepArg) : session.currentStep;
  const autoMode = rest.includes('--auto') || session.autoMode;
  const result = generate(session, stepIndex, { autoMode });
  process.stdout.write(result.wrapper);
  if (result.scanWarnings.length > 0) {
    process.stderr.write(`\n[weave] security scan warnings:\n${JSON.stringify(result.scanWarnings, null, 2)}\n`);
  }
  void paths;
}
