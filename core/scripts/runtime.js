// runtime.js — session lifecycle + 14 subcommands. Hub module.
// Spec: docs/src-notes/core_scripts_runtime.md

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const paths = require('./paths.js');
const storage = require('./storage.js');
const discover = require('./discover.js');

const STALE_LOCK_MS = 30_000;

const DEFAULT_CONFIG = {
  defaultWorkflow: null,
  securityScan: true,
  updateCheck: true,
  compactionRestore: 'auto',
};

function nowIso() {
  return new Date().toISOString();
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function deepMerge(...layers) {
  const out = {};
  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    for (const [k, v] of Object.entries(layer)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        out[k] = deepMerge(out[k] || {}, v);
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

// ── Lock ────────────────────────────────────────────

function acquireLock(weaveDir) {
  const lockFile = path.join(weaveDir, '.lock');
  fs.mkdirSync(weaveDir, { recursive: true });
  const payload = JSON.stringify({ pid: process.pid, startedAt: nowIso() });
  try {
    fs.writeFileSync(lockFile, payload, { flag: 'wx' });
    return true;
  } catch {
    const existing = readJson(lockFile);
    if (!existing) return false;
    const age = Date.now() - new Date(existing.startedAt).getTime();
    if (age >= STALE_LOCK_MS) {
      fs.unlinkSync(lockFile);
      fs.writeFileSync(lockFile, payload, { flag: 'wx' });
      return true;
    }
    return false;
  }
}

function releaseLock(weaveDir) {
  const lockFile = path.join(weaveDir, '.lock');
  if (fs.existsSync(lockFile)) fs.unlinkSync(lockFile);
}

// ── Config ──────────────────────────────────────────

function loadConfig(workflowConfig) {
  const global = readJson(paths.GLOBAL_CONFIG);
  const project = readJson(paths.projectConfig());
  return deepMerge(DEFAULT_CONFIG, global, project, workflowConfig);
}

// ── Session helpers ─────────────────────────────────

function loadSession() {
  return readJson(paths.sessionPath());
}

function saveSession(session) {
  writeJson(paths.sessionPath(), session);
}

function requireSession() {
  const session = loadSession();
  if (!session) throw new Error('No active session');
  return session;
}

// ── Lifecycle ───────────────────────────────────────

function sessionIdFor(name) {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}-${name}`;
}

function resolveSkillPaths(steps) {
  const all = discover.discoverAll({ workflowOnly: false });
  const byId = new Map(all.map((s) => [s.id, s]));
  return steps.map((step) => {
    if (step.skillPath) return step;
    const hit = byId.get(step.skillId);
    return { ...step, skillPath: hit ? hit.path : null };
  });
}

function start(workflowName, options = {}) {
  const preset = storage.load(workflowName);
  const weaveDir = paths.projectWeaveDir();
  if (!acquireLock(weaveDir)) {
    throw new Error('Another weave session is running (lock held)');
  }
  const resolvedSteps = resolveSkillPaths(preset.steps);
  const missing = resolvedSteps
    .filter((s) => !s.skillPath)
    .map((s) => s.skillId);
  if (missing.length > 0) {
    releaseLock(weaveDir);
    throw new Error(
      `Cannot start session — these skills are not installed: ${missing.join(', ')}. ` +
        `Install the plugins or edit the preset to remove them.`
    );
  }
  const session = {
    schemaVersion: 1,
    workflowName,
    sessionId: sessionIdFor(workflowName),
    startedAt: nowIso(),
    currentStep: 0,
    autoMode: Boolean(options.auto),
    steps: resolvedSteps.map((step, idx) => ({
      ...step,
      status: idx === 0 ? 'in_progress' : 'pending',
      startedAt: idx === 0 ? nowIso() : null,
      outputs: [],
    })),
    tools: preset.tools || [],
    notes: [],
    autoDecisions: [],
  };
  saveSession(session);
  return session;
}

function end() {
  const session = requireSession();
  for (const step of session.steps) {
    if (step.status === 'pending' || step.status === 'in_progress') {
      step.status = 'skipped';
    }
  }
  session.endedAt = nowIso();
  const archive = paths.archiveDir();
  fs.mkdirSync(archive, { recursive: true });
  const archivedTo = path.join(archive, `${session.sessionId}.json`);
  fs.writeFileSync(archivedTo, JSON.stringify(session, null, 2));
  fs.unlinkSync(paths.sessionPath());
  releaseLock(paths.projectWeaveDir());
  return { archivedTo };
}

// ── Step ops ────────────────────────────────────────

function advance() {
  const session = requireSession();
  const current = session.steps[session.currentStep];
  current.status = 'completed';
  current.completedAt = nowIso();
  const nextIdx = session.currentStep + 1;
  const isDone = nextIdx >= session.steps.length;
  if (!isDone) {
    session.currentStep = nextIdx;
    session.steps[nextIdx].status = 'in_progress';
    session.steps[nextIdx].startedAt = nowIso();
  }
  saveSession(session);
  const nextStep = isDone ? null : session.steps[nextIdx];
  return {
    completed: current.skillId,
    next: nextStep ? nextStep.skillId : null,
    step: `${isDone ? session.steps.length : nextIdx + 1}/${session.steps.length}`,
    checkpoint: current.checkpoint || 'auto',
    done: isDone,
  };
}

function rollback() {
  const session = requireSession();
  if (session.currentStep === 0) throw new Error('Cannot rollback: already at first step');
  const current = session.steps[session.currentStep];
  current.status = 'pending';
  current.outputs = [];
  current.startedAt = null;
  session.currentStep -= 1;
  const prev = session.steps[session.currentStep];
  prev.status = 'in_progress';
  prev.completedAt = null;
  saveSession(session);
  return {
    rolledBackTo: session.currentStep,
    skillId: prev.skillId,
    warning: '파일 변경은 유지됩니다. 필요시 git으로 직접 되돌리세요.',
  };
}

function normalizeReported(input) {
  if (!input) return [];
  const parsed = typeof input === 'string' ? JSON.parse(input) : input;
  const files = Array.isArray(parsed) ? parsed : parsed.files || [];
  return files.map((f) => ({
    path: f.path,
    type: f.type || 'file',
    summary: f.summary || '',
    keywords: f.keywords || [],
    source: 'claude-reported',
  }));
}

function registerArtifacts(claudeReported) {
  const session = requireSession();
  const current = session.steps[session.currentStep];
  const reported = normalizeReported(claudeReported);
  const existingPaths = new Set((current.outputs || []).map((o) => o.path));
  const merged = [...(current.outputs || [])];

  for (const item of reported) {
    if (existingPaths.has(item.path)) continue;
    merged.push(item);
    existingPaths.add(item.path);
  }

  if (isGitRepo()) {
    const detected = detectGitChanges(current.gitSnapshot);
    for (const p of detected) {
      if (existingPaths.has(p)) continue;
      merged.push({ path: p, type: 'file', summary: '', keywords: [], source: 'git-detected' });
      existingPaths.add(p);
    }
  }

  current.outputs = merged;
  saveSession(session);
  return { registered: reported.length };
}

function gitStatusPorcelain() {
  try {
    const out = execSync('git status --porcelain', { encoding: 'utf8' });
    return out.split('\n').filter(Boolean);
  } catch {
    return null;
  }
}

function gitSnapshot() {
  if (!isGitRepo()) return null;
  const lines = gitStatusPorcelain() || [];
  const snap = { uncommitted: [], staged: [], untracked: [] };
  for (const line of lines) {
    const x = line[0];
    const y = line[1];
    const file = line.slice(3);
    if (x === '?' && y === '?') snap.untracked.push(file);
    else {
      if (x !== ' ' && x !== '?') snap.staged.push(file);
      if (y !== ' ' && y !== '?') snap.uncommitted.push(file);
    }
  }
  const session = loadSession();
  if (session) {
    session.steps[session.currentStep].gitSnapshot = snap;
    saveSession(session);
  }
  return snap;
}

function detectGitChanges(beforeSnapshot) {
  const current = gitStatusPorcelain();
  if (!current) return [];
  const after = new Set();
  for (const line of current) {
    const file = line.slice(3);
    if (file) after.add(file);
  }
  const before = new Set([
    ...((beforeSnapshot && beforeSnapshot.untracked) || []),
    ...((beforeSnapshot && beforeSnapshot.staged) || []),
    ...((beforeSnapshot && beforeSnapshot.uncommitted) || []),
  ]);
  return [...after].filter((f) => !before.has(f));
}

// ── Queries ─────────────────────────────────────────

function status() {
  const session = loadSession();
  if (!session) return { active: false };
  const current = session.steps[session.currentStep];
  return {
    active: true,
    workflowName: session.workflowName,
    sessionId: session.sessionId,
    currentStep: current.skillId,
    step: `${session.currentStep + 1}/${session.steps.length}`,
    status: current.status,
    autoMode: session.autoMode,
    checkpoint: current.checkpoint || 'auto',
  };
}

function history() {
  const session = loadSession();
  if (!session) return [];
  return session.steps
    .filter((s) => s.status === 'completed')
    .map((s, i) => ({
      order: s.order || i + 1,
      skillId: s.skillId,
      completedAt: s.completedAt,
      outputs: s.outputs || [],
    }));
}

function debug() {
  const session = loadSession();
  return { session, config: loadConfig(), gitRepo: isGitRepo() };
}

function flattenOutputs(session) {
  const entries = [];
  session.steps.forEach((step, idx) => {
    for (const out of step.outputs || []) {
      entries.push({ ...out, stepOrder: idx + 1, skillId: step.skillId });
    }
  });
  return entries;
}

function ref(query) {
  const session = loadSession();
  if (!session) return [];
  const all = flattenOutputs(session);
  if (!query) return all;

  const match = /^(keyword|step|type):(.+)$/.exec(query);
  if (match) {
    const [, kind, raw] = match;
    const value = raw.trim();
    if (kind === 'keyword') return all.filter((o) => (o.keywords || []).includes(value));
    if (kind === 'type') return all.filter((o) => o.type === value);
    if (kind === 'step') return all.filter((o) => String(o.stepOrder) === value);
  }

  const q = query.toLowerCase();
  return all.filter((o) => {
    const hay = [o.path, o.summary, ...(o.keywords || [])].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function note(text) {
  const session = requireSession();
  session.notes = session.notes || [];
  session.notes.push({
    step: session.currentStep + 1,
    text,
    createdAt: nowIso(),
  });
  saveSession(session);
  return { added: true, totalNotes: session.notes.length };
}

function restore() {
  const session = loadSession();
  if (!session) return { session: null, mode: 'light', previousOutputs: [] };
  const config = loadConfig();
  const current = session.steps[session.currentStep];
  const compactionAware = Boolean(current && current.compactionAware);
  let mode = config.compactionRestore;
  if (mode === 'auto') mode = compactionAware ? 'light' : 'full';
  const previousOutputs = flattenOutputs(session).filter(
    (o) => o.stepOrder <= session.currentStep
  );
  return { session, mode, previousOutputs, notes: session.notes || [] };
}

function readPluginVersion() {
  const pkgPath = path.join(paths.PLUGIN_ROOT, 'package.json');
  const pkg = readJson(pkgPath);
  return (pkg && pkg.version) || '0.0.0';
}

function checkUpdate() {
  const current = readPluginVersion();
  let channel = 'manual';
  const root = paths.PLUGIN_ROOT;
  if (root.includes(`${path.sep}claude-plugins-official${path.sep}`) || root.includes(`${path.sep}cache${path.sep}`)) {
    channel = 'marketplace';
  } else if (fs.existsSync(path.join(root, '.git'))) {
    channel = 'github';
  }
  return { channel, current };
}

function isGitRepo() {
  let dir = process.cwd();
  const { root } = path.parse(dir);
  while (true) {
    if (fs.existsSync(path.join(dir, '.git'))) return true;
    if (dir === root) return false;
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}

module.exports = {
  acquireLock,
  releaseLock,
  loadConfig,
  loadSession,
  saveSession,
  start,
  end,
  advance,
  rollback,
  registerArtifacts,
  gitSnapshot,
  status,
  history,
  debug,
  ref,
  note,
  restore,
  checkUpdate,
  isGitRepo,
};

if (require.main === module) {
  const [, , command, ...rest] = process.argv;
  const handlers = {
    start: () => start(rest[0], { auto: rest.includes('--auto') }),
    end: () => end(),
    advance: () => advance(),
    rollback: () => rollback(),
    'artifact-register': () => registerArtifacts(rest[0]),
    'git-snapshot': () => gitSnapshot(),
    status: () => status(),
    history: () => history(),
    debug: () => debug(),
    ref: () => ref(rest.join(' ')),
    note: () => note(rest.join(' ')),
    restore: () => restore(),
    'check-update': () => checkUpdate(),
    'is-git-repo': () => ({ value: isGitRepo() }),
  };
  const handler = handlers[command];
  if (!handler) {
    process.stderr.write(`Unknown command: ${command}\n`);
    process.exit(2);
  }
  try {
    process.stdout.write(JSON.stringify(handler(), null, 2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
