'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const adapters = require('../core/adapters/index.js');
const claude = require('../core/adapters/claude.js');
const gemini = require('../core/adapters/gemini.js');

// ── Fixture ────────────────────────────────────────────────
const SAMPLE = [
  '---',
  'name: weave-status',
  'description: Show current workflow session status.',
  '---',
  '',
  '# /weave:status',
  '',
  '```bash',
  'node "$WEAVE_CLI" runtime status',
  '```',
  '',
].join('\n');

// ── parseSkillMd ───────────────────────────────────────────
test('parseSkillMd — extracts frontmatter + description + body', () => {
  const p = adapters.parseSkillMd(SAMPLE);
  assert.match(p.frontmatter, /name: weave-status/);
  assert.strictEqual(p.description, 'Show current workflow session status.');
  assert.match(p.body, /# \/weave:status/);
  assert.match(p.body, /runtime status/);
});

test('parseSkillMd — no frontmatter returns whole content as body', () => {
  const p = adapters.parseSkillMd('just body\n');
  assert.strictEqual(p.frontmatter, '');
  assert.strictEqual(p.description, '');
  assert.strictEqual(p.body, 'just body\n');
});

// ── Registry ───────────────────────────────────────────────
test('listAdapters — returns both claude and gemini', () => {
  const names = adapters.listAdapters();
  assert.ok(names.includes('claude'));
  assert.ok(names.includes('gemini'));
});

test('getAdapter — throws on unknown name', () => {
  assert.throws(() => adapters.getAdapter('nonexistent'), /Unknown adapter/);
});

test('detectTargets — returns configured CLIs', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-detect-'));
  try {
    // Empty home → no detections.
    assert.deepStrictEqual(adapters.detectTargets(tmpHome), []);
    // Create .claude → claude detected.
    fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
    assert.deepStrictEqual(adapters.detectTargets(tmpHome), ['claude']);
    // Create .gemini → both detected.
    fs.mkdirSync(path.join(tmpHome, '.gemini'), { recursive: true });
    const got = adapters.detectTargets(tmpHome).sort();
    assert.deepStrictEqual(got, ['claude', 'gemini']);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

// ── Claude adapter ─────────────────────────────────────────
test('claude.render — verbatim copy into weave-<name>/SKILL.md', () => {
  const parsed = adapters.parseSkillMd(SAMPLE);
  const out = claude.render({ name: 'status', raw: SAMPLE, ...parsed });
  assert.strictEqual(out.filename, path.join('weave-status', 'SKILL.md'));
  assert.strictEqual(out.content, SAMPLE); // verbatim — byte-for-byte identical
});

test('claude.targetDir — <home>/.claude/skills', () => {
  assert.strictEqual(
    claude.targetDir('/fake/home'),
    path.join('/fake/home', '.claude', 'skills')
  );
});

// ── Gemini adapter ─────────────────────────────────────────
test('gemini.render — writes to weave/<name>.toml', () => {
  const parsed = adapters.parseSkillMd(SAMPLE);
  const out = gemini.render({ name: 'status', raw: SAMPLE, ...parsed });
  assert.strictEqual(out.filename, path.join('weave', 'status.toml'));
});

test('gemini.render — TOML has description and prompt fields', () => {
  const parsed = adapters.parseSkillMd(SAMPLE);
  const out = gemini.render({ name: 'status', raw: SAMPLE, ...parsed });
  assert.match(out.content, /^description = "/m);
  assert.match(out.content, /^prompt = '''/m);
  assert.match(out.content, /# \/weave:status/); // body preserved
  assert.match(out.content, /\{\{args\}\}/);     // args placeholder injected
});

test('gemini.render — description escapes quotes', () => {
  const skill = {
    name: 'x',
    raw: '',
    frontmatter: '',
    description: 'Has "quotes" and \\ backslash',
    body: 'body\n',
  };
  const out = gemini.render(skill);
  // First non-comment line should be `description = "...escaped..."`
  const descLine = out.content.split('\n').find((l) => l.startsWith('description ='));
  assert.ok(descLine);
  assert.match(descLine, /\\"quotes\\"/);
  assert.match(descLine, /\\\\ backslash/);
});

test('gemini.render — body containing triple-single-quote falls back to triple-double', () => {
  const skill = {
    name: 'x',
    raw: '',
    frontmatter: '',
    description: 'd',
    body: "has ''' triple\nmore\n",
  };
  const out = gemini.render(skill);
  assert.match(out.content, /^prompt = """/m);
  assert.match(out.content, /"""$/m);
});

test('gemini.targetDir — <home>/.gemini/commands', () => {
  assert.strictEqual(
    gemini.targetDir('/fake/home'),
    path.join('/fake/home', '.gemini', 'commands')
  );
});

// ── install.js integration with --target flag ──────────────
test('install.js --target=gemini writes TOML under ~/.gemini/commands/weave/', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-gemini-'));
  try {
    fs.mkdirSync(path.join(tmpHome, '.gemini'), { recursive: true });
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=gemini'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const statusToml = path.join(tmpHome, '.gemini', 'commands', 'weave', 'status.toml');
    assert.ok(fs.existsSync(statusToml), `expected ${statusToml} to exist`);
    const content = fs.readFileSync(statusToml, 'utf8');
    assert.match(content, /^description = "/m);
    assert.match(content, /^prompt = '''/m);
    // Should NOT write to ~/.claude/ when only gemini is selected.
    assert.ok(!fs.existsSync(path.join(tmpHome, '.claude', 'skills')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js --target=claude,gemini writes to both targets', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-both-'));
  try {
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude,gemini'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'weave-status', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.gemini', 'commands', 'weave', 'status.toml')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js --target=bogus exits with error', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-bogus-'));
  try {
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=bogus'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /Unknown target/);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js --dry-run does not write files', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-dry-'));
  try {
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=gemini', '--dry-run'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /dry-run/);
    // No TOML written.
    assert.ok(!fs.existsSync(path.join(tmpHome, '.gemini', 'commands', 'weave', 'status.toml')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});
