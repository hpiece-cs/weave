#!/usr/bin/env node
// compose-workflow.js — Template-first compose UI.
// Top-level: curated agentic workflow templates.
// Children: the skills in that template (checkable individually).
// Run: node demo/compose-workflow.js

'use strict';

const readline = require('node:readline');
const nodePath = require('node:path');
const discover = require('../core/scripts/discover.js');
const storage = require('../core/scripts/storage.js');
const paths = require('../core/scripts/paths.js');
const skillCache = require('../core/scripts/skill-cache.js');

// ── CLI flags ──
// --single-pick       : /weave:edit-session 의 insert picker 용. 체크 최대 1개,
//                       Enter 시 저장 대화 없이 `{"skillId":"source:name"}` 를
//                       --result-file 로 지정된 경로에 쓰고 종료. 취소는 빈 객체.
// --session-checked=A,B,C  : 현재 세션에 이미 들어있는 스킬 ID 목록. 목록에 있는
//                       스킬 행에 "● 세션에 있음" 배지를 추가 (선택 제한은 없음).
// --result-file=<path>     : single-pick 결과 JSON 을 쓸 경로. 지정 안 하면
//                       stdout 으로 방출 (과거 호환). 새 창에서 띄울 때는 반드시
//                       파일 경로를 지정해야 TUI 가 stdout 을 가리지 않고 보임.
const ARGS = process.argv.slice(2);
const SINGLE_PICK = ARGS.includes('--single-pick');
const SESSION_CHECKED = (() => {
  const flag = ARGS.find((a) => a.startsWith('--session-checked='));
  if (!flag) return new Set();
  return new Set(flag.slice('--session-checked='.length).split(',').filter(Boolean));
})();
const RESULT_FILE = (() => {
  const flag = ARGS.find((a) => a.startsWith('--result-file='));
  return flag ? flag.slice('--result-file='.length) : null;
})();

// ── Locale detection ──
const lang = (process.env.LANG || 'en_US').startsWith('ko') ? 'ko' : 'en';
const i18n = {
  ko: {
    // Header + help
    headerTitle: 'weave:compose — 에이전틱 워크플로우 선택',
    headerHelp: ' ↑↓ 네비게이션 · +/- 열기/닫기 · Space 선택 · a 모두 선택 · r 다시 읽기 · Enter 저장 · q 종료',
    selectedTemplate: '선택됨: {0} 스킬',
    saveLabel: 'Preset 저장 & JSON 표시',
    quitLabel: '저장하지 않고 종료',

    // Group/skill meta
    cannotSelect: '선택할 수 없음',
    unavailable: '(이용 불가)',
    selected: '선택됨',
    deselected: '선택 해제됨',
    total: '총',
    cleared: '클리어됨',
    selectedAll: '모두 선택됨',
    intentTpl: '{0} 스킬 / {1} {2} ({3})',   // {0}=n skills, {1}=n sources, {2}=source(s) label, {3}=joined source list
    skillsWord: '스킬',
    sourceWord: '소스',
    sources: '소스',   // Korean doesn't pluralize

    // Status line verbs
    expanded: '확장',
    collapsed: '접힘',
    noAvailable: '선택 가능한 스킬 없음',
    jumpedToSave: '저장으로 이동',

    // Top-level exit messages
    quitMsg: '종료.',
    canceled: '취소됨.',
    interrupt: '인터럽트.',

    // Save flow
    noSkillsSelected: '(선택된 스킬 없음 — 저장할 것 없음)',
    canceledNothingSaved: '(취소됨 — 저장 안 됨)',
    presetPreview: 'Preset 미리보기 — {0} 단계',
    coherent: '✓ 일관됨 — 모든 스킬이 [{0}] 에서.',
    crossSource: '⚠ 선택한 스킬이 {0}개 소스({1})에 걸쳐 있음 — cross-source 워크플로우. 실행 중 source 경계에서 새 세션을 권장합니다.',
    presetNameLabel: 'Preset 이름',
    invalidName: '잘못된 이름. 문자, 숫자, 점(.), 언더스코어(_), 대시(-) 만 사용하세요.',
    saveWhereLabel: '어디에 저장?',
    saveWhereHint: '[p]로젝트 ({0}/.weave)  [g]lobal (~/.weave)  — 기본 p',
    enterPOrG: "'p' 또는 'g'를 입력하세요.",
    alreadyExists: '⚠ {0} 이름의 preset 이 {1}에 이미 존재합니다.',
    overwriteHint: '[o]덮어쓰기  [r]이름변경  [c]취소 — 기본 r',
    updated: '↻ 업데이트됨',
    saved: '✓ 저장됨',
    saveFailed: '✗ 저장 실패: {0}',

    // Reload flow (r key)
    reloadPrompt: '스킬을 다시 읽어올까요? 캐시를 무시하고 ~/.claude/skills 와 <project>/.claude/skills 를 새로 스캔합니다. (y/N): ',
    reloaded: '✓ 스킬을 다시 읽어왔어요',
    reloadCanceled: '재로드 취소',
    skillCount: '개',

    // Phase descriptions — 30 canonical stages from discover.js STAGE_ORDER.
    phases: {
      'Onboarding':                 '방법론/도구 설치, 워크스페이스 생성',
      'Alignment':                  '비전·이해관계자 정렬, 사인오프',
      'Discovery':                  '브레인스토밍, 아이디어 확산',
      'Research':                   '시장·도메인·기술 조사',
      'Requirements — Mapping':     '목표→심리·시나리오 변환',
      'Requirements — Spec':        'PRD/GDD 등 요구사항 문서',
      'Requirements — Validation':  'PRD/GDD 검증·리뷰',
      'Design — UX':                'UX/UI 명세',
      'Design — Architecture':      '시스템/엔진 아키텍처',
      'Design — Narrative/Content': '스토리·세계관',
      'Design — Asset Spec':        '자산 제작 명세',
      'Planning — Epics':           '에픽 분해',
      'Planning — Stories':         '스토리 상세화',
      'Planning — Sprint':          '스프린트·마일스톤 스케줄',
      'Test Strategy':              '테스트 계획·ATDD·프레임워크',
      'Implementation — Dev':       '코드 구현',
      'Implementation — Assets':    '비주얼·텍스트 자산 생산',
      'Code Review':                '구현물 리뷰',
      'Test — Automation':          '자동화 확장, E2E',
      'QA — NFR':                   '성능·보안·신뢰성',
      'QA — Review/Trace':          '테스트 품질, 추적성, 게이트',
      'CI/CD':                      '파이프라인',
      'User Testing':               '플레이테스트·UAT',
      'Integration & Ship':         'PR, 머지, 릴리즈',
      'Retrospective':              '회고',
      'Milestone Close':            '아카이브·요약',
      'Evolution':                  '기존 제품 개선 루프',
      'Control':                    '진행 제어·복구',
      'Docs':                       '문서·context 생성',
      'Progress':                   '진행 현황·todo·notes',
      'Other':                      '기타',
    },
  },
  en: {
    // Header + help
    headerTitle: 'weave:compose — agentic workflow select',
    headerHelp: ' ↑↓ nav · +/- expand · Space toggle · a toggle all · r reload · Enter save · q quit',
    selectedTemplate: 'Selected: {0} skills',
    saveLabel: 'Save preset & show JSON',
    quitLabel: 'Quit without saving',

    // Group/skill meta
    cannotSelect: 'Cannot select',
    unavailable: '(unavailable)',
    selected: 'Selected',
    deselected: 'Deselected',
    total: 'total',
    cleared: 'Cleared',
    selectedAll: 'Selected all',
    intentTpl: '{0} skills across {1} {2} ({3})',
    skillsWord: 'skills',
    sourceWord: 'source',
    sources: 'sources',

    // Status line verbs
    expanded: 'Expanded',
    collapsed: 'Collapsed',
    noAvailable: 'No available skills in',
    jumpedToSave: 'Jumped to Save',

    // Top-level exit messages
    quitMsg: 'Quit.',
    canceled: 'Canceled.',
    interrupt: 'Interrupt.',

    // Save flow
    noSkillsSelected: '(No skills selected — nothing to save)',
    canceledNothingSaved: '(Canceled — nothing saved)',
    presetPreview: 'Preset preview — {0} steps',
    coherent: '✓ Coherent — all skills from [{0}].',
    crossSource: '⚠ Selected skills span {0} sources ({1}) — cross-source workflow; weave will recommend new sessions at source boundaries during run.',
    presetNameLabel: 'Preset name',
    invalidName: 'Invalid name. Use only letters, digits, dot, underscore, dash.',
    saveWhereLabel: 'Save where?',
    saveWhereHint: '[p]roject ({0}/.weave)  [g]lobal (~/.weave)  — default p',
    enterPOrG: "Please enter 'p' or 'g'.",
    alreadyExists: '⚠ A preset named {0} already exists in {1}.',
    overwriteHint: '[o]verwrite  [r]ename  [c]ancel — default r',
    updated: '↻ Updated',
    saved: '✓ Saved',
    saveFailed: '✗ Save failed: {0}',

    // Reload flow (r key)
    reloadPrompt: 'Reload skills? This ignores the cache and re-scans ~/.claude/skills and <project>/.claude/skills. (y/N): ',
    reloaded: '✓ Skills reloaded',
    reloadCanceled: 'Reload canceled',
    skillCount: 'skills',

    // Phase descriptions — 30 canonical stages from discover.js STAGE_ORDER.
    phases: {
      'Onboarding':                 'Install methodology/tools, create workspace',
      'Alignment':                  'Align vision/stakeholders, sign-off',
      'Discovery':                  'Brainstorming, idea expansion',
      'Research':                   'Market/domain/technical research',
      'Requirements — Mapping':     'Map goals to psychology & scenarios',
      'Requirements — Spec':        'PRD/GDD and other requirement docs',
      'Requirements — Validation':  'Validate/review PRD/GDD',
      'Design — UX':                'UX/UI specification',
      'Design — Architecture':      'System/engine architecture',
      'Design — Narrative/Content': 'Story & world-building',
      'Design — Asset Spec':        'Asset production spec',
      'Planning — Epics':           'Epic decomposition',
      'Planning — Stories':         'Story elaboration',
      'Planning — Sprint':          'Sprint/milestone scheduling',
      'Test Strategy':              'Test plan, ATDD, framework',
      'Implementation — Dev':       'Code implementation',
      'Implementation — Assets':    'Visual/text asset production',
      'Code Review':                'Review implementation',
      'Test — Automation':          'Automation expansion, E2E',
      'QA — NFR':                   'Performance, security, reliability',
      'QA — Review/Trace':          'Test quality, traceability, gates',
      'CI/CD':                      'Pipeline',
      'User Testing':               'Playtest, UAT',
      'Integration & Ship':         'PR, merge, release',
      'Retrospective':              'Retrospective',
      'Milestone Close':            'Archive & summary',
      'Evolution':                  'Brownfield product improvement loop',
      'Control':                    'Progress control & recovery',
      'Docs':                       'Docs & context generation',
      'Progress':                   'Status, todos, notes',
      'Other':                      'Other',
    },
  },
};
const t = i18n[lang];

// Simple interpolation: replaces {0}, {1}, ... with args in order.
function tr(template, ...args) {
  return String(template).replace(/\{(\d+)\}/g, (_, i) => args[Number(i)] != null ? args[Number(i)] : '');
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

// 이 두 상수는 getSkillGroups() 콜백이 캐시 미스 시 동기 실행되며 참조하므로
// 반드시 getSkillGroups 호출보다 앞서 선언되어야 한다 (TDZ 회피).

// Skip weave's own skills (they are tools, not agentic workflow steps).
const BROWSE_EXCLUDE_SOURCES = new Set([
  'weave-compose', 'weave-run', 'weave-list', 'weave-manage', 'weave-status',
  'weave-debug', 'weave-note', 'weave-history', 'weave-help', 'weave-next',
  'weave-rollback', 'weave-ref',
]);

// Per-phase descriptions are sourced from i18n t.phases (see top of file).
// STAGE_ORDER / phase labels themselves stay English (canonical in discover.js).

// ── Load & join templates with discovered skills ──
let byId = new Map();
let cachedGroups = null;
const _init = skillCache.getSkillGroups((discovered, workflowOnly, resolvedById) => {
  return buildPerPhaseBrowseTemplatesFull(workflowOnly, resolvedById);
});
byId = _init.byId;
cachedGroups = _init.groups;

function buildPerPhaseBrowseTemplatesFull(workflowOnly, byId) {
  // discover.js 가 이미 Agentic Workflow 만 골라 돌려주고(Layer A/B/C 배정·정렬 완료),
  // stageIndex 순 → source(methodology) 순 → curated step → alpha 로 정렬된 배열이 들어온다.
  // compose 는 (1) weave-* 소스만 제외하고 (2) skill.phase 로 그룹핑하면 충분.
  const byPhase = new Map();

  for (const s of workflowOnly) {
    if (BROWSE_EXCLUDE_SOURCES.has(s.source)) continue;
    const phase = s.phase || 'Other';
    // 'Other' phase 는 분류되지 않은 스킬들의 더미통(catch-all) 이라 compose
    // 브라우저의 그룹 리스트에서 완전히 숨긴다. 필요한 스킬이 여기 들어와
    // 있으면 discover.js 의 STAGE_KEYWORDS / OVERRIDE_TABLE 에 매핑을 추가해
    // 제 phase 로 옮기는 게 정석. 여기서 걸러내면 그룹 번호도 01~29 로
    // 자연스럽게 연속된다.
    //
    // NOTE: 이 필터는 skill-cache 의 캐시에 반영되므로 필터 규칙을 바꾸면
    // skill-cache.js 의 CACHE_SCHEMA_VERSION 도 함께 올려야 기존 캐시가
    // 자동으로 폐기된다.
    if (phase === 'Other') continue;
    if (!byPhase.has(phase)) {
      byPhase.set(phase, {
        phase,
        stageIndex: s.stageIndex != null ? s.stageIndex : Infinity,
        skills: [],
      });
    }
    byPhase.get(phase).skills.push(s);
  }

  const entries = [...byPhase.values()].sort((a, b) => a.stageIndex - b.stageIndex);

  return entries.map(({ phase, stageIndex, skills }, i) => {
    const sourcesTouched = [...new Set(skills.map((s) => s.source))].sort();
    const desc = (t.phases && t.phases[phase]) || '';
    const num = String(i + 1).padStart(2, '0');
    const sourceLabel = sourcesTouched.length === 1 ? t.sourceWord : t.sources;
    // Max visible width of `[source]` across skills in this phase — used
    // to align the skill-name column when rendering cross-source rows.
    const maxSrcWidth = skills.reduce(
      (max, s) => Math.max(max, visibleWidth(`[${s.source}]`)),
      0
    );
    return {
      id: `phase-${stageIndex}-${phase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
      source: `${num}. ${phase}`,
      name: desc || phase,
      intent: tr(t.intentTpl, skills.length, sourcesTouched.length, sourceLabel, sourcesTouched.join(', ')),
      crossSource: true,
      maxSrcWidth,
      // skills are already sorted by discover.js compareSkills (methodology → processOrder → numericPrefix → step → alpha)
      skills,
    };
  });
}

function buildPerPhaseBrowseTemplates() {
  return cachedGroups;
}

function hydrateTemplate(tmpl) {
  return {
    ...tmpl,
    // Phase-group names come from buildPerPhaseBrowseTemplatesFull (already localized via t.phases).
    name: tmpl.name,
    expanded: false,
    skills: tmpl.skills.map((skillOrId) => {
      const sid = typeof skillOrId === 'string' ? skillOrId : skillOrId.id;
      const hit = typeof skillOrId === 'string' ? byId.get(sid) : skillOrId;
      return {
        id: sid,
        data: hit || null,
        available: !!hit,
        checked: state.checkedIds ? state.checkedIds.has(sid) : false,
      };
    }),
  };
}

function buildTemplates() {
  return buildPerPhaseBrowseTemplates().map(hydrateTemplate);
}

// ── State ──
const state = {
  templates: [],
  checkedIds: new Set(),
  cursor: 0,
  scroll: 0,
  status: '',
};
state.templates = buildTemplates();

// Each entry in the returned rows array corresponds to exactly ONE terminal line.
// Skill items produce two rows: a navigable 'skill' row and a non-navigable 'skill-desc' row.
// This keeps scroll math (1 row = 1 line) correct.
function buildVisibleRows() {
  const rows = [];
  for (const t of state.templates) {
    rows.push({ type: 'template', template: t });
    if (t.expanded) {
      for (let i = 0; i < t.skills.length; i++) {
        const skill = t.skills[i];
        rows.push({ type: 'skill', template: t, skill, index: i });
        rows.push({ type: 'skill-desc', template: t, skill, index: i });
      }
    }
  }
  rows.push({ type: 'separator' });
  rows.push({ type: 'action', name: 'SAVE', label: t.saveLabel });
  rows.push({ type: 'action', name: 'QUIT', label: t.quitLabel });
  return rows;
}

function isNavigable(row) {
  return row && row.type !== 'skill-desc' && row.type !== 'separator';
}

function countChecked(tmpl) {
  return tmpl.skills.filter((s) => s.checked).length;
}
function totalChecked() {
  return state.checkedIds.size;
}
function templatesTouched() {
  return state.templates.filter((t) => countChecked(t) > 0);
}

// ── Render ──
function termSize() {
  const rows = process.stdout.rows || 24;
  const cols = process.stdout.columns || 80;
  return { rows, cols };
}

function drawHeader(cols) {
  const baseTitle = t.headerTitle;
  const suffix = SINGLE_PICK
    ? (lang === 'ko' ? '  [1개만 선택 — edit-session]' : '  [single pick — edit-session]')
    : '';
  const title = `  ${baseTitle}${suffix}`;
  const help = t.headerHelp;
  const titleClipped = truncateVisible(title, cols - 1);
  console.log(INV + padToCols(titleClipped, cols) + RESET);
  console.log(truncateVisible(`${DIM}${help}${RESET}`, cols - 1));
  console.log(`${DIM}${'─'.repeat(Math.max(0, cols - 1))}${RESET}`);
}

function drawStatus(cols) {
  const total = totalChecked();
  const touched = templatesTouched().length;
  const template = t.selectedTemplate.replace('{0}', BOLD + total + RESET).replace('{1}', BOLD + touched + RESET).replace('{2}', state.templates.length);
  const summary = `  ${template}`;
  console.log(truncateVisible(summary, cols - 1));
  console.log(`${DIM}${'─'.repeat(Math.max(0, cols - 1))}${RESET}`);
}

function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// East Asian Width — CJK/Hangul/fullwidth chars occupy 2 terminal columns.
// Without this, padToCols under-pads highlighted rows and the terminal wraps
// them onto a second line, which looks like a blank line to the user.
function charWidth(cp) {
  if (cp == null) return 1;
  return (
    (cp >= 0x1100 && cp <= 0x115F) ||    // Hangul Jamo
    (cp >= 0x2E80 && cp <= 0x303E) ||    // CJK radicals / Kangxi / CJK symbols
    (cp >= 0x3041 && cp <= 0x33FF) ||    // Hiragana, Katakana, CJK symbols
    (cp >= 0x3400 && cp <= 0x4DBF) ||    // CJK Ext-A
    (cp >= 0x4E00 && cp <= 0x9FFF) ||    // CJK Unified Ideographs
    (cp >= 0xA000 && cp <= 0xA4CF) ||    // Yi
    (cp >= 0xAC00 && cp <= 0xD7A3) ||    // Hangul Syllables
    (cp >= 0xF900 && cp <= 0xFAFF) ||    // CJK Compat Ideographs
    (cp >= 0xFE30 && cp <= 0xFE4F) ||    // CJK Compat Forms
    (cp >= 0xFF00 && cp <= 0xFF60) ||    // Fullwidth Forms
    (cp >= 0xFFE0 && cp <= 0xFFE6)       // Fullwidth signs
  ) ? 2 : 1;
}

function visibleWidth(s) {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0));
  return w;
}

// Truncate a string to a visible terminal-column width, preserving ANSI escape codes.
function truncateVisible(s, maxCols) {
  let out = '';
  let visible = 0;
  let i = 0;
  while (i < s.length) {
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      const end = s.indexOf('m', i);
      if (end === -1) { out += s.slice(i); break; }
      out += s.slice(i, end + 1);
      i = end + 1;
      continue;
    }
    const cp = s.codePointAt(i);
    const w = charWidth(cp);
    if (visible + w > maxCols) {
      out += '…' + RESET;
      return out;
    }
    out += s[i];
    if (cp > 0xFFFF) {
      // Surrogate pair — consume the low surrogate too.
      out += s[i + 1];
      i += 2;
    } else {
      i += 1;
    }
    visible += w;
  }
  return out;
}

function padToCols(s, cols) {
  const w = visibleWidth(stripAnsi(s));
  if (w >= cols - 1) return s;
  return s + ' '.repeat(cols - 1 - w);
}

// Pad `s` to exactly `width` visible terminal columns (ANSI-aware, CJK-aware).
function padVisible(s, width) {
  const w = visibleWidth(stripAnsi(s));
  return w >= width ? s : s + ' '.repeat(width - w);
}

// Precomputed column widths for phase-group browse rows — keeps the
// `[NN. Phase]`, description, and `(n/m sel)` columns vertically aligned.
const MAX_PHASE_SRC_WIDTH = Object.keys(t.phases || {}).reduce((max, name, i) => {
  const num = String(i + 1).padStart(2, '0');
  return Math.max(max, visibleWidth(`[${num}. ${name}]`));
}, 0);
const MAX_PHASE_LABEL_WIDTH = Object.values(t.phases || {}).reduce(
  (max, desc) => Math.max(max, visibleWidth(desc)),
  0
);

// Theme-aware row background.
//
// Light terminal themes: 252 (very faint near-white gray) sits just above
// the white-ish background as a soft band — user-validated for this theme.
// Dark terminal themes: 237 mirrors that feel — one step above pure black,
// barely distinguishable but clearly a lifted row.
//
// Theme detection via COLORFGBG (set by xterm/iTerm2/konsole/GNOME Terminal
// and other VTE-based terminals). Format: "fg;bg" with ANSI 16-color index.
// bg 0–6 → dark theme; bg 7–15 → light theme. Absent → default to 252
// (user's validated preference on their current theme).
function detectTerminalTheme() {
  const cfb = process.env.COLORFGBG;
  if (!cfb) return null;
  const parts = cfb.split(';');
  const bg = Number.parseInt(parts[parts.length - 1], 10);
  if (!Number.isFinite(bg)) return null;
  return bg >= 0 && bg <= 6 ? 'dark' : 'light';
}
const ROW_BG = detectTerminalTheme() === 'dark'
  ? '\x1b[48;5;237m'
  : '\x1b[48;5;252m';

// Wrap a line so the row background spans the full width, and keep DIM text
// legible against the tint. Internal RESETs would otherwise drop the
// background mid-row, so we re-assert ROW_BG after every RESET. DIM text
// (description, meta, separators) would blend into the gray background, so
// we strip the DIM attribute just for the highlighted row.
function withRowBg(s) {
  const noDim = s.replace(/\x1b\[2m/g, '');
  return ROW_BG + noDim.replace(/\x1b\[0m/g, `\x1b[0m${ROW_BG}`) + RESET;
}

// Render one body line: truncate to cols-1, then pad (for highlight background) if requested.
function emit(line, cols, { highlight = false } = {}) {
  const clipped = truncateVisible(line, cols - 1);
  if (highlight) console.log(withRowBg(padToCols(clipped, cols)));
  else console.log(clipped);
}

function truncate(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + '…';
}

// Chrome lines accounted for: 4 (header: title + help + mode-tabs + hr) + 2 (status: summary + hr) + 2 (footer: hr + status).
const CHROME_LINES = 8;

function render() {
  const { rows: termRows, cols } = termSize();
  const visible = buildVisibleRows();

  if (state.cursor < 0) state.cursor = 0;
  if (state.cursor >= visible.length) state.cursor = visible.length - 1;
  if (!isNavigable(visible[state.cursor])) {
    // Snap cursor to nearest navigable row (search forward, then backward).
    let snap = -1;
    for (let i = state.cursor; i < visible.length; i++) if (isNavigable(visible[i])) { snap = i; break; }
    if (snap === -1) for (let i = state.cursor; i >= 0; i--) if (isNavigable(visible[i])) { snap = i; break; }
    if (snap !== -1) state.cursor = snap;
  }

  const bodyHeight = Math.max(5, termRows - CHROME_LINES);
  if (state.cursor < state.scroll) state.scroll = state.cursor;
  if (state.cursor >= state.scroll + bodyHeight) state.scroll = state.cursor - bodyHeight + 1;
  // Keep scroll >= 0 and <= max possible
  state.scroll = Math.max(0, Math.min(state.scroll, Math.max(0, visible.length - bodyHeight)));

  process.stdout.write(CLEAR);
  drawHeader(cols);
  drawStatus(cols);

  const end = Math.min(visible.length, state.scroll + bodyHeight);
  for (let i = state.scroll; i < end; i++) {
    const row = visible[i];
    const isCursor = i === state.cursor;
    const pointer = isCursor ? `${BOLD}›${RESET}` : ' ';

    if (row.type === 'template') {
      const t = row.template;
      const checked = countChecked(t);
      const total = t.skills.length;
      const sign = t.expanded ? `${BOLD}-${RESET}` : `${BOLD}+${RESET}`;
      const srcTag = padVisible(`${CYAN}[${t.source}]${RESET}`, MAX_PHASE_SRC_WIDTH);
      const label = padVisible(`${BOLD}${t.name}${RESET}`, MAX_PHASE_LABEL_WIDTH);
      const countStr = checked > 0
        ? `${GREEN}(${checked}/${total} sel)${RESET}`
        : `${DIM}(${checked}/${total} sel)${RESET}`;
      const intent = `${DIM}${t.intent}${RESET}`;
      const line = `${pointer} ${sign}  ${srcTag} ${label} ${countStr}  ${intent}`;
      emit(line, cols, { highlight: isCursor });
    } else if (row.type === 'skill') {
      const s = row.skill;
      const num = `${s.index != null ? (row.index + 1) : ''}`.padStart(2);
      const check = s.checked ? `${GREEN}[x]${RESET}` : `[ ]`;
      let name = s.data ? s.data.name : s.id.split(':')[1] || s.id;
      if (!s.available) name = `${DIM}${name} (unavailable)${RESET}`;
      // In cross-source templates (e.g., Browse all), prefix with source for clarity.
      // Pad the source tag to the phase's longest source so skill-name columns align.
      if (row.template.crossSource && s.data) {
        const srcTag = `${DIM}[${s.data.source}]${RESET}`;
        const paddedSrc = row.template.maxSrcWidth
          ? padVisible(srcTag, row.template.maxSrcWidth)
          : srcTag;
        name = `${paddedSrc} ${name}`;
      }
      const cmplx = s.data ? cmplxBadge(s.data.complexity) : `${DIM}-${RESET}`;
      const intx = s.data && s.data.interactive ? `${YELLOW}I${RESET}` : ' ';
      // Supplementary meta info in parens: phase · checkpoint · outputs · invokes
      const metaParts = [];
      if (s.data) {
        if (s.data.phase && s.data.phase !== 'Other') metaParts.push(s.data.phase);
        if (s.data.defaultCheckpoint && s.data.defaultCheckpoint !== 'auto') {
          metaParts.push(`cp=${s.data.defaultCheckpoint}`);
        }
        if (Array.isArray(s.data.outputs) && s.data.outputs.length > 0) {
          const outList = s.data.outputs.slice(0, 2).join(', ');
          const more = s.data.outputs.length > 2 ? `+${s.data.outputs.length - 2}` : '';
          metaParts.push(`→${outList}${more}`);
        }
        if (Array.isArray(s.data.invokes) && s.data.invokes.length > 0) {
          metaParts.push(`calls ${s.data.invokes.length}`);
        }
      }
      const meta = metaParts.length > 0 ? ` ${DIM}(${metaParts.join(' · ')})${RESET}` : '';
      const numPart = s.index != null ? `${num}. ` : '';
      // 현재 세션에 이미 있는 스킬이면 배지 표시 (edit-session insert picker 용).
      const sessionTag = SESSION_CHECKED.has(s.id) ? ` ${DIM}● 세션에 있음${RESET}` : '';
      const head = `   ${check} ${cmplx}|${intx} ${numPart}${name}${meta}${sessionTag}`;
      const line = `${pointer} ${head}`;
      emit(line, cols, { highlight: isCursor });
    } else if (row.type === 'skill-desc') {
      const s = row.skill;
      const desc = s.data ? (s.data.usageTrigger || s.data.description || '') : 'skill not installed';
      const line = `${' '.repeat(31)}${DIM}(${desc})${RESET}`;
      emit(line, cols, { highlight: false });
    } else if (row.type === 'separator') {
      emit(`${DIM}  ${'─'.repeat(Math.max(0, cols - 4))}${RESET}`, cols);
    } else if (row.type === 'action') {
      const line = `${pointer}   ${BOLD}[ ${row.label} ]${RESET}`;
      emit(line, cols, { highlight: isCursor });
    }
  }

  // Fill remaining (each row = exactly 1 line, so this is accurate now).
  const rendered = end - state.scroll;
  for (let i = rendered; i < bodyHeight; i++) console.log();

  console.log(`${DIM}${'─'.repeat(Math.max(0, cols - 1))}${RESET}`);
  // Trim status to fit without wrapping.
  const statusLine = truncateVisible(`  ${state.status}`, cols - 1);
  // Use process.stdout.write (no newline) so we don't push lines beyond terminal height.
  process.stdout.write(statusLine);
}

// ── Keys ──
const keys = {
  UP: '\x1b[A', DOWN: '\x1b[B', RIGHT: '\x1b[C', LEFT: '\x1b[D',
  ENTER: '\r', SPACE: ' ', Q: 'q', A: 'a', R: 'r', S: 's', PLUS: '+', MINUS: '-',
  CTRL_C: '\x03',
  PGUP: '\x1b[5~', PGDN: '\x1b[6~',
};

function jumpToAction(name) {
  const visible = buildVisibleRows();
  const idx = visible.findIndex((r) => r.type === 'action' && r.name === name);
  if (idx >= 0) state.cursor = idx;
}

function setChecked(skill, checked) {
  // --single-pick 모드: 체크는 항상 최대 1개. 새로 체크할 때 기존 체크 전부 해제.
  if (SINGLE_PICK && checked) {
    for (const id of Array.from(state.checkedIds)) {
      if (id !== skill.id) {
        state.checkedIds.delete(id);
        for (const t of state.templates) for (const s of t.skills) if (s.id === id) s.checked = false;
      }
    }
  }
  skill.checked = checked;
  if (checked) state.checkedIds.add(skill.id);
  else state.checkedIds.delete(skill.id);
  // Mirror to other views: if the same skill appears in another template, sync.
  for (const t of state.templates) {
    for (const s of t.skills) {
      if (s.id === skill.id) s.checked = checked;
    }
  }
}

function toggleSkill(row) {
  if (!row.skill.available) {
    state.status = `${t.cannotSelect}: ${row.skill.id} ${t.unavailable}`;
    return;
  }
  setChecked(row.skill, !row.skill.checked);
  state.status = `${row.skill.checked ? t.selected : t.deselected}: ${row.skill.id} (${totalChecked()} ${t.total})`;
}

function toggleAllInTemplate(tmpl) {
  const anyAvailable = tmpl.skills.some((s) => s.available);
  if (!anyAvailable) {
    state.status = `${t.noAvailable} [${tmpl.source}] ${tmpl.name}`;
    return;
  }
  const allChecked = tmpl.skills.filter((s) => s.available).every((s) => s.checked);
  for (const s of tmpl.skills) {
    if (s.available) setChecked(s, !allChecked);
  }
  state.status = `${allChecked ? t.cleared : t.selectedAll}: [${tmpl.source}] ${tmpl.name}`;
}

function parentTemplateIndex(cursor) {
  const visible = buildVisibleRows();
  for (let i = cursor; i >= 0; i--) {
    if (visible[i].type === 'template') return i;
  }
  return -1;
}

function moveCursor(visible, dir, steps = 1) {
  // Move cursor by `steps` navigable rows in direction `dir` (+1 or -1), skipping non-navigable rows.
  let pos = state.cursor;
  for (let s = 0; s < steps; s++) {
    let next = pos + dir;
    while (next >= 0 && next < visible.length && !isNavigable(visible[next])) next += dir;
    if (next < 0 || next >= visible.length) break;
    pos = next;
  }
  state.cursor = pos;
}

function handleKey(key) {
  const visible = buildVisibleRows();
  const row = visible[state.cursor];

  if (key === keys.CTRL_C || key === keys.Q) {
    cleanup();
    if (SINGLE_PICK) {
      // 픽 없이 종료 — 호출자는 exit code 1 로 "사용자 취소" 를 감지.
      writeSinglePickResult(null);
      process.exit(1);
    }
    console.log(`\n${t.quitLabel}.`);
    process.exit(0);
  }

  if (key === keys.UP) {
    moveCursor(visible, -1, 1);
  } else if (key === keys.DOWN) {
    moveCursor(visible, +1, 1);
  } else if (key === keys.PGUP) {
    moveCursor(visible, -1, 10);
  } else if (key === keys.PGDN) {
    moveCursor(visible, +1, 10);
  } else if (key === keys.PLUS || key === keys.RIGHT) {
    if (row?.type === 'template') {
      row.template.expanded = true;
      state.status = `${t.expanded}: [${row.template.source}] ${row.template.name}`;
    }
  } else if (key === keys.MINUS || key === keys.LEFT) {
    if (row?.type === 'template') {
      row.template.expanded = false;
      state.status = `${t.collapsed}: [${row.template.source}] ${row.template.name}`;
    } else if (row?.type === 'skill') {
      const idx = parentTemplateIndex(state.cursor);
      if (idx >= 0) state.cursor = idx;
    }
  } else if (key === keys.SPACE) {
    if (row?.type === 'template') {
      row.template.expanded = !row.template.expanded;
    } else if (row?.type === 'skill') {
      toggleSkill(row);
    } else if (row?.type === 'action' && row.name === 'SAVE') {
      doSave();
      return;
    } else if (row?.type === 'action' && row.name === 'QUIT') {
      cleanup();
      if (SINGLE_PICK) {
        writeSinglePickResult(null);
        process.exit(1);
      }
      console.log(`\n${t.quitMsg}`);
      process.exit(0);
    }
  } else if (key === keys.ENTER) {
    if (row?.type === 'action' && row.name === 'SAVE') {
      doSave();
      return;
    }
    if (row?.type === 'action' && row.name === 'QUIT') {
      cleanup();
      console.log(`\n${t.quitMsg}`);
      process.exit(0);
    }
    if (row?.type === 'template') {
      row.template.expanded = !row.template.expanded;
    } else if (row?.type === 'skill') {
      toggleSkill(row);
    }
  } else if (key === keys.A) {
    let target = null;
    if (row?.type === 'template') target = row.template;
    else if (row?.type === 'skill') target = row.template;
    if (target) toggleAllInTemplate(target);
  } else if (key === keys.R) {
    // Fire-and-forget: reloadSkills 가 stdin/raw 모드를 직접 관리하고 끝나면 render() 호출.
    reloadSkills();
    return;
  } else if (key === keys.S) {
    jumpToAction('SAVE');
    state.status = t.jumpedToSave;
  }

  render();
}

// ── Save ──
function promptLine(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl.on('SIGINT', () => {
      rl.close();
      process.stdout.write('\n');
      console.log(t.canceled);
      process.exit(130);
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ── Reload ──
// 사용자가 'r' 키를 누르면 호출됨. 확인 프롬프트를 띄운 뒤 동의 시 skill-cache
// 를 강제로 비우고 ~/.claude/skills 와 <project>/.claude/skills 를 새로 스캔하여
// 그룹·스킬 맵·템플릿을 통째로 갱신한다. 체크한 스킬은 ID 기반으로 보존되며,
// 사라진 스킬의 ID 는 자동으로 제거된다.
async function reloadSkills() {
  // Raw mode 해제 → readline 으로 한 줄 입력 받기.
  try { process.stdin.setRawMode(false); } catch {}
  process.stdout.write(CURSOR_SHOW);
  process.stdin.removeAllListeners('data');
  process.stdout.write(CLEAR);

  const answer = (await promptLine(t.reloadPrompt)).trim();
  const yes = /^(y|yes|예|네)$/i.test(answer);

  if (yes) {
    // force=true 로 캐시 무시 재스캔. buildGroupsFn 은 초기 기동과 동일한 식.
    const rebuilt = skillCache.getSkillGroups(
      (_discovered, workflowOnly, resolvedById) =>
        buildPerPhaseBrowseTemplatesFull(workflowOnly, resolvedById),
      { force: true }
    );
    byId = rebuilt.byId;
    cachedGroups = rebuilt.groups;
    // 사라진 스킬의 체크 상태는 정리.
    for (const id of Array.from(state.checkedIds)) {
      if (!byId.has(id)) state.checkedIds.delete(id);
    }
    state.templates = buildTemplates();
    state.cursor = 0;
    state.scroll = 0;
    state.status = `${t.reloaded} (${byId.size}${lang === 'ko' ? '' : ' '}${t.skillCount})`;
  } else {
    state.status = t.reloadCanceled;
  }

  // Raw mode 재진입 + 커서 숨김 + data 리스너 재등록.
  process.stdout.write(CURSOR_HIDE);
  try { process.stdin.setRawMode(true); } catch {}
  process.stdin.setEncoding('utf8');
  process.stdin.resume();
  process.stdin.on('data', (key) => handleKey(key));

  render();
}

// --single-pick 모드의 결과를 파일(RESULT_FILE) 혹은 stdout 으로 내보낸다.
// 새 터미널 창으로 스폰된 경우엔 반드시 --result-file 경로를 써야 한다. stdout
// 은 TUI 렌더에 이미 사용 중이라 shell redirect(>) 로 가로채면 화면이 안 보임.
function writeSinglePickResult(skillId) {
  const payload = JSON.stringify({ skillId: skillId || null }) + '\n';
  if (RESULT_FILE) {
    try {
      require('node:fs').writeFileSync(RESULT_FILE, payload);
    } catch {
      // 파일 쓰기 실패 시 stdout 으로 폴백.
      process.stdout.write(payload);
    }
  } else {
    process.stdout.write(payload);
  }
}

// --single-pick 모드에서는 save 대화를 건너뛰고 체크된 스킬 ID 를 결과 파일에
// 쓴 뒤 종료한다. 호출자 (/weave:edit-session insert) 가 결과 파일을 읽어
// runtime.insertStep 에 넘겨준다.
function emitSinglePickAndExit() {
  try { process.stdin.setRawMode(false); } catch {}
  process.stdout.write(CURSOR_SHOW);
  process.stdin.removeAllListeners('data');
  process.stdout.write(CLEAR);
  const picked = [...state.checkedIds][0] || null;
  writeSinglePickResult(picked);
  process.exit(picked ? 0 : 1);
}

async function doSave() {
  if (SINGLE_PICK) return emitSinglePickAndExit();
  // Leave raw mode so readline can capture line input.
  try { process.stdin.setRawMode(false); } catch {}
  process.stdout.write(CURSOR_SHOW);
  process.stdin.removeAllListeners('data');
  process.stdout.write(CLEAR);

  // Picks come from the global checkedIds set, preserving insertion order.
  const picks = [];
  for (const sid of state.checkedIds) {
    const data = byId.get(sid);
    if (data) picks.push({ skill: { id: sid, data, available: true }, data });
  }

  if (picks.length === 0) {
    console.log(`${YELLOW}${t.noSkillsSelected}${RESET}`);
    process.exit(0);
  }

  console.log(`${BOLD}${tr(t.presetPreview, picks.length)}${RESET}\n`);
  for (let i = 0; i < picks.length; i++) {
    const { data: d } = picks[i];
    console.log(`  ${String(i + 1).padStart(2)}. ${CYAN}[${d.source}]${RESET} ${d.id}`);
    const trig = (d.usageTrigger || d.description || '').slice(0, 72);
    if (trig) console.log(`       ${DIM}${trig}${RESET}`);
  }
  console.log();

  const pickedSources = [...new Set(picks.map((p) => p.data.source))];
  if (pickedSources.length === 1) {
    console.log(`${GREEN}${tr(t.coherent, pickedSources[0])}${RESET}`);
  } else {
    console.log(
      `${YELLOW}${tr(t.crossSource, pickedSources.length, pickedSources.map((s) => `[${s}]`).join(', '))}${RESET}`
    );
  }
  console.log();

  // Ask for preset name + scope. On duplicate-in-scope, ask overwrite/rename/cancel.
  const defaultName = pickedSources.length === 1
    ? `${pickedSources[0].toLowerCase()}-custom`
    : 'custom-workflow';

  function existsInScope(n, sc) {
    try {
      storage.load(n, { scope: sc });
      return true;
    } catch {
      return false;
    }
  }

  async function askName(suggested) {
    while (true) {
      const raw = await promptLine(`${BOLD}${t.presetNameLabel}${RESET} ${DIM}[${suggested}]${RESET}: `);
      const input = raw.trim();
      const n = input || suggested;
      if (!/^[a-zA-Z0-9._-]+$/.test(n)) {
        console.log(`${RED}${t.invalidName}${RESET}`);
        continue;
      }
      return n;
    }
  }

  async function askScope() {
    const cwdRel = nodePath.relative(process.env.HOME || '', process.cwd()) || process.cwd();
    while (true) {
      const raw = await promptLine(
        `${BOLD}${t.saveWhereLabel}${RESET} ${DIM}${tr(t.saveWhereHint, cwdRel)}${RESET}: `
      );
      const input = raw.trim().toLowerCase();
      if (input === '' || input === 'p' || input === 'project') return 'project';
      if (input === 'g' || input === 'global') return 'global';
      console.log(`${RED}${t.enterPOrG}${RESET}`);
    }
  }

  let name = await askName(defaultName);
  let scope = await askScope();
  let isUpdate = false;

  // Duplicate-in-scope prompt loop.
  while (existsInScope(name, scope)) {
    const scopeLabel = scope === 'project' ? `${CYAN}[project]${RESET}` : `${MAGENTA}[global]${RESET}`;
    console.log(`\n${YELLOW}${tr(t.alreadyExists, `${BOLD}${name}${RESET}${YELLOW}`, scopeLabel)}${RESET}`);
    const raw = await promptLine(`  ${DIM}${t.overwriteHint}${RESET}: `);
    const choice = raw.trim().toLowerCase();
    if (choice === 'o' || choice === 'overwrite') {
      isUpdate = true;
      break;
    }
    if (choice === 'c' || choice === 'cancel') {
      console.log(`${YELLOW}${t.canceledNothingSaved}${RESET}`);
      process.exit(0);
    }
    // Default: rename. Ask for a new name; keep the same scope.
    name = await askName(`${name}-v2`);
  }

  const preset = {
    schemaVersion: 1,
    name,
    source: pickedSources.length === 1 ? pickedSources[0] : 'mixed',
    steps: picks.map(({ data }, i) => ({
      order: i + 1,
      skillId: data.id,
      source: data.source,
      phase: data.phase,
      checkpoint: data.defaultCheckpoint,
      interactive: data.interactive,
    })),
  };

  try {
    const result = storage.save(name, preset, { scope });
    const verb = isUpdate ? `${YELLOW}${t.updated}${RESET}` : `${GREEN}${t.saved}${RESET}`;
    const scopeLabel = scope === 'project' ? `${CYAN}[project]${RESET}` : `${MAGENTA}[global]${RESET}`;
    console.log(`\n${verb} ${scopeLabel}: ${BOLD}${name}${RESET}`);
    console.log(`${DIM}  → ${result.path}${RESET}`);
  } catch (e) {
    console.log(`\n${RED}${tr(t.saveFailed, e.message)}${RESET}`);
    process.exit(1);
  }

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

process.on('SIGINT', () => {
  cleanup();
  if (SINGLE_PICK) {
    writeSinglePickResult(null);
    process.exit(130);
  }
  console.log(`\n${t.interrupt}`);
  process.exit(130);
});
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
  state.cursor = 0;
  render();

  process.stdin.on('data', (key) => {
    handleKey(key);
  });

  process.stdout.on('resize', render);
}

start();
