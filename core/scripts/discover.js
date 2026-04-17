// discover.js — dynamic Agentic Workflow scanner.
// Spec: docs/src-notes/core_scripts_discover.md
// Decisions: A (installed_plugins.json + priority), B (no marketplaces),
//            C (skills+commands, strict filter), D (fixed-depth + symlink follow),
//            E (per-type source extraction + whitelist prefix).

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

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

// ── Phase keywords (check Implementation/Review first due to overlapping words) ──
const PHASE_KEYWORDS = [
  ['Implementation', /\btest-driven|\btdd\b|\bdev-story\b|\bquick-dev(?:-new-preview)?\b|\bexecute-phase\b|\bautonomous\b|\bexecuting-plans\b|\bsubagent-driven\b|\bimplement\w*|\bnew-milestone\b|\binsert-phase\b|\bquick-spec\b|\bexecut\w*/],
  ['Review/QA',      /\bcode-review\b|\breview-[a-z]+\b|\bverify\b|\bverification\b|\bvalidate\w*|\baudit\w*|\bqa\b|\batdd\b|\btest-design\b|\btest-review\b|\btest-automate\b|\bautomate\w*|\btrace\b|\bci\b|\be2e\b|\bui-review\b|\brequesting-code-review\b|\breceiving-code-review\b|\badd-tests\b|\bperformance-test\b|\bplaytest\b/],
  ['Discovery',      /\bbrainstorm\w*|\bresearch\w*|\bdiscover\w*|\bmarket-research\b|\btechnical-research\b|\bdomain-research\b|\belicitation\b/],
  ['Requirements',   /\bprd\b|\bspec\b|\bbrief\b|\brequirement\w*|\bvalidate-prd\b|\bcheck-implementation-readiness\b|\bproduct-brief\b/],
  ['Design',         /\barchitect\w*|\bgdd\b|\bnarrative|\bdesign-system\b|\bux\b|\bui-phase\b|\bdesign-thinking\b|\bscenarios\b|\binnovation-strategy\b|\bstorytelling\b/],
  ['Planning',       /\bepic\b|\bstor(?:y|ies)\b|\bsprint-planning\b|\bplan-phase\b|\bplan-milestone-gaps\b|\broadmap\b|\bcreate-story\b|\bwriting-plans\b|\bdiscuss-phase\b|\bsprint-status\b/],
  ['Completion',     /\bretrospective\b|\bcomplete-milestone\b|\barchive\w*|\bmilestone-summary\b|\bfinishing-a-development-branch\b|\bship\b/],
  ['Control',        /\bcorrect-course\b|\bpause-work\b|\bresume-work\b|\brollback\b|\bdebug\w*|\bforensics\b|\bmanager\b|\bhealth\b|\bcleanup\b|\brestore\b|\bsession-report\b/],
];

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
  return {
    name: nameM ? nameM[1].trim() : '',
    description: descM ? descM[1].trim().replace(/^["']|["']$/g, '') : '',
    body,
    frontmatter: fm,
    path: filePath,
  };
}

// ── Phase inference ──

function inferPhase(name, description) {
  const numeric = name && name.match(/^(\d+)-/);
  if (numeric) return { phase: `Phase ${numeric[1]}`, explicit: true };
  const nameLower = (name || '').toLowerCase();
  const descLower = (description || '').toLowerCase();
  // Priority 1: match on name (stronger signal than description).
  for (const [phase, re] of PHASE_KEYWORDS) {
    if (re.test(nameLower)) return { phase, explicit: false };
  }
  // Priority 2: match on description.
  for (const [phase, re] of PHASE_KEYWORDS) {
    if (re.test(descLower)) return { phase, explicit: false };
  }
  return { phase: 'Other', explicit: false };
}

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

// ──────────────────────────── scanning ───────────────────────────

function scanLocation(spec) {
  const out = [];
  switch (spec.type) {
    case 'home-skill':
    case 'project-skill':
    case 'plugin-skill': {
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
    case 'home-command':
    case 'project-command': {
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
    case 'plugin-command': {
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
  }
  return out;
}

// ─────────────────────── workflow filter ─────────────────────────

function isAgenticWorkflow(parsed, name) {
  const desc = parsed.description || '';
  const body = parsed.body || '';
  const text = `${desc}\n${body}`;

  if (E1_AGENT_PERSONA.test(desc)) {
    return { included: false, reason: 'E1 agent persona' };
  }
  if (name && /-agent-/.test(name)) {
    return { included: false, reason: 'E2 name contains -agent-' };
  }
  if (E3_UTILITY_START.test(desc)) {
    return { included: false, reason: 'E3 utility/settings' };
  }
  if (E4_QUERY_START.test(desc)) {
    return { included: false, reason: 'E4 query/help' };
  }
  if (!I1_VERBS.test(text)) {
    return { included: false, reason: 'I1 missing workflow verb' };
  }
  if (!I2_NOUNS.test(text)) {
    return { included: false, reason: 'I2 missing workflow noun' };
  }
  return { included: true, reason: 'workflow' };
}

// ─────────────────────── source extraction ───────────────────────

function extractSource(filePath, type, context) {
  if (type === 'plugin-skill' || type === 'plugin-command') {
    return (context && context.name) || 'unknown';
  }
  if (type === 'home-command' || type === 'project-command') {
    return path.basename(path.dirname(filePath));
  }
  // home-skill / project-skill
  const dirName = path.basename(path.dirname(filePath));
  const extra = (context && context.customSourcePrefixes) || [];
  const all = [...extra, ...KNOWN_PREFIXES].sort((a, b) => b.length - a.length);
  for (const p of all) {
    if (dirName === p || dirName.startsWith(`${p}-`)) return p;
  }
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

function discoverAll(options = {}) {
  const { workflowOnly = true, debug = false, homeDir, cwd, customSourcePrefixes } = options;
  const home = homeDir || os.homedir();
  const cwdPath = cwd || process.cwd();

  const specs = [];
  const plugins = readInstalledPlugins(home);
  for (const p of plugins) {
    specs.push({ type: 'plugin-skill', root: p.installPath, pluginContext: p });
    specs.push({ type: 'plugin-command', root: p.installPath, pluginContext: p });
  }
  specs.push({ type: 'home-skill', root: path.join(home, '.claude', 'skills') });
  specs.push({ type: 'home-command', root: path.join(home, '.claude', 'commands') });
  specs.push({ type: 'project-skill', root: path.join(cwdPath, '.claude', 'skills') });
  specs.push({ type: 'project-command', root: path.join(cwdPath, '.claude', 'commands') });

  const candidates = [];
  for (const spec of specs) {
    candidates.push(...scanLocation(spec));
  }

  const skills = [];
  for (const c of candidates) {
    let content;
    try {
      content = fs.readFileSync(c.filePath, 'utf8');
    } catch {
      continue;
    }
    const parsed = parseSkillMd(content, c.filePath);
    if (!parsed.name) {
      if (debug) process.stderr.write(`skipped: no name in ${c.filePath}\n`);
      continue;
    }

    const ctx = { ...c.pluginContext, customSourcePrefixes };
    const source = extractSource(c.filePath, c.type, ctx);
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
    const rank = RANK[c.type];

    const wf = isAgenticWorkflow(parsed, nameOnly);
    if (workflowOnly && !wf.included) {
      if (debug) process.stderr.write(`[EXCLUDED] ${id} — ${wf.reason}\n`);
      continue;
    }
    if (debug && wf.included) process.stderr.write(`[INCLUDED] ${id}\n`);

    const workflowContent = readWorkflowMd(c.filePath);
    // Use idName (source-stripped) so `wds-0-*` passes as `0-*` for numeric-prefix detection.
    const { phase, explicit: phaseExplicit } = inferPhase(idName, parsed.description);
    const invokes = extractInvokes(parsed.body);

    skills.push({
      id,
      name: nameOnly,
      source,
      type: c.type,
      description: parsed.description,
      path: c.filePath,
      rank,
      compactionAware: detectCompactionAware(parsed.body),
      interactive: detectInteractive(parsed.description, parsed.body),
      defaultCheckpoint: inferDefaultCheckpoint(parsed.description, parsed.body),
      phase,
      phaseExplicit,
      usageTrigger: extractUsageTrigger(parsed.description),
      inputs: extractInputs(parsed),
      outputs: extractOutputs(parsed, workflowContent),
      invokes,
      complexity: inferComplexity(parsed, workflowContent, invokes.length),
      tools: extractTools(parsed.frontmatter),
    });
  }

  return dedupByPriority(skills, { debug });
}

// ─────────────────────────────── CLI ─────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);
  const workflowOnly = !args.includes('--all');
  const debug = args.includes('--debug');
  const result = discoverAll({ workflowOnly, debug });
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

module.exports = {
  discoverAll,
  readInstalledPlugins,
  scanLocation,
  parseSkillMd,
  isAgenticWorkflow,
  extractSource,
  dedupByPriority,
  detectCompactionAware,
  detectInteractive,
  inferDefaultCheckpoint,
  inferPhase,
  extractUsageTrigger,
  readWorkflowMd,
  extractOutputs,
  extractInputs,
  extractInvokes,
  inferComplexity,
  extractTools,
  KNOWN_PREFIXES,
};
