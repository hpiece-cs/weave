#!/usr/bin/env node
// compose-tree.js — Interactive tree-style compose UI.
// Arrow keys + space/enter. Similar to npm init / inquirer / gh extension install.
// Run: node demo/compose-tree.js

'use strict';

const discover = require('../core/scripts/discover.js');

// ── Locale detection ──
const lang = (process.env.LANG || 'en_US').startsWith('ko') ? 'ko' : 'en';
const i18n = {
  ko: {
    headerTitle: 'weave:compose ─ 트리 선택',
    headerHelp: '↑↓ 네비게이션 · ←→ 열기/닫기 · Space 선택 · Enter 저장 · u 유틸리티 · q 종료',
    statusReady: '준비됨. ↑↓ nav · Space 선택 · Enter 저장 · q 종료 · h 도움말',
    help: '도움말: ↑↓ 네비게이션 · ←→ 열기/닫기 · Space 선택 · Enter 저장 · u 유틸리티 · q 종료',
    utilityOn: '유틸리티 표시',
    utilityOff: '유틸리티 숨김',
    selected: '선택됨',
    deselected: '선택 해제됨',
    totalCount: '총',
    quit: '종료',
    empty: '(비어있음 — 선택한 스킬 없음)',
    presetPreview: '✓ Preset 미리보기',
    steps: '단계',
    phaseMissing: 'Phase 누락',
    allPhaseIncluded: '모든 주요 phase 포함 ✓',
    presetJSON: 'Preset JSON',
  },
  en: {
    headerTitle: 'weave:compose ─ tree select',
    headerHelp: '↑↓ nav · ←→ collapse/expand · Space toggle · Enter save · u utility · q quit',
    statusReady: 'Ready. ↑↓ nav · Space toggle · Enter save · q quit · h help',
    help: 'Help: ↑↓ nav · ←→ collapse/expand · Space toggle · Enter save · u utility · q quit',
    utilityOn: 'Utility ON',
    utilityOff: 'Utility OFF',
    selected: 'Selected',
    deselected: 'Deselected',
    totalCount: 'Total',
    quit: 'Quit',
    empty: '(empty — no skills selected)',
    presetPreview: '✓ Preset preview',
    steps: 'steps',
    phaseMissing: 'Phase missing',
    allPhaseIncluded: 'All major phases included ✓',
    presetJSON: 'Preset JSON',
  },
};
const t = i18n[lang];

// ── Utility classifier ──
function isUtility(s) {
  const desc = s.description || '';
  // Real utilities: configuration, help queries, navigation
  // NOT utilities: -agent- skills (persona/workflow agents)
  return /^\s*(switch|reset|configure|install|uninstall|enable|disable|clean\s+up|manage)\s+[\w\s,.-]*\b(settings?|configurations?|preferences?|permissions?)/i.test(desc) ||
    /^\s*(show|display|list|help|about|join|check-todos|stats|list-workspaces)\b/i.test(desc);
}

// ── ANSI ──
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const INV = '\x1b[7m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const MAGENTA = '\x1b[35m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';
const BLUE = '\x1b[34m';
const CURSOR_HIDE = '\x1b[?25l';
const CURSOR_SHOW = '\x1b[?25h';
const CLEAR = '\x1b[2J\x1b[H';

function cmplxBadge(c) {
  return c === 'quick' ? `${CYAN}Q${RESET}` : c === 'medium' ? `${YELLOW}M${RESET}` : `${RED}F${RESET}`;
}

// ── Load ──
const all = discover.discoverAll({ workflowOnly: false });
for (const s of all) s.isUtility = isUtility(s);

const INTEGRATED_STAGES = [
  { name: 'Discovery & Requirements', name_ko: '발견 & 요구사항',
    phases: new Set(['Discovery', 'Requirements', 'Phase 0', 'Phase 1']) },
  { name: 'Design & Planning',       name_ko: '설계 & 계획',
    phases: new Set(['Design', 'Planning', 'Phase 2', 'Phase 3', 'Phase 4']) },
  { name: 'Implementation',          name_ko: '구현',
    phases: new Set(['Implementation', 'Phase 5', 'Phase 6']) },
  { name: 'Review & QA',             name_ko: '검증 & 리뷰',
    phases: new Set(['Review/QA', 'Phase 7']) },
  { name: 'Completion',              name_ko: '완료',
    phases: new Set(['Completion', 'Phase 8']) },
  { name: 'Control & Recovery',      name_ko: '제어 & 복구',
    phases: new Set(['Control']) },
  { name: 'Other',                   name_ko: '기타',
    phases: new Set(['Other']) },
];

function stageOf(skill) {
  for (const stage of INTEGRATED_STAGES) {
    if (stage.phases.has(skill.phase)) return stage;
  }
  return INTEGRATED_STAGES[INTEGRATED_STAGES.length - 1];
}

function sourceLabel(s) {
  if (s.source.startsWith('weave-')) return 'weave';
  return s.source;
}

// ── State ──
const state = {
  showHidden: false,         // show utility
  phases: [],                // [{name, skills, expanded}]
  selected: new Map(),       // id → {skill, orderAdded}
  cursor: 0,
  scroll: 0,
  status: t.statusReady,
};

function rebuildTree() {
  const pool = state.showHidden ? all : all.filter((s) => !s.isUtility);
  const byStage = new Map(INTEGRATED_STAGES.map((st) => [st.name, []]));
  for (const s of pool) {
    const stage = stageOf(s);
    byStage.get(stage.name).push(s);
  }
  const previousExpand = new Map(state.phases.map((p) => [p.name, p.expanded]));
  state.phases = INTEGRATED_STAGES
    .filter((st) => byStage.get(st.name).length > 0)
    .map((st) => ({
      name: lang === 'ko' ? st.name_ko : st.name,
      expanded: previousExpand.get(lang === 'ko' ? st.name_ko : st.name)
        ?? (st.name === 'Discovery & Requirements'),
      skills: byStage.get(st.name).sort((a, b) => {
        const aOrder = a.processOrder ?? a.lifecycleOrder ?? 999;
        const bOrder = b.processOrder ?? b.lifecycleOrder ?? 999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        if (a.source !== b.source) return a.source.localeCompare(b.source);
        return a.id.localeCompare(b.id);
      }),
    }));
}

function buildVisibleRows() {
  const rows = [];
  for (const phase of state.phases) {
    rows.push({ type: 'phase', phase });
    if (phase.expanded) {
      for (const s of phase.skills) {
        rows.push({ type: 'skill', skill: s, phase: phase.name });
      }
    }
  }
  rows.push({ type: 'separator' });
  rows.push({ type: 'action', name: 'SAVE', label: 'Save preset & show JSON' });
  rows.push({ type: 'action', name: 'QUIT', label: 'Quit without saving' });
  return rows;
}

// ── Render ──
function termSize() {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  return { rows, cols };
}

function drawHeader(cols) {
  const title = `  ${t.headerTitle}`;
  const help = t.headerHelp;
  console.log(`${INV}${title.padEnd(cols - 1)}${RESET}`);
  console.log(`${DIM} ${help}${RESET}`);
  console.log(`${DIM}${'─'.repeat(cols - 1)}${RESET}`);
}

function drawStatus(cols) {
  const sel = `Selected: ${BOLD}${state.selected.size}${RESET}`;
  const hide = state.showHidden ? `${DIM}(utility: ON)${RESET}` : '';
  console.log(`  ${sel}   ${hide}`);
  console.log(`${DIM}${'─'.repeat(cols - 1)}${RESET}`);
}

function render() {
  const { rows: termRows, cols } = termSize();
  const visible = buildVisibleRows();

  // Ensure cursor in bounds
  if (state.cursor < 0) state.cursor = 0;
  if (state.cursor >= visible.length) state.cursor = visible.length - 1;

  // Reserve 6 rows for header/status/footer
  const bodyHeight = Math.max(5, termRows - 6);

  // Scroll to keep cursor visible
  if (state.cursor < state.scroll) state.scroll = state.cursor;
  if (state.cursor >= state.scroll + bodyHeight) state.scroll = state.cursor - bodyHeight + 1;

  process.stdout.write(CLEAR);
  drawHeader(cols);
  drawStatus(cols);

  const end = Math.min(visible.length, state.scroll + bodyHeight);
  for (let i = state.scroll; i < end; i++) {
    const row = visible[i];
    const isCursor = i === state.cursor;
    const pointer = isCursor ? `${BOLD}›${RESET}` : ' ';
    if (row.type === 'phase') {
      const checkedCount = row.phase.skills.filter((s) => state.selected.has(s.id)).length;
      const total = row.phase.skills.length;
      const sign = row.phase.expanded ? '▾' : '▸';
      const label = row.phase.name.padEnd(16);
      const countStr = checkedCount > 0
        ? `${GREEN}(${checkedCount}/${total} sel)${RESET}`
        : `${DIM}(${total})${RESET}`;
      const line = `${pointer} ${sign}  ${BOLD}${label}${RESET}  ${countStr}`;
      console.log(isCursor ? INV + stripEnd(line, cols) + RESET : line);
    } else if (row.type === 'skill') {
      const s = row.skill;
      const entry = state.selected.get(s.id);
      const check = entry ? `${GREEN}[x]${RESET}` : `[ ]`;
      const src = sourceLabel(s).padEnd(12);
      const intx = s.interactive ? `${YELLOW}I${RESET}` : `${DIM}·${RESET}`;
      const trig = (s.usageTrigger || s.description || '').slice(0, cols - 66);
      const line = `    ${check}  ${CYAN}${src}${RESET}   ${cmplxBadge(s.complexity)}${DIM}│${RESET}${intx}   ${s.id.padEnd(36)}  ${DIM}${trig}${RESET}`;
      const withPointer = `${pointer} ${line}`;
      console.log(isCursor ? INV + stripAnsi(withPointer).padEnd(cols - 1).slice(0, cols - 1) + RESET : withPointer);
    } else if (row.type === 'separator') {
      console.log(`${DIM}  ${'─'.repeat(cols - 4)}${RESET}`);
    } else if (row.type === 'action') {
      const line = `  ${BOLD}[ ${row.label} ]${RESET}`;
      const withPointer = `${pointer} ${line}`;
      console.log(isCursor ? INV + stripAnsi(withPointer).padEnd(cols - 1).slice(0, cols - 1) + RESET : withPointer);
    }
  }

  // Fill remaining
  for (let i = end - state.scroll; i < bodyHeight; i++) console.log();

  console.log(`${DIM}${'─'.repeat(cols - 1)}${RESET}`);
  console.log(`  ${state.status}`);
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }
function stripEnd(s, cols) {
  const plain = stripAnsi(s);
  if (plain.length <= cols - 1) return s;
  // truncate — simplistic
  return s;
}

// ── Key handling ──
const keys = {
  UP: '\x1b[A', DOWN: '\x1b[B', RIGHT: '\x1b[C', LEFT: '\x1b[D',
  ENTER: '\r', SPACE: ' ', Q: 'q', U: 'u', H: 'h', CTRL_C: '\x03',
  HOME: '\x1b[H', END: '\x1b[F', PGUP: '\x1b[5~', PGDN: '\x1b[6~',
};

function handleKey(key) {
  const visible = buildVisibleRows();
  const row = visible[state.cursor];

  if (key === keys.CTRL_C || key === keys.Q) {
    cleanup();
    console.log(`\n${t.quit}.`);
    process.exit(0);
  }

  if (key === keys.H) {
    state.status = t.help;
    render();
    return;
  }

  if (key === keys.U) {
    state.showHidden = !state.showHidden;
    rebuildTree();
    state.status = `${t.utilityOn}: ${state.showHidden}`;
    render();
    return;
  }

  if (key === keys.UP) {
    state.cursor = Math.max(0, state.cursor - 1);
  } else if (key === keys.DOWN) {
    state.cursor = Math.min(visible.length - 1, state.cursor + 1);
  } else if (key === keys.PGUP) {
    state.cursor = Math.max(0, state.cursor - 10);
  } else if (key === keys.PGDN) {
    state.cursor = Math.min(visible.length - 1, state.cursor + 10);
  } else if (key === keys.LEFT) {
    if (row?.type === 'phase') {
      row.phase.expanded = false;
    } else if (row?.type === 'skill') {
      // jump to parent phase
      for (let i = state.cursor; i >= 0; i--) {
        if (visible[i].type === 'phase') { state.cursor = i; break; }
      }
    }
  } else if (key === keys.RIGHT) {
    if (row?.type === 'phase') {
      row.phase.expanded = true;
    }
  } else if (key === keys.SPACE) {
    if (row?.type === 'phase') {
      row.phase.expanded = !row.phase.expanded;
    } else if (row?.type === 'skill') {
      if (state.selected.has(row.skill.id)) {
        state.selected.delete(row.skill.id);
        state.status = `${t.deselected}: ${row.skill.id}`;
      } else {
        state.selected.set(row.skill.id, { skill: row.skill, order: state.selected.size + 1 });
        state.status = `${t.selected}: ${row.skill.id} (${state.selected.size} ${t.totalCount})`;
      }
    } else if (row?.type === 'action' && row.name === 'SAVE') {
      doSave();
      return;
    } else if (row?.type === 'action' && row.name === 'QUIT') {
      cleanup();
      console.log(`\n${t.quit}.`);
      process.exit(0);
    }
  } else if (key === keys.ENTER) {
    if (row?.type === 'action' && row.name === 'SAVE') {
      doSave();
      return;
    }
    if (row?.type === 'action' && row.name === 'QUIT') {
      cleanup();
      console.log(`\n${t.quit}.`);
      process.exit(0);
    }
    if (row?.type === 'phase') {
      row.phase.expanded = !row.phase.expanded;
    } else if (row?.type === 'skill') {
      if (state.selected.has(row.skill.id)) state.selected.delete(row.skill.id);
      else state.selected.set(row.skill.id, { skill: row.skill, order: state.selected.size + 1 });
    }
  }

  render();
}

// ── Save ──
function doSave() {
  cleanup();
  process.stdout.write(CLEAR);
  if (state.selected.size === 0) {
    console.log(`(${t.empty})`);
    process.exit(0);
  }
  const picks = Array.from(state.selected.values()).sort((a, b) => a.order - b.order).map((e) => e.skill);
  console.log(`${BOLD}${t.presetPreview} — ${picks.length} ${t.steps}${RESET}\n`);
  const phases = new Set();
  for (let i = 0; i < picks.length; i++) {
    const s = picks[i];
    phases.add(s.phase);
    const src = sourceLabel(s).padEnd(12);
    console.log(`  ${String(i + 1).padStart(2)}. ${CYAN}${src}${RESET} ${cmplxBadge(s.complexity)}  ${s.id}`);
    const trig = (s.usageTrigger || '').slice(0, 70);
    if (trig) console.log(`       ${DIM}${trig}${RESET}`);
    if (s.outputs?.length) console.log(`       ${GREEN}→${RESET} ${s.outputs.join(', ')}`);
  }
  console.log();
  const wantedStages = ['Discovery & Requirements', 'Design & Planning', 'Implementation', 'Review & QA', 'Completion'];
  const coveredStages = new Set();
  for (const phase of phases) {
    for (const stage of INTEGRATED_STAGES) {
      if (stage.phases.has(phase)) {
        coveredStages.add(stage.name);
      }
    }
  }
  const miss = wantedStages.filter((w) => !coveredStages.has(w));
  if (miss.length) console.log(`${YELLOW}${t.phaseMissing}: ${miss.join(', ')}${RESET}`);
  else console.log(`${GREEN}${t.allPhaseIncluded}${RESET}`);
  console.log();
  const preset = {
    schemaVersion: 1,
    name: 'demo-workflow',
    created: new Date().toISOString(),
    steps: picks.map((s, i) => ({
      order: i + 1,
      skillId: s.id,
      source: s.source,
      phase: s.phase,
      checkpoint: s.defaultCheckpoint,
      interactive: s.interactive,
    })),
  };
  console.log(`${BOLD}${t.presetJSON}${RESET}\n`);
  console.log(JSON.stringify(preset, null, 2));
  process.exit(0);
}

// ── Cleanup ──
let cleanupCalled = false;
function cleanup() {
  if (cleanupCalled) return;
  cleanupCalled = true;
  try { process.stdin.setRawMode(false); } catch {}
  process.stdout.write(CURSOR_SHOW);
  process.stdin.removeAllListeners('data');
  process.stdin.pause();
}

process.on('SIGINT', () => { cleanup(); console.log('\nInterrupt.'); process.exit(130); });
process.on('exit', cleanup);

// ── Start ──
function start() {
  if (!process.stdin.isTTY) {
    console.error('Error: this demo requires a TTY. Run directly in a terminal.');
    process.exit(1);
  }
  process.stdin.setRawMode(true);
  process.stdin.setEncoding('utf8');
  process.stdout.write(CURSOR_HIDE);
  rebuildTree();
  // Put initial cursor on Discovery phase if present
  const visible = buildVisibleRows();
  const disc = visible.findIndex((r) => r.type === 'phase' && r.phase.name === 'Discovery');
  state.cursor = disc >= 0 ? disc : 0;
  render();

  process.stdin.on('data', (key) => {
    handleKey(key);
  });

  process.stdout.on('resize', render);
}

start();
