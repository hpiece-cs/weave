#!/usr/bin/env node
// compose-preview.js — Interactive prototype of /weave:compose UI (B direction).
// NOT production code. For UX validation only.
// Run: node demo/compose-preview.js

'use strict';

const readline = require('node:readline');
const path = require('node:path');
const discover = require('../core/scripts/discover.js');

// ── Category classifier (B direction) ──
function classify(s) {
  const name = s.name;
  const desc = s.description || '';
  if (/-agent-/.test(name) ||
      /talk\s+to\s+\w+|requests?\s+the\s+[\w\s-]+?\s+(agent|expert|specialist|coach|analyst|architect|designer|developer|master|pm|qa|scrum)/i.test(desc))
    return 'persona';
  if (/^\s*(switch|reset|configure|install|uninstall|enable|disable|clean\s+up|manage)\s+[\w\s,.-]*\b(settings?|configurations?|preferences?|permissions?)/i.test(desc))
    return 'utility';
  if (/^\s*(show|display|list|help|about)\b/i.test(desc)) return 'utility';
  if (/^\s*join/i.test(desc)) return 'utility';
  if (/^\s*(manage|correct|pause|resume|rollback|insert|debug|forensics|restore)\s/i.test(desc) ||
      /\b(correct-course|pause-work|resume-work|rollback|debug|forensics|thread|cleanup|health)\b/i.test(name))
    return 'control';
  return 'workflow';
}

// ── Format helpers ──
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const INV = '\x1b[7m';

function catBadge(cat) {
  const map = { workflow: `${GREEN}[W]${RESET}`, persona: `${MAGENTA}[P]${RESET}`, control: `${YELLOW}[C]${RESET}`, utility: `${DIM}[U]${RESET}` };
  return map[cat] || '[?]';
}
function cmplxBadge(c) {
  return c === 'quick' ? `${CYAN}Q${RESET}` : c === 'medium' ? `${YELLOW}M${RESET}` : `${RED}F${RESET}`;
}
function hr(w = 78) { return '─'.repeat(w); }
function clear() { process.stdout.write('\x1b[2J\x1b[H'); }
function pause() { return ask(`\n${DIM}<Enter로 계속>${RESET}`); }

// ── Load data ──
const all = discover.discoverAll({ workflowOnly: false });
for (const s of all) s.cat = classify(s);
const visible = all.filter((s) => s.cat !== 'utility');
const hidden = all.filter((s) => s.cat === 'utility');

// ── Phase order ──
const PHASE_ORDER = [
  'Phase 0', 'Phase 1', 'Phase 2', 'Phase 3', 'Phase 4', 'Phase 5', 'Phase 6', 'Phase 7', 'Phase 8',
  'Discovery', 'Requirements', 'Design', 'Planning',
  'Implementation', 'Review/QA', 'Completion', 'Control', 'Other',
];
const PHASE_RECOMMEND = {
  Discovery: '★★★ (시작)', Requirements: '★★★', Design: '★★', Planning: '★★',
  Implementation: '★★', 'Review/QA': '★★', Completion: '★ (끝)',
  Control: '─ (중간 삽입)', Other: '─',
};

// ── State ──
const workflow = [];
let showHidden = false;

// ── Readline ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

// ── Screens ──
function drawHeader(title) {
  clear();
  console.log(`${INV}  weave:compose  —  ${title.padEnd(65)}${RESET}`);
  console.log();
}

function drawCurrentWorkflow() {
  console.log(`${BOLD}현재 워크플로우 (${workflow.length} steps)${RESET}`);
  if (workflow.length === 0) {
    console.log(`  ${DIM}(비어있음 — 스킬을 추가하세요)${RESET}`);
    return;
  }
  for (let i = 0; i < workflow.length; i++) {
    const s = workflow[i];
    const step = String(i + 1).padStart(2, ' ');
    console.log(`  ${step}. ${catBadge(s.cat)} [${cmplxBadge(s.complexity)}] ${CYAN}${s.phase.padEnd(12)}${RESET} ${s.id}`);
  }
  // Gap check
  const phases = new Set(workflow.map((s) => s.phase));
  const wanted = ['Discovery', 'Requirements', 'Design', 'Implementation', 'Review/QA', 'Completion'];
  const missing = wanted.filter((p) => !phases.has(p));
  if (missing.length > 0) {
    console.log(`  ${DIM}누락 phase: ${missing.join(', ')}${RESET}`);
  }
}

async function screenWelcome() {
  drawHeader('Welcome');
  const cats = { workflow: 0, persona: 0, control: 0, utility: 0 };
  for (const s of all) cats[s.cat]++;
  console.log(`  발견된 스킬: ${BOLD}${all.length}${RESET} 개  (${visible.length} visible)`);
  console.log();
  console.log(`    ${catBadge('workflow')} workflow  ${String(cats.workflow).padStart(4)}  산출물 생성`);
  console.log(`    ${catBadge('persona')} persona   ${String(cats.persona).padStart(4)}  역할 전환`);
  console.log(`    ${catBadge('control')} control   ${String(cats.control).padStart(4)}  제어 흐름`);
  console.log(`    ${catBadge('utility')} utility   ${String(cats.utility).padStart(4)}  ${DIM}(숨김 — u로 토글)${RESET}`);
  console.log();
  console.log(`  이 데모에서 할 수 있는 것:`);
  console.log(`    - Phase별 스킬 browse 후 번호로 선택`);
  console.log(`    - 워크플로우에 단계 추가/제거/재정렬`);
  console.log(`    - 최종 preset JSON 미리보기`);
  console.log();
  await pause();
}

async function screenMainMenu() {
  while (true) {
    drawHeader('Main Menu');
    drawCurrentWorkflow();
    console.log();
    console.log(`  [1] 스킬 추가 (phase로 브라우징)`);
    console.log(`  [2] 스킬 추가 (이름 검색)`);
    console.log(`  [3] 현재 워크플로우 편집 (삭제/재정렬)`);
    console.log(`  [4] 최종 미리보기 + preset JSON`);
    console.log(`  [u] utility 표시 토글 (현재: ${showHidden ? 'ON' : 'OFF'})`);
    console.log(`  [q] 종료`);
    console.log();
    const c = (await ask('  > 선택: ')).trim().toLowerCase();
    if (c === '1') await screenBrowseByPhase();
    else if (c === '2') await screenSearch();
    else if (c === '3') await screenEdit();
    else if (c === '4') await screenPreview();
    else if (c === 'u') { showHidden = !showHidden; }
    else if (c === 'q') return;
  }
}

function pool() {
  return showHidden ? all : visible;
}

async function screenBrowseByPhase() {
  drawHeader('Phase 브라우징');
  drawCurrentWorkflow();
  console.log();
  const byPhase = {};
  for (const s of pool()) (byPhase[s.phase] = byPhase[s.phase] || []).push(s);
  const phases = PHASE_ORDER.filter((p) => byPhase[p]);
  console.log(`${BOLD}Phase 선택${RESET}`);
  phases.forEach((ph, i) => {
    const rec = PHASE_RECOMMEND[ph] || (ph.startsWith('Phase ') ? '(WDS)' : '─');
    console.log(`  [${String(i + 1).padStart(2)}] ${ph.padEnd(16)} ${String(byPhase[ph].length).padStart(4)} skills   ${DIM}${rec}${RESET}`);
  });
  console.log(`  [b] 뒤로`);
  console.log();
  const c = (await ask('  > Phase 번호: ')).trim().toLowerCase();
  if (c === 'b' || c === '') return;
  const idx = parseInt(c, 10) - 1;
  if (idx < 0 || idx >= phases.length) return;
  await screenPickFromPhase(phases[idx], byPhase[phases[idx]]);
}

async function screenPickFromPhase(phase, skills) {
  const sorted = skills.slice().sort((a, b) => {
    if (a.cat !== b.cat) return { workflow: 0, persona: 1, control: 2, utility: 3 }[a.cat] - { workflow: 0, persona: 1, control: 2, utility: 3 }[b.cat];
    return a.id.localeCompare(b.id);
  });
  while (true) {
    drawHeader(`${phase} phase — ${skills.length} skills`);
    drawCurrentWorkflow();
    console.log();
    let lastSource = '';
    for (let i = 0; i < sorted.length; i++) {
      const s = sorted[i];
      if (s.source !== lastSource) {
        console.log(`  ${DIM}── ${s.source} ──${RESET}`);
        lastSource = s.source;
      }
      const num = String(i + 1).padStart(2);
      const intx = s.interactive ? `${YELLOW}I${RESET}` : ' ';
      const trig = (s.usageTrigger || s.description || '').slice(0, 45);
      const already = workflow.find((w) => w.id === s.id) ? ` ${GREEN}(added)${RESET}` : '';
      console.log(`  [${num}] ${catBadge(s.cat)} ${cmplxBadge(s.complexity)} ${intx}  ${s.id.padEnd(40)} ${DIM}${trig}${RESET}${already}`);
    }
    console.log();
    console.log(`  ${DIM}범례: W=workflow P=persona C=control  |  Q/M/F=quick/medium/full  |  I=interactive${RESET}`);
    console.log(`  [b] 뒤로  |  [d 번호] 상세 보기  |  번호 선택 (콤마로 여러개)`);
    console.log();
    const c = (await ask('  > 입력: ')).trim().toLowerCase();
    if (c === 'b' || c === '') return;
    if (c.startsWith('d ')) {
      const idx = parseInt(c.slice(2).trim(), 10) - 1;
      if (sorted[idx]) await showDetail(sorted[idx]);
      continue;
    }
    const nums = c.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
    let added = 0;
    for (const n of nums) {
      const s = sorted[n - 1];
      if (s) {
        workflow.push(s);
        added++;
      }
    }
    if (added > 0) {
      console.log(`  ${GREEN}✓ ${added}개 추가됨${RESET}`);
      await pause();
      return;
    }
  }
}

async function showDetail(s) {
  drawHeader(`상세: ${s.id}`);
  console.log(`  ${BOLD}id${RESET}:          ${s.id}`);
  console.log(`  ${BOLD}source${RESET}:      ${s.source}`);
  console.log(`  ${BOLD}type${RESET}:        ${s.type}`);
  console.log(`  ${BOLD}category${RESET}:    ${catBadge(s.cat)} ${s.cat}`);
  console.log(`  ${BOLD}phase${RESET}:       ${s.phase}${s.phaseExplicit ? ' (explicit)' : ' (inferred)'}`);
  console.log(`  ${BOLD}complexity${RESET}:  ${s.complexity}`);
  console.log(`  ${BOLD}interactive${RESET}: ${s.interactive ? 'yes' : 'no'}`);
  console.log(`  ${BOLD}checkpoint${RESET}:  ${s.defaultCheckpoint}`);
  console.log(`  ${BOLD}description${RESET}:`);
  console.log(`    ${s.description}`);
  if (s.usageTrigger) console.log(`  ${BOLD}usageTrigger${RESET}:\n    ${s.usageTrigger}`);
  if (s.inputs?.length) console.log(`  ${BOLD}inputs${RESET}:      ${s.inputs.join(', ')}`);
  if (s.outputs?.length) console.log(`  ${BOLD}outputs${RESET}:     ${s.outputs.join(', ')}`);
  if (s.invokes?.length) console.log(`  ${BOLD}invokes${RESET}:     ${s.invokes.join(', ')}`);
  if (s.tools?.length) console.log(`  ${BOLD}tools${RESET}:       ${s.tools.join(', ')}`);
  console.log(`  ${BOLD}path${RESET}:        ${DIM}${s.path}${RESET}`);
  console.log();
  const a = (await ask(`  ${YELLOW}[a]${RESET}dd to workflow   [b]ack: `)).trim().toLowerCase();
  if (a === 'a') {
    workflow.push(s);
    console.log(`  ${GREEN}✓ 추가됨${RESET}`);
    await pause();
  }
}

async function screenSearch() {
  drawHeader('이름 검색');
  drawCurrentWorkflow();
  console.log();
  const q = (await ask('  > 검색어 (id/description 부분 일치): ')).trim().toLowerCase();
  if (!q) return;
  const matches = pool()
    .filter((s) => s.id.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
    .slice(0, 20);
  if (matches.length === 0) {
    console.log(`  ${DIM}일치하는 스킬 없음${RESET}`);
    await pause();
    return;
  }
  console.log();
  matches.forEach((s, i) => {
    const trig = (s.usageTrigger || s.description || '').slice(0, 50);
    console.log(`  [${String(i + 1).padStart(2)}] ${catBadge(s.cat)} ${cmplxBadge(s.complexity)} ${s.id.padEnd(40)} ${DIM}${trig}${RESET}`);
  });
  console.log();
  const c = (await ask('  > 번호 선택 (콤마, [b]ack): ')).trim().toLowerCase();
  if (c === 'b' || !c) return;
  const nums = c.split(',').map((x) => parseInt(x.trim(), 10)).filter((n) => !Number.isNaN(n));
  for (const n of nums) if (matches[n - 1]) workflow.push(matches[n - 1]);
  console.log(`  ${GREEN}✓ ${nums.length}개 추가됨${RESET}`);
  await pause();
}

async function screenEdit() {
  if (workflow.length === 0) {
    drawHeader('편집');
    console.log(`  ${DIM}워크플로우가 비어있습니다${RESET}`);
    await pause();
    return;
  }
  while (true) {
    drawHeader('워크플로우 편집');
    drawCurrentWorkflow();
    console.log();
    console.log(`  [r N]   Step N 삭제`);
    console.log(`  [m N M] Step N을 M 자리로 이동`);
    console.log(`  [c]     전체 클리어`);
    console.log(`  [b]     뒤로`);
    console.log();
    const c = (await ask('  > ')).trim().toLowerCase();
    if (c === 'b' || !c) return;
    if (c === 'c') {
      workflow.length = 0;
      console.log(`  ${GREEN}✓ 클리어${RESET}`);
      await pause();
      continue;
    }
    const rm = c.match(/^r\s+(\d+)$/);
    if (rm) {
      const n = parseInt(rm[1], 10) - 1;
      if (workflow[n]) {
        const removed = workflow.splice(n, 1)[0];
        console.log(`  ${GREEN}✓ ${removed.id} 삭제${RESET}`);
        await pause();
      }
      continue;
    }
    const mv = c.match(/^m\s+(\d+)\s+(\d+)$/);
    if (mv) {
      const from = parseInt(mv[1], 10) - 1;
      const to = parseInt(mv[2], 10) - 1;
      if (workflow[from]) {
        const [item] = workflow.splice(from, 1);
        workflow.splice(Math.min(to, workflow.length), 0, item);
        console.log(`  ${GREEN}✓ 이동${RESET}`);
        await pause();
      }
      continue;
    }
  }
}

async function screenPreview() {
  drawHeader('최종 미리보기 + preset JSON');
  if (workflow.length === 0) {
    console.log(`  ${DIM}비어있음${RESET}`);
    await pause();
    return;
  }
  console.log(`${BOLD}워크플로우 (${workflow.length} steps)${RESET}`);
  let prev = null;
  for (let i = 0; i < workflow.length; i++) {
    const s = workflow[i];
    const step = String(i + 1).padStart(2, ' ');
    console.log(`  ${step}. ${catBadge(s.cat)} [${cmplxBadge(s.complexity)}] ${CYAN}${s.phase.padEnd(14)}${RESET} ${s.id}`);
    const trig = (s.usageTrigger || s.description || '').slice(0, 70);
    if (trig) console.log(`        ${DIM}${trig}${RESET}`);
    if (s.outputs?.length) console.log(`        ${GREEN}→ produces:${RESET} ${s.outputs.join(', ')}`);
    if (s.invokes?.length) console.log(`        ${BLUE}→ invokes:${RESET} ${s.invokes.slice(0, 2).join(', ')}`);
    prev = s;
  }
  console.log();
  const phases = [...new Set(workflow.map((s) => s.phase))];
  const cats = {};
  for (const s of workflow) cats[s.cat] = (cats[s.cat] || 0) + 1;
  console.log(`${BOLD}요약${RESET}`);
  console.log(`  단계 수:        ${workflow.length}`);
  console.log(`  phase 경로:     ${phases.join(' → ')}`);
  console.log(`  카테고리:       ${Object.entries(cats).map(([k, v]) => `${k}(${v})`).join('  ')}`);
  console.log(`  interactive:    ${workflow.filter((s) => s.interactive).length} / ${workflow.length} steps`);
  const totalInvokes = workflow.reduce((a, s) => a + (s.invokes?.length || 0), 0);
  console.log(`  auto-invokes:   ${totalInvokes}`);
  console.log();

  // Gap check
  const phaseSet = new Set(phases);
  const wanted = ['Discovery', 'Requirements', 'Design', 'Planning', 'Implementation', 'Review/QA', 'Completion'];
  console.log(`${BOLD}Phase 갭 체크${RESET}`);
  for (const w of wanted) {
    const present = phaseSet.has(w);
    console.log(`  ${present ? GREEN + '✓' : DIM + '·'} ${w}${RESET}${present ? '' : `   ${DIM}(빠짐)${RESET}`}`);
  }
  console.log();

  // Preset JSON
  const preset = {
    schemaVersion: 1,
    name: 'demo-workflow',
    created: new Date().toISOString(),
    steps: workflow.map((s, i) => ({
      order: i + 1,
      skillId: s.id,
      category: s.cat,
      phase: s.phase,
      checkpoint: s.defaultCheckpoint,
      interactive: s.interactive,
    })),
  };
  console.log(`${BOLD}Preset JSON 미리보기${RESET}`);
  console.log(DIM + JSON.stringify(preset, null, 2).split('\n').slice(0, 30).join('\n') + RESET);
  if (JSON.stringify(preset, null, 2).split('\n').length > 30) {
    console.log(`  ${DIM}... (truncated)${RESET}`);
  }
  console.log();
  console.log(`  ${DIM}(실제 weave에서는 이 preset이 ~/.weave/workflows/<name>.json 에 저장됨)${RESET}`);
  await pause();
}

// ── Main ──
async function main() {
  try {
    await screenWelcome();
    await screenMainMenu();
    console.log('\n종료합니다.');
  } finally {
    rl.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
