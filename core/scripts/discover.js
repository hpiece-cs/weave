// discover.js — dynamic Agentic Workflow scanner.
// Spec: docs/src-notes/core_scripts_discover.md
// Decisions: A (installed_plugins.json + priority), B (no marketplaces),
//            C (skills+commands, strict filter), D (fixed-depth + symlink follow),
//            E (per-type source extraction + whitelist prefix).

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sourceRegistry = require('./source-registry.js');
const geminiAdapter = require('../adapters/gemini.js');
const { detectRunningCli } = require('./cli-detect.js');

// ── Known prefixes (longest first for correct matching) ──
const KNOWN_PREFIXES = [
  'bmad-testarch',
  'bmad-cis',
  'bmad',
  'gds',
  'wds',
  'gsd',
  'superpowers',
];

// ── Stage 2 filter patterns ──
const E1_AGENT_PERSONA = /(talk\s+to\s+[A-Z]?\w+|requests?\s+the\s+[\w\s-]+?\s+(agent|expert|specialist|coach|strategist|maestro|oracle|analyst|architect|guru|master|designer|developer|writer|scrum\s+master|qa\s+architect|qa\s+engineer|engineer))/i;
const E3_UTILITY_START = /^\s*(switch|reset|configure|install|uninstall|setup|set\s+up|initialize|manage|enable|disable|clean\s+up)\b/i;
const E4_QUERY_START = /^\s*(show|display|list|help|about)\b/i;

// Use \w* suffix to catch verb/noun variants (e.g., create/creates/creating, test/testing).
const I1_VERB_ROOTS = 'creat|design|writ|generat|implement|review|test|plan|execut|analyz|refactor|build|produc|validat|orchestrat|complet|archiv|audit|develop|compos|ship|brainstorm|debug|research|edit|solv|conduct|identif|appl|map|verif|structur|facilitat|establish|transform|craft|gather|automat|trace|explor|determin|evolv|evol|improv|summar';
const I1_VERBS = new RegExp(`\\b(?:${I1_VERB_ROOTS})\\w*`, 'i');
const I2_NOUN_ROOTS = 'spec|document|plan|prd|gdd|stor|epic|architectur|report|design\\s+system|feature|ux|narrative|brief|test|code|workflow|phase|step|checklist|process\\s+flow|milestone|task|roadmap|component|product|project|session|workshop|engineer|pipeline|methodolog';
const I2_NOUNS = new RegExp(`\\b(?:${I2_NOUN_ROOTS})\\w*`, 'i');

// ── Heuristic helper patterns ──
const COMPACTION_RE = /\b(stepsCompleted|STATE\.md|HANDOFF\.json|compaction|resume|re-read)\b/i;
const INTERACTIVE_RE = /\b(asks?|prompts?)\s+(the\s+)?user\b|\binteractive\b|\buser\s+(selects?|chooses?|decides?|inputs?|decisions?|choice)\b/i;
const VERIFY_RE = /\breview\b|\btest\b|\bverif|\baudit\b|\bqa\b/i;

// ── Extraction patterns ──
const USAGE_TRIGGER_RE = /Use\s+when[^.]*(?:\.|$)/i;
const OUTPUT_BODY_PATTERNS = [
  /(?:write|writes|save|saves|output)(?:\s+to)?\s+[`'"]?([a-zA-Z0-9_\-\/.{}]+\.(?:md|json|yaml|yml|toml|txt))/gi,
  /(?:creates?|produces?|generates?|outputs?)\s*:\s*[`'"]?([a-zA-Z0-9_\-\/.{}]+\.(?:md|json|yaml|yml|toml|txt))/gi,
  /(?:^|\n)\*\*(?:Creates|Produces|Output|Writes to)\*\*\s*:\s*[`'"]?([a-zA-Z0-9_\-\/.{}]+\.(?:md|json|yaml|yml|toml|txt))/gmi,
];
// Dropped "after/following" — procedural, not prerequisite. Require article \b to avoid "a" matching "all".
const INPUT_DESC_PATTERNS = [
  /\bwhen\s+you\s+have\s+(?:\b(?:a|an|the)\s+)?([a-zA-Z][\w\s-]{3,50}?)(?=\s+(?:to|,|\.|$))/gi,
  /\brequires?\s+(?:\b(?:a|an|the)\s+)?([a-zA-Z][\w\s-]{3,50}?)(?=\s+(?:to|before|,|\.|$))/gi,
  /\bexpects?\s+(?:\b(?:a|an|the)\s+)?([a-zA-Z][\w\s-]{3,50}?)(?=\s+(?:to|before|,|\.|$))/gi,
  /\bgiven\s+(?:\b(?:a|an|the)\s+)?([a-zA-Z][\w\s-]{3,50}?)(?=\s+(?:to|before|,|\.|$))/gi,
];
const INPUT_NOISE_START = /^(it|this|that|these|those|you|your|all|some|any|every|no|each|same|other|another|here|there|when|where|while|if)\s/i;
const INVOKE_PATTERNS = [
  /Skill\s*\(\s*["']([\w-]+:[\w-]+)["']/g,
  /\buse\s+([\w-]+:[\w-]+)(?=\s+(?:skill|instead|before|after|$|[.,]))/gi,
  /\bpairs?\s+with\s*:?\s*([\w-]+:[\w-]+)/gi,
  /REQUIRED\s+SUB-SKILL\s*:?[^\w]*(?:Use\s+)?([\w-]+:[\w-]+)/gi,
  /\/([\w-]+:[\w-]+)\b/g,
];

// ── Location rank (for dedup priority) ──
const RANK = {
  'project-skill': 1,
  'project-command': 1,
  'home-skill': 2,
  'home-command': 2,
  'plugin-skill': 3,
  'plugin-command': 3,
};

// ──────────────────────────── helpers ────────────────────────────

function listDir(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function statOrNull(p) {
  try {
    return fs.statSync(p); // follows symlinks
  } catch {
    return null;
  }
}

// ──────────────────────────── parsing ────────────────────────────

function parseSkillMd(content, filePath) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { name: '', description: '', body: content, frontmatter: '', path: filePath };
  }
  const fm = m[1];
  const body = m[2];
  const nameM = fm.match(/^name:\s*(.+)$/m);
  const descM = fm.match(/^description:\s*(.+)$/m);
  const processStageM = fm.match(/^processStage:\s*(.+)$/m);
  const processOrderM = fm.match(/^processOrder:\s*(.+)$/m);
  const lifecycleOrderM = fm.match(/^lifecycleOrder:\s*(.+)$/m);
  return {
    name: nameM ? nameM[1].trim() : '',
    description: descM ? descM[1].trim().replace(/^["']|["']$/g, '') : '',
    body,
    frontmatter: fm,
    path: filePath,
    processStage: processStageM ? processStageM[1].trim() : undefined,
    processOrder: processOrderM ? parseFloat(processOrderM[1].trim()) : undefined,
    lifecycleOrder: lifecycleOrderM ? parseFloat(lifecycleOrderM[1].trim()) : undefined,
  };
}

// ── Stage inference — 3-layer classifier & sorter ──
// Spec: docs/src-notes/core_scripts_discover.md §단계 추론
//
//   Layer A (stage 배정):     processStage ?? OVERRIDE_TABLE[id] ?? inferStageByKeywords ?? 'Other'
//   Layer B (stage 순서):     STAGE_ORDER 고정 배열 — 메인 흐름 27 + 교차횡단 3
//   Layer C (stage 내 정렬):  (methodologyPriority, processOrder, numericPrefix, stepIndex, alpha)

// ── Stage taxonomy (30 stages: 27 main flow + 3 cross-cutting) ──

const STAGE_ORDER = [
  // Main flow — project-time 순서
  'Onboarding',
  'Alignment',
  'Discovery',
  'Research',
  'Requirements — Mapping',
  'Requirements — Spec',
  'Requirements — Validation',
  'Design — UX',
  'Design — Architecture',
  'Design — Narrative/Content',
  'Design — Asset Spec',
  'Planning — Epics',
  'Planning — Stories',
  'Planning — Sprint',
  'Test Strategy',
  'Implementation — Dev',
  'Implementation — Assets',
  'Code Review',
  'Test — Automation',
  'QA — NFR',
  'QA — Review/Trace',
  'CI/CD',
  'User Testing',
  'Integration & Ship',
  'Retrospective',
  'Milestone Close',
  'Evolution',
  // Cross-cutting bands — 메인 흐름 뒤
  'Control',
  'Docs',
  'Progress',
];

const STAGE_INDEX = Object.create(null);
STAGE_ORDER.forEach((s, i) => { STAGE_INDEX[s] = i; });

// ── Stage keywords — Layer A step ③ (priority-first match on name, then description) ──
// Specificity 내림차순: 좁은 패턴을 먼저 두어 넓은 패턴이 덮지 않도록.
const STAGE_KEYWORDS = [
  // Requirements variants (validation > mapping > spec — validation must beat 'prd' on spec)
  ['Requirements — Validation', /\b(validate-prd|check-implementation-readiness|implementation-readiness)\b/i],
  ['Requirements — Mapping',    /\b(trigger-mapping|scenarios?)\b/i],
  ['Requirements — Spec',       /\b(create-prd|edit-prd|create-gdd|quick-spec|\bprd\b|\bgdd\b)\b/i],

  // Test/QA variants (strategy > automation > review/trace > NFR; User Testing is separate)
  ['Test Strategy',             /\b(test-design|test-framework|\batdd\b|test-driven-development|\btdd\b)\b/i],
  ['Test — Automation',         /\b(test-automate|e2e-scaffold|\be2e\b|qa-generate-e2e|add-tests|automate-tests)\b/i],
  ['QA — NFR',                  /\b(\bnfr\b|performance-test|performance-profil)\b/i],
  ['QA — Review/Trace',         /\b(test-review|\btrace\b|traceability|validate-phase|audit-uat|verification-before-completion|verify-work)\b/i],
  ['User Testing',              /\b(playtest|uat)\b/i],

  // Code Review before generic 'review'
  ['Code Review',               /\b(code-review|requesting-code-review|receiving-code-review|adversarial-review|edge-case-hunter)\b/i],

  // CI/CD before Implementation (ci keyword)
  ['CI/CD',                     /\b(testarch-ci|ci-pipeline|setup-ci|scaffold-ci|ci\/cd)\b/i],

  // Implementation
  ['Implementation — Assets',   /\b(asset-generation)\b/i],
  ['Implementation — Dev',      /\b(dev-story|quick-dev(-new-preview)?|execute-phase|\bautonomous\b|executing-plans|subagent-driven|agentic-development|quick-flow|implement\w*|\bexecut\w*)\b/i],

  // Planning (sprint > stories > epics — sprint is most specific)
  ['Planning — Sprint',         /\b(sprint-planning|sprint-status|plan-milestone-gaps|add-phase|insert-phase|\broadmap\b)\b/i],
  ['Planning — Stories',        /\b(create-story|plan-phase|discuss-phase|writing-plans|create-the-next-story)\b/i],
  ['Planning — Epics',          /\b(create-epics|epics-and-stories|\bepic\w*)\b/i],

  // Design (asset spec > narrative > architecture > UX)
  ['Design — Asset Spec',       /\b(asset-spec|design-asset)\b/i],
  ['Design — Narrative/Content',/\b(narrative|storytelling|create-narrative)\b/i],
  ['Design — Architecture',     /\b(create-architecture|game-architecture|architect\w*)\b/i],
  ['Design — UX',               /\b(ux-design|design-system|ui-phase|create-ux-design|\bux\b|design-thinking)\b/i],

  // Upstream (research > discovery > alignment > onboarding)
  ['Research',                  /\b(research\w*|market-research|domain-research|technical-research)\b/i],
  ['Discovery',                 /\b(brainstorm\w*|innovation-strategy|problem-solving|elicit\w*|ideate\w*|discover\w*)\b/i],
  ['Alignment',                 /\b(alignment-signoff|project-brief|product-brief|game-brief|\bbrief\b|\balignment\b)\b/i],
  ['Onboarding',                /\b(project-setup|new-project|new-workspace|bmb-setup|bmad-init|\binit\b|workspace-init)\b/i],

  // Closing chain
  ['Retrospective',             /\bretrospective\b/i],
  ['Milestone Close',           /\b(complete-milestone|milestone-summary|audit-milestone|archive\w*)\b/i],
  ['Integration & Ship',        /\b(pr-branch|finishing-a-development-branch|\bship\b)\b/i],
  ['Evolution',                 /\b(product-evolution|document-project|brownfield)\b/i],

  // Cross-cutting bands — last
  ['Progress',                  /\b(session-report|\bprogress\b|\bstats\b|add-todo|check-todos|\bnote\b|add-backlog|plant-seed|\bthread\b|workstreams|list-workspaces)\b/i],
  ['Docs',                      /\b(distillator|index-docs|shard-doc|generate-project-context|editorial-review|map-codebase)\b/i],
  ['Control',                   /\b(correct-course|pause-work|resume-work|rollback|debug\w*|forensics|\bmanager\b|\bhealth\b|cleanup|restore|reapply-patches)\b/i],
];

// ── OVERRIDE_TABLE — Layer A step ② (outliers, ≤20 entries) ──
// Specific skill ids where keyword inference is wrong or ambiguous.
// Keep small; large table signals that STAGE_KEYWORDS needs refinement.
const OVERRIDE_TABLE = {
  'gsd:new-milestone':                         'Requirements — Spec',
  'gsd:new-project':                           'Onboarding',
  'gsd:new-workspace':                         'Onboarding',
  'gsd:ui-phase':                              'Design — UX',
  'gsd:plan-phase':                            'Planning — Stories',
  'gsd:discuss-phase':                         'Planning — Stories',
  'gsd:execute-phase':                         'Implementation — Dev',
  'gsd:autonomous':                            'Implementation — Dev',
  'gsd:quick':                                 'Implementation — Dev',
  'gsd:fast':                                  'Implementation — Dev',
  'gsd:verify-work':                           'User Testing',
  'gsd:audit-uat':                             'QA — Review/Trace',
  'gsd:validate-phase':                        'QA — Review/Trace',
  'gsd:ship':                                  'Integration & Ship',
  'gsd:pr-branch':                             'Integration & Ship',
  'gsd:map-codebase':                          'Docs',
  'gsd:session-report':                        'Progress',
  'superpowers:subagent-driven-development':   'Implementation — Dev',
  'wds:6-asset-generation':                    'Implementation — Assets',
  'bmad-cis:storytelling':                     'Design — Narrative/Content',
};

// ── Methodology ordering — Layer C ──
// Default priority order. Override via `discoverAll({ methodologyPriority: [...] })`.
const DEFAULT_METHODOLOGY_PRIORITY = [
  'wds', 'bmad', 'bmad-testarch', 'bmad-cis', 'gds', 'gsd', 'superpowers',
];

// Curated intra-methodology step index (optional, partial). Only core flow skills.
// Missing entries fall through to processOrder / numericPrefix / alphabetical in compareSkills.
const METHODOLOGY_STEP_INDEX = {
  // wds — project phases have numeric prefix, covered by numericPrefixIndex. Keep this empty for wds.
  // bmad core flow
  'bmad:brainstorming':            10,
  'bmad:product-brief':             20,
  'bmad:create-prd':                30,
  'bmad:validate-prd':              40,
  'bmad:check-implementation-readiness': 45,
  'bmad:create-architecture':       50,
  'bmad:create-ux-design':          55,
  'bmad:create-epics-and-stories':  60,
  'bmad:create-story':              70,
  'bmad:sprint-planning':           80,
  'bmad:dev-story':                 90,
  'bmad:code-review':              100,
  'bmad:retrospective':            110,
  // gds — mirrors bmad
  'gds:brainstorm-game':            10,
  'gds:create-game-brief':           20,
  'gds:create-gdd':                 30,
  'gds:check-implementation-readiness': 45,
  'gds:game-architecture':          50,
  'gds:create-ux-design':           55,
  'gds:create-narrative':           58,
  'gds:create-epics-and-stories':   60,
  'gds:create-story':               70,
  'gds:sprint-planning':            80,
  'gds:dev-story':                  90,
  'gds:code-review':               100,
  'gds:retrospective':             110,
  // gsd core flow
  'gsd:new-project':                 5,
  'gsd:new-milestone':              10,
  'gsd:discuss-phase':              15,
  'gsd:plan-phase':                 20,
  'gsd:execute-phase':              30,
  'gsd:autonomous':                 31,
  'gsd:verify-work':                40,
  'gsd:ship':                       50,
  'gsd:complete-milestone':         60,
  // superpowers
  'superpowers:brainstorming':      10,
  'superpowers:writing-plans':      20,
  'superpowers:test-driven-development': 25,
  'superpowers:executing-plans':    30,
  'superpowers:subagent-driven-development': 35,
  'superpowers:requesting-code-review': 40,
  'superpowers:receiving-code-review': 45,
  'superpowers:verification-before-completion': 50,
  'superpowers:finishing-a-development-branch': 60,
};

// ── Layer A — stage assignment ──

function inferStageByKeywords(name, description) {
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();
  for (const [stage, re] of STAGE_KEYWORDS) {
    if (re.test(nameLower)) return stage;
  }
  for (const [stage, re] of STAGE_KEYWORDS) {
    if (re.test(descLower)) return stage;
  }
  return null;
}

function classifyStage({ id, name = '', description = '', processStage } = {}) {
  // ① frontmatter
  if (processStage && STAGE_INDEX[processStage] != null) {
    return { phase: processStage, explicit: true, source: 'frontmatter' };
  }
  // ② override table
  if (id && OVERRIDE_TABLE[id]) {
    return { phase: OVERRIDE_TABLE[id], explicit: true, source: 'override' };
  }
  // ③ keyword inference
  const keywordStage = inferStageByKeywords(name, description);
  if (keywordStage) {
    return { phase: keywordStage, explicit: false, source: 'keyword' };
  }
  // ④ fallback
  return { phase: 'Other', explicit: false, source: 'fallback' };
}

// Backward-compat: 기존 호출부는 (name, description) 으로만 쓰므로 시그니처 유지.
// `options.{id, processStage}` 주입 시 ①②가 활성화된다.
function inferPhase(name, description, options = {}) {
  return classifyStage({
    id: options.id,
    name,
    description,
    processStage: options.processStage,
  });
}

// ── Layer B — stage index for ordering ──
function stageIndexOf(phase) {
  const idx = STAGE_INDEX[phase];
  return idx != null ? idx : STAGE_ORDER.length; // 'Other' / unknown → 맨 끝
}

// ── Layer C — intra-stage sort comparator ──

function numericPrefixIndex(name) {
  const m = (name || '').match(/^(\d+)-/);
  return m ? parseInt(m[1], 10) : Infinity;
}

function makeCompareSkills({ methodologyPriority } = {}) {
  const pri = Array.isArray(methodologyPriority) && methodologyPriority.length
    ? methodologyPriority
    : DEFAULT_METHODOLOGY_PRIORITY;
  const priIdx = Object.create(null);
  pri.forEach((src, i) => { priIdx[src] = i; });

  return function compareSkills(a, b) {
    // 1. Stage order
    const sa = stageIndexOf(a.phase);
    const sb = stageIndexOf(b.phase);
    if (sa !== sb) return sa - sb;
    // 2. Methodology priority (unknown source → end)
    const ma = priIdx[a.source] != null ? priIdx[a.source] : pri.length;
    const mb = priIdx[b.source] != null ? priIdx[b.source] : pri.length;
    if (ma !== mb) return ma - mb;
    // 3. processOrder frontmatter
    const poA = a.processOrder != null ? a.processOrder : Infinity;
    const poB = b.processOrder != null ? b.processOrder : Infinity;
    if (poA !== poB) return poA - poB;
    // 4. Numeric prefix on name (wds-0-*, wds-1-*, ...)
    const npA = numericPrefixIndex(a.name);
    const npB = numericPrefixIndex(b.name);
    if (npA !== npB) return npA - npB;
    // 5. Curated methodology step index
    const stA = METHODOLOGY_STEP_INDEX[a.id] != null ? METHODOLOGY_STEP_INDEX[a.id] : Infinity;
    const stB = METHODOLOGY_STEP_INDEX[b.id] != null ? METHODOLOGY_STEP_INDEX[b.id] : Infinity;
    if (stA !== stB) return stA - stB;
    // 6. Alphabetical
    return (a.id || '').localeCompare(b.id || '');
  };
}

const compareSkills = makeCompareSkills();

// ── Usage trigger ──

function extractUsageTrigger(description) {
  const m = (description || '').match(USAGE_TRIGGER_RE);
  if (m) return m[0].trim().replace(/\.$/, '');
  return (description || '').split('.')[0].trim();
}

// ── Outputs (+ workflow.md follow) ──

function readWorkflowMd(skillPath) {
  // SKILL.md points to workflow.md in same dir (BMAD/GDS pattern).
  const dir = path.dirname(skillPath);
  const wfPath = path.join(dir, 'workflow.md');
  const st = statOrNull(wfPath);
  if (!st || !st.isFile()) return null;
  try {
    return fs.readFileSync(wfPath, 'utf8');
  } catch {
    return null;
  }
}

function extractOutputs(parsed, workflowContent) {
  const outputs = new Set();
  // BMAD/GDS pattern: workflow.md frontmatter has outputFile.
  if (workflowContent) {
    const wfFm = workflowContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (wfFm) {
      const outputFileM = wfFm[1].match(/^outputFile:\s*['"]?([^'"\n]+?)['"]?\s*$/m);
      if (outputFileM) outputs.add(outputFileM[1].trim());
    }
  }
  const body = (parsed.body || '') + '\n' + (workflowContent || '');
  for (const p of OUTPUT_BODY_PATTERNS) {
    let m;
    const re = new RegExp(p.source, p.flags);
    while ((m = re.exec(body)) !== null) {
      outputs.add(m[1]);
    }
  }
  return Array.from(outputs).slice(0, 10);
}

// ── Inputs ──

function extractInputs(parsed) {
  const inputs = new Set();
  const text = `${parsed.description || ''}\n${parsed.body || ''}`;
  for (const p of INPUT_DESC_PATTERNS) {
    let m;
    const re = new RegExp(p.source, p.flags);
    while ((m = re.exec(text)) !== null) {
      const phrase = (m[1] || '').trim().replace(/[,.]+$/, '');
      if (phrase.length < 4 || phrase.length >= 60) continue;
      if (INPUT_NOISE_START.test(phrase)) continue;
      // Require at least one non-trivial word (length ≥ 4)
      if (!/\b[a-zA-Z]{4,}\b/.test(phrase)) continue;
      inputs.add(phrase);
    }
  }
  return Array.from(inputs).slice(0, 5);
}

// ── Invokes ──

function extractInvokes(body) {
  const invokes = new Set();
  const text = body || '';
  for (const p of INVOKE_PATTERNS) {
    let m;
    const re = new RegExp(p.source, p.flags);
    while ((m = re.exec(text)) !== null) {
      invokes.add(m[1]);
    }
  }
  return Array.from(invokes);
}

// ── Complexity ──

function inferComplexity(parsed, workflowContent, invokesCount = 0) {
  const total = (parsed.body || '').length + (workflowContent || '').length;
  // Orchestrators with 3+ sub-skill invocations → full regardless of body size.
  if (invokesCount >= 3) return 'full';
  // Large body → full.
  if (total >= 5000) return 'full';
  // Medium body OR has any invocations → medium.
  if (total >= 1000 || invokesCount >= 1) return 'medium';
  return 'quick';
}

// ── Tools ──

function extractTools(frontmatter) {
  if (!frontmatter) return [];
  const inline = frontmatter.match(/^allowed-tools:\s*\[([^\]]+)\]/m);
  if (inline) {
    return inline[1].split(',').map((t) => t.trim().replace(/['"]/g, '')).filter(Boolean);
  }
  const multi = frontmatter.match(/^allowed-tools:[ \t]*\n((?:[ \t]+-[ \t]+[\w-]+[ \t]*\n?)+)/m);
  if (multi) {
    return (multi[1].match(/-[ \t]+([\w-]+)/g) || []).map((x) => x.replace(/^-[ \t]+/, ''));
  }
  return [];
}

// ──────────────────────── installed plugins ──────────────────────

function readInstalledPlugins(homeDir) {
  const home = homeDir || os.homedir();
  const filePath = path.join(home, '.claude', 'plugins', 'installed_plugins.json');
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  const plugins = data.plugins || {};
  const out = [];
  for (const [key, entries] of Object.entries(plugins)) {
    const atIdx = key.indexOf('@');
    const name = atIdx >= 0 ? key.slice(0, atIdx) : key;
    const marketplace = atIdx >= 0 ? key.slice(atIdx + 1) : '';
    const list = Array.isArray(entries) ? entries : [entries];
    for (const entry of list) {
      if (entry && entry.installPath) {
        out.push({
          name,
          marketplace,
          installPath: entry.installPath,
          version: entry.version || '',
        });
      }
    }
  }
  return out;
}

// expandGeminiExtensions — enumerate ~/.gemini/extensions/<ext>/{skills,commands}/
// into concrete specs so the caller doesn't have to care that Gemini extensions
// nest skills/commands under a per-extension directory.
function expandGeminiExtensions(extRoot, type) {
  const specs = [];
  let entries;
  try {
    entries = fs.readdirSync(extRoot, { withFileTypes: true });
  } catch {
    return specs;
  }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_')) continue;
    const extDir = path.join(extRoot, e.name);
    const skillsDir = path.join(extDir, 'skills');
    const cmdDir = path.join(extDir, 'commands');
    if (fs.existsSync(skillsDir)) {
      specs.push({ type, root: skillsDir });
    }
    if (fs.existsSync(cmdDir)) {
      // Extension commands are flat MD (description + body, no `name:` frontmatter).
      specs.push({ type, root: cmdDir, scan: 'command-flat', nameFromFilename: true });
    }
  }
  return specs;
}

// ──────────────────────────── scanning ───────────────────────────
//
// Spec shape:
//   { type, root, scan?, parse?, nameFromFilename?, pluginContext? }
//
// `type`  — used for RANK/dedup priority. One of home-skill/project-skill/
//           plugin-skill/home-command/project-command/plugin-command.
// `scan`  — optional: which enumeration primitive to use. Defaults based on type.
//   * 'skill-dir'       — <root>/<name>/SKILL.md  (default for *-skill)
//   * 'command-ns'      — <root>/<ns>/<name>.md  (default for home/project-command)
//   * 'plugin-commands' — <root>/commands/*.md   (default for plugin-command)
//   * 'command-flat'    — <root>/*.md             (opencode native, extension commands)
//   * 'command-toml-ns' — <root>/<ns>/<name>.toml (gemini commands)
// `parse` / `nameFromFilename` — forwarded onto every candidate this spec yields,
// so per-CLI format quirks stay attached to the file they describe.

function defaultScanForType(type) {
  switch (type) {
    case 'plugin-command':
      return 'plugin-commands';
    case 'home-command':
    case 'project-command':
      return 'command-ns';
    default:
      return 'skill-dir';
  }
}

function scanLocation(spec) {
  const out = [];
  const scan = spec.scan || defaultScanForType(spec.type);
  switch (scan) {
    case 'skill-dir': {
      // plugin-skill has an extra /skills/ segment before the per-skill dirs;
      // all other *-skill specs pass the skills root directly.
      const skillsRoot = spec.type === 'plugin-skill'
        ? path.join(spec.root, 'skills')
        : spec.root;
      for (const name of listDir(skillsRoot)) {
        if (name.startsWith('_') || name.startsWith('.')) continue;
        const sub = path.join(skillsRoot, name);
        const s = statOrNull(sub);
        if (!s || !s.isDirectory()) continue;
        const skill = path.join(sub, 'SKILL.md');
        const ss = statOrNull(skill);
        if (ss && ss.isFile()) {
          out.push({
            type: spec.type,
            filePath: skill,
            pluginContext: spec.pluginContext,
          });
        }
      }
      break;
    }
    case 'command-ns': {
      for (const source of listDir(spec.root)) {
        if (source.startsWith('_') || source.startsWith('.')) continue;
        const sub = path.join(spec.root, source);
        const s = statOrNull(sub);
        if (!s || !s.isDirectory()) continue;
        for (const fname of listDir(sub)) {
          if (!fname.endsWith('.md') || fname === 'SKILL.md') continue;
          const file = path.join(sub, fname);
          const fst = statOrNull(file);
          if (fst && fst.isFile()) {
            out.push({ type: spec.type, filePath: file });
          }
        }
      }
      break;
    }
    case 'plugin-commands': {
      const cmdRoot = path.join(spec.root, 'commands');
      for (const fname of listDir(cmdRoot)) {
        if (!fname.endsWith('.md')) continue;
        const file = path.join(cmdRoot, fname);
        const fst = statOrNull(file);
        if (fst && fst.isFile()) {
          out.push({
            type: 'plugin-command',
            filePath: file,
            pluginContext: spec.pluginContext,
          });
        }
      }
      break;
    }
    case 'command-flat': {
      for (const fname of listDir(spec.root)) {
        if (fname.startsWith('.') || fname.startsWith('_')) continue;
        if (!fname.endsWith('.md') || fname === 'SKILL.md') continue;
        const file = path.join(spec.root, fname);
        const fst = statOrNull(file);
        if (fst && fst.isFile()) {
          out.push({ type: spec.type, filePath: file });
        }
      }
      break;
    }
    case 'command-toml-ns': {
      for (const source of listDir(spec.root)) {
        if (source.startsWith('_') || source.startsWith('.')) continue;
        const sub = path.join(spec.root, source);
        const s = statOrNull(sub);
        if (!s || !s.isDirectory()) continue;
        for (const fname of listDir(sub)) {
          if (!fname.endsWith('.toml')) continue;
          const file = path.join(sub, fname);
          const fst = statOrNull(file);
          if (fst && fst.isFile()) {
            out.push({ type: spec.type, filePath: file });
          }
        }
      }
      break;
    }
  }
  // Forward per-spec format hints onto every candidate it produced.
  for (const c of out) {
    if (spec.parse) c.parse = spec.parse;
    if (spec.nameFromFilename) c.nameFromFilename = true;
  }
  return out;
}

// ─────────────────── classification (Stage 2) ────────────────────
//
// Framework (spec: docs/src-notes/core_scripts_discover.md §Stage 2):
//
//   classify_component:
//     if has_feedback_loop or not is_atomic → Agentic Workflow
//     else                                  → Methodology Skill
//
// Current attribute approximation (vocabulary proxy):
//
//   is_atomic          ← E1∨E2∨E3∨E4 matched, or NOT (I1 ∧ I2)
//   has_feedback_loop  ← (not yet signaled — reserved for structural
//                         signals like invoke count, loop/retry language,
//                         workflow.md feedback steps)

function classifyComponent(parsed, name) {
  const desc = parsed.description || '';
  const body = parsed.body || '';
  const text = `${desc}\n${body}`;
  const signals = [];

  // Exclusion signals (E1–E4) → is_atomic = true (methodology skill).
  let isAtomic = false;
  let exclusionReason = null;
  if (E1_AGENT_PERSONA.test(desc)) {
    isAtomic = true;
    exclusionReason = 'E1 agent persona';
    signals.push('E1');
  } else if (name && /-agent-/.test(name)) {
    isAtomic = true;
    exclusionReason = 'E2 name contains -agent-';
    signals.push('E2');
  } else if (E3_UTILITY_START.test(desc)) {
    isAtomic = true;
    exclusionReason = 'E3 utility/settings';
    signals.push('E3');
  } else if (E4_QUERY_START.test(desc)) {
    isAtomic = true;
    exclusionReason = 'E4 query/help';
    signals.push('E4');
  } else {
    // No exclusion → check inclusion signals (I1 ∧ I2).
    const i1 = I1_VERBS.test(text);
    const i2 = I2_NOUNS.test(text);
    if (i1) signals.push('I1');
    if (i2) signals.push('I2');
    if (!i1) {
      isAtomic = true;
      exclusionReason = 'I1 missing workflow verb';
    } else if (!i2) {
      isAtomic = true;
      exclusionReason = 'I2 missing workflow noun';
    } else {
      isAtomic = false; // Both workflow verb and artifact noun present.
    }
  }

  // has_feedback_loop is not yet signaled by the vocabulary proxy.
  // Reserved for future structural enhancement (invokes count, loop/retry
  // language, workflow.md feedback steps). See src-notes §5.
  const hasFeedbackLoop = false;

  const isWorkflow = hasFeedbackLoop || !isAtomic;

  if (isWorkflow) {
    return {
      type: 'Agentic Workflow',
      category: 'Planning/Reasoning',
      description: '이 요소는 결과에 따라 다음 행동을 결정하는 제어 흐름을 가집니다.',
      isAtomic,
      hasFeedbackLoop,
      signals,
      included: true,
      reason: 'workflow',
    };
  }
  return {
    type: 'Methodology Skill',
    category: 'Action/Tool',
    description: '이 요소는 특정 입력을 받아 결과를 내놓는 단일 기능 단위입니다.',
    isAtomic,
    hasFeedbackLoop,
    signals,
    included: false,
    reason: exclusionReason,
  };
}

// Backward-compatible wrapper used by `discoverAll` gating and by tests.
function isAgenticWorkflow(parsed, name) {
  const r = classifyComponent(parsed, name);
  return { included: r.included, reason: r.reason };
}

// ─────────────────────── source extraction ───────────────────────

function extractSource(filePath, type, context) {
  if (type === 'plugin-skill' || type === 'plugin-command') {
    return (context && context.name) || 'unknown';
  }
  if (type === 'home-command' || type === 'project-command') {
    return path.basename(path.dirname(filePath));
  }
  // home-skill / project-skill. Two layouts can appear under these types:
  //   skill-dir:    <root>/<prefix>-<name>/SKILL.md  → prefix is in dirname
  //   command-flat: <root>/<prefix>-<name>.md        → prefix is in filename
  //
  // Seed prefixes beat the source-registry lookup here. The registry can
  // derive noisy clusters from common parent directory names (e.g. every file
  // under ~/.config/opencode/command/ shares that parent, so derivation once
  // learned "command" as a prefix); curated KNOWN_PREFIXES are never wrong.
  const dirName = path.basename(path.dirname(filePath));
  const baseName = path.basename(filePath, path.extname(filePath));
  const extra = (context && context.customSourcePrefixes) || [];
  const seeds = [...extra, ...KNOWN_PREFIXES].sort((a, b) => b.length - a.length);
  for (const candidate of [dirName, baseName]) {
    for (const p of seeds) {
      if (candidate === p || candidate.startsWith(`${p}-`)) return p;
    }
  }
  // Registry — covers derived clusters for unknown methodologies not in seed.
  if (context && context.registry) {
    const resolved = sourceRegistry.resolveSource(filePath, context.registry);
    if (resolved) return resolved;
  }
  // Last resort — use the parent dirname verbatim (legacy behavior).
  return dirName;
}

// ──────────────────────── heuristic helpers ──────────────────────

function detectCompactionAware(body) {
  return COMPACTION_RE.test(body || '');
}

function detectInteractive(description, body) {
  return INTERACTIVE_RE.test(`${description || ''}\n${body || ''}`);
}

function inferDefaultCheckpoint(description, body) {
  return VERIFY_RE.test(`${description || ''}\n${body || ''}`) ? 'verify' : 'auto';
}

// ───────────────────── dedup by priority ─────────────────────────

function dedupByPriority(skills, { debug = false } = {}) {
  const byId = new Map();
  for (const s of skills) {
    const existing = byId.get(s.id);
    if (!existing) {
      byId.set(s.id, s);
    } else if (s.rank < existing.rank) {
      if (debug) {
        process.stderr.write(
          `shadowed: ${s.id} at ${existing.path} (hidden by ${s.path})\n`
        );
      }
      byId.set(s.id, s);
    } else if (debug) {
      process.stderr.write(
        `shadowed: ${s.id} at ${s.path} (hidden by ${existing.path})\n`
      );
    }
  }
  return Array.from(byId.values());
}

// ───────────────────────── discoverAll ───────────────────────────

// 2-pass discoverAll:
//   Pass 0 — resolve active CLI (env or options.cli) → pick adapter(s) → collect specs.
//   Pass 1 — scan + parse, collect {candidate, parsed}.
//   Derivation — source-registry.js: seed + trie boundaries + append-only registry.
//   Pass 2 — assign source (via registry) + classify (pure) + 30-stage + assemble.
function discoverAll(options = {}) {
  const {
    workflowOnly = true,
    debug = false,
    homeDir,
    cwd,
    customSourcePrefixes,
    minClusterSize = 2,
    persistRegistry = true,
    cli,
    projectRoot,
  } = options;
  const home = homeDir || os.homedir();
  const cwdPath = cwd || process.cwd();
  const registryRoot = projectRoot || cwdPath;

  // Pass 0 — CLI resolution + per-CLI path list. `cli` option overrides env
  // detection. `'all'` scans every CLI's effective roots (legacy / cross-CLI
  // composition). Unknown name falls through to 'claude' via detectRunningCli.
  //
  // Each branch below declares the EFFECTIVE ROOTS that CLI reads at runtime —
  // i.e. the paths visible in that CLI session, including cross-CLI paths
  // (opencode reads ~/.claude/skills, copilot reads .claude + .agents, etc.).
  const resolvedCli = cli || detectRunningCli();
  const includeAll = resolvedCli === 'all';
  const specs = [];

  if (includeAll || resolvedCli === 'claude') {
    // Claude Code — plugins (from installed_plugins.json) + home/project skills + commands
    for (const p of readInstalledPlugins(home)) {
      specs.push({ type: 'plugin-skill',   root: p.installPath, pluginContext: p });
      specs.push({ type: 'plugin-command', root: p.installPath, pluginContext: p });
    }
    specs.push({ type: 'home-skill',      root: path.join(home, '.claude', 'skills') });
    specs.push({ type: 'home-command',    root: path.join(home, '.claude', 'commands') });
    specs.push({ type: 'project-skill',   root: path.join(cwdPath, '.claude', 'skills') });
    specs.push({ type: 'project-command', root: path.join(cwdPath, '.claude', 'commands') });
  }

  if (includeAll || resolvedCli === 'opencode') {
    // opencode — native command files (flat MD) + native skills dirs + cross-CLI reads
    // Authoritative: opencode/packages/opencode/src/skill/index.ts (EXTERNAL_DIRS).
    specs.push({ type: 'home-skill',    root: path.join(home, '.config', 'opencode', 'command'),  scan: 'command-flat', nameFromFilename: true });
    specs.push({ type: 'home-skill',    root: path.join(home, '.config', 'opencode', 'commands'), scan: 'command-flat', nameFromFilename: true });
    specs.push({ type: 'home-skill',    root: path.join(home, '.config', 'opencode', 'skill') });
    specs.push({ type: 'home-skill',    root: path.join(home, '.config', 'opencode', 'skills') });
    // specs.push({ type: 'home-skill',    root: path.join(home, '.claude', 'skills') });
    // specs.push({ type: 'home-skill',    root: path.join(home, '.agents', 'skills') });
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.opencode', 'command'),  scan: 'command-flat', nameFromFilename: true });
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.opencode', 'commands'), scan: 'command-flat', nameFromFilename: true });
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.opencode', 'skill') });
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.opencode', 'skills') });
    // specs.push({ type: 'project-skill', root: path.join(cwdPath, '.claude', 'skills') });
    // specs.push({ type: 'project-skill', root: path.join(cwdPath, '.agents', 'skills') });
  }

  if (includeAll || resolvedCli === 'codex') {
    // Codex — ~/.codex/skills (deprecated but still read) + ~/.agents/skills (primary).
    // Does NOT read ~/.claude/skills.
    specs.push({ type: 'home-skill',    root: path.join(home, '.codex', 'skills') });
    specs.push({ type: 'home-skill',    root: path.join(home, '.agents', 'skills') });
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.agents', 'skills') });
  }

  if (includeAll || resolvedCli === 'copilot') {
    // Copilot CLI — all three user paths + all three project paths
    specs.push({ type: 'home-skill',    root: path.join(home, '.copilot', 'skills') });
    // specs.push({ type: 'home-skill',    root: path.join(home, '.claude', 'skills') });
    // specs.push({ type: 'home-skill',    root: path.join(home, '.agents', 'skills') });
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.github', 'skills') });
    // specs.push({ type: 'project-skill', root: path.join(cwdPath, '.claude', 'skills') });
    // specs.push({ type: 'project-skill', root: path.join(cwdPath, '.agents', 'skills') });
  }

  if (includeAll || resolvedCli === 'gemini') {
    // Gemini CLI — native skills + TOML commands + extension skills/commands + crossover
    specs.push({ type: 'home-skill', root: path.join(home, '.gemini', 'skills') });
    // specs.push({ type: 'home-skill', root: path.join(home, '.agents', 'skills') });
    specs.push({
      type: 'home-skill',
      root: path.join(home, '.gemini', 'commands'),
      scan: 'command-toml-ns',
      parse: geminiAdapter.parseGeminiToml,
      nameFromFilename: true,
    });
    specs.push(...expandGeminiExtensions(path.join(home, '.gemini', 'extensions'), 'home-skill'));
    specs.push({ type: 'project-skill', root: path.join(cwdPath, '.gemini', 'skills') });
    // specs.push({ type: 'project-skill', root: path.join(cwdPath, '.agents', 'skills') });
    specs.push({
      type: 'project-skill',
      root: path.join(cwdPath, '.gemini', 'commands'),
      scan: 'command-toml-ns',
      parse: geminiAdapter.parseGeminiToml,
      nameFromFilename: true,
    });
    specs.push(...expandGeminiExtensions(path.join(cwdPath, '.gemini', 'extensions'), 'project-skill'));
  }

  const candidates = [];
  for (const spec of specs) {
    candidates.push(...scanLocation(spec));
  }

  // ── Pass 1: parse only ────────────────────────────────────────
  const parsedList = [];
  for (const c of candidates) {
    let content;
    try {
      content = fs.readFileSync(c.filePath, 'utf8');
    } catch {
      continue;
    }
    const parseFn = c.parse || parseSkillMd;
    const parsed = parseFn(content, c.filePath);
    if (!parsed.name && c.nameFromFilename) {
      parsed.name = path.basename(c.filePath, path.extname(c.filePath));
    }
    if (!parsed.name) {
      if (debug) process.stderr.write(`skipped: no name in ${c.filePath}\n`);
      continue;
    }
    parsedList.push({
      filePath: c.filePath,
      type: c.type,
      pluginContext: c.pluginContext,
      parsed,
    });
  }

  // ── Derivation: seed + registry + trie boundaries ─────────────
  const seed = [
    ...(Array.isArray(customSourcePrefixes) ? customSourcePrefixes : []),
    ...KNOWN_PREFIXES,
  ];
  const existingRegistry = persistRegistry ? sourceRegistry.loadRegistry(registryRoot) : null;
  const derived = sourceRegistry.derivePrefixes(parsedList, {
    seed,
    existingRegistry,
    minClusterSize,
  });
  // Build an in-memory registry object for resolveSource() in Pass 2.
  const registry = { schemaVersion: sourceRegistry.SCHEMA_VERSION, assignments: derived.assignments };
  if (persistRegistry) {
    try {
      sourceRegistry.saveRegistry(derived, registryRoot);
    } catch (e) {
      if (debug) process.stderr.write(`[source-registry] warn: could not write: ${e.message}\n`);
    }
  }

  // ── Pass 2: source + classify + phase + assemble ──────────────
  const skills = [];
  for (const item of parsedList) {
    const { filePath, type, pluginContext, parsed } = item;
    const ctx = { ...pluginContext, customSourcePrefixes, registry };
    const source = extractSource(filePath, type, ctx);

    // Strip any "source:" prefix from frontmatter name (commands convention).
    const nameRaw = parsed.name.includes(':')
      ? parsed.name.split(':').slice(1).join(':')
      : parsed.name;
    // For id, also strip "${source}-" prefix from name to avoid redundancy.
    const idName = nameRaw.startsWith(`${source}-`)
      ? nameRaw.slice(source.length + 1)
      : nameRaw;
    const id = `${source}:${idName}`;
    const nameOnly = nameRaw;
    const rank = RANK[type];

    const cls = classifyComponent(parsed, nameOnly);
    if (workflowOnly && !cls.included) {
      if (debug) process.stderr.write(`[EXCLUDED] ${id} — ${cls.reason}\n`);
      continue;
    }
    if (debug && cls.included) process.stderr.write(`[INCLUDED] ${id}\n`);

    const workflowContent = readWorkflowMd(filePath);
    const outputs = extractOutputs(parsed, workflowContent);
    const invokes = extractInvokes(parsed.body);

    // Layer A (stage 배정) — id 포함으로 OVERRIDE_TABLE 활성화.
    // idName(source-stripped)을 name 로 넘겨 prefix 중복 없는 키워드 매칭 유지.
    const phaseResult = inferPhase(idName, parsed.description, {
      id,
      processStage: parsed.processStage,
    });

    skills.push({
      id,
      name: nameOnly,
      source,
      type,
      description: parsed.description,
      path: filePath,
      rank,
      classification: cls.type,         // 'Agentic Workflow' | 'Methodology Skill'
      classificationCategory: cls.category,
      isAtomic: cls.isAtomic,
      hasFeedbackLoop: cls.hasFeedbackLoop,
      classificationSignals: cls.signals,
      compactionAware: detectCompactionAware(parsed.body),
      interactive: detectInteractive(parsed.description, parsed.body),
      defaultCheckpoint: inferDefaultCheckpoint(parsed.description, parsed.body),
      phase: phaseResult.phase,
      phaseExplicit: phaseResult.explicit,
      phaseSource: phaseResult.source,      // 'frontmatter' | 'override' | 'keyword' | 'fallback'
      stageIndex: stageIndexOf(phaseResult.phase),
      usageTrigger: extractUsageTrigger(parsed.description),
      inputs: extractInputs(parsed),
      outputs,
      invokes,
      complexity: inferComplexity(parsed, workflowContent, invokes.length),
      tools: extractTools(parsed.frontmatter),
      processStage: parsed.processStage,
      processOrder: parsed.processOrder,
      lifecycleOrder: parsed.lifecycleOrder,
    });
  }

  const deduped = dedupByPriority(skills, { debug });
  // Layer B+C — stage 순서 + 단계 내 정렬. 호출측은 이미 정렬된 배열을 받는다.
  const cmp = makeCompareSkills({ methodologyPriority: options.methodologyPriority });
  deduped.sort(cmp);
  return deduped;
}

// ─────────────────────────────── CLI ─────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const workflowOnly = !args.includes('--all');
  const debug = args.includes('--debug');
  const cliFlag = args.find((a) => a.startsWith('--cli='));
  const cli = cliFlag ? cliFlag.slice('--cli='.length) : undefined;
  const result = discoverAll({ workflowOnly, debug, cli });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = {
  discoverAll,
  readInstalledPlugins,
  scanLocation,
  parseSkillMd,
  classifyComponent,
  isAgenticWorkflow,
  extractSource,
  dedupByPriority,
  detectCompactionAware,
  detectInteractive,
  inferDefaultCheckpoint,
  inferPhase,
  classifyStage,
  inferStageByKeywords,
  stageIndexOf,
  numericPrefixIndex,
  compareSkills,
  makeCompareSkills,
  extractUsageTrigger,
  readWorkflowMd,
  extractOutputs,
  extractInputs,
  extractInvokes,
  inferComplexity,
  extractTools,
  KNOWN_PREFIXES,
  STAGE_ORDER,
  STAGE_INDEX,
  STAGE_KEYWORDS,
  OVERRIDE_TABLE,
  DEFAULT_METHODOLOGY_PRIORITY,
  METHODOLOGY_STEP_INDEX,
};
