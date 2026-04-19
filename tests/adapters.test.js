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
const opencode = require('../core/adapters/opencode.js');
const codex = require('../core/adapters/codex.js');
const copilot = require('../core/adapters/copilot.js');

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
test('listAdapters — returns claude, gemini, opencode, codex, copilot', () => {
  const names = adapters.listAdapters();
  for (const n of ['claude', 'gemini', 'opencode', 'codex', 'copilot']) {
    assert.ok(names.includes(n), `expected ${n}`);
  }
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
    // Create .gemini → claude + gemini detected.
    fs.mkdirSync(path.join(tmpHome, '.gemini'), { recursive: true });
    assert.deepStrictEqual(adapters.detectTargets(tmpHome).sort(), ['claude', 'gemini']);
    // Create .config/opencode → all three detected.
    fs.mkdirSync(path.join(tmpHome, '.config', 'opencode'), { recursive: true });
    assert.deepStrictEqual(
      adapters.detectTargets(tmpHome).sort(),
      ['claude', 'gemini', 'opencode']
    );
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

// ── opencode adapter ───────────────────────────────────────
test('opencode.render — writes to weave-<name>.md with description frontmatter', () => {
  const parsed = adapters.parseSkillMd(SAMPLE);
  const out = opencode.render({ name: 'status', raw: SAMPLE, ...parsed });
  assert.strictEqual(out.filename, 'weave-status.md');
  assert.match(out.content, /^---\ndescription: "Show current workflow session status\."\n---\n/);
  assert.match(out.content, /# \/weave:status/);          // body preserved
  assert.match(out.content, /User arguments: \$ARGUMENTS/); // argv placeholder injected
});

test('opencode.render — description escapes quotes and backslashes', () => {
  const skill = {
    name: 'x',
    raw: '',
    frontmatter: '',
    description: 'Has "quotes" and \\ backslash',
    body: 'body\n',
  };
  const out = opencode.render(skill);
  const descLine = out.content.split('\n').find((l) => l.startsWith('description: '));
  assert.ok(descLine);
  assert.match(descLine, /\\"quotes\\"/);
  assert.match(descLine, /\\\\ backslash/);
});

test('opencode.render — multi-line description is collapsed to one line', () => {
  const skill = {
    name: 'x',
    raw: '',
    frontmatter: '',
    description: 'line one\nline two',
    body: 'body',
  };
  const out = opencode.render(skill);
  // Frontmatter must stay on a single line; YAML quoted string has no raw newline.
  const descLine = out.content.split('\n').find((l) => l.startsWith('description: '));
  assert.ok(descLine);
  assert.doesNotMatch(descLine, /\n/);
  assert.match(descLine, /line one line two/);
});

test('opencode.targetDir — <home>/.config/opencode/command', () => {
  assert.strictEqual(
    opencode.targetDir('/fake/home'),
    path.join('/fake/home', '.config', 'opencode', 'command')
  );
});

test('opencode.detect — true only when ~/.config/opencode exists', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-oc-detect-'));
  try {
    assert.strictEqual(opencode.detect(tmpHome), false);
    fs.mkdirSync(path.join(tmpHome, '.config', 'opencode'), { recursive: true });
    assert.strictEqual(opencode.detect(tmpHome), true);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
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

test('install.js --target=opencode writes MD under ~/.config/opencode/command/', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-opencode-'));
  try {
    fs.mkdirSync(path.join(tmpHome, '.config', 'opencode'), { recursive: true });
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=opencode'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    const statusMd = path.join(tmpHome, '.config', 'opencode', 'command', 'weave-status.md');
    assert.ok(fs.existsSync(statusMd), `expected ${statusMd} to exist`);
    const content = fs.readFileSync(statusMd, 'utf8');
    assert.match(content, /^---\ndescription: "/);
    assert.match(content, /\$ARGUMENTS/);
    // Should NOT touch ~/.claude or ~/.gemini.
    assert.ok(!fs.existsSync(path.join(tmpHome, '.claude', 'skills')));
    assert.ok(!fs.existsSync(path.join(tmpHome, '.gemini', 'commands')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js prints Copilot hint when ~/.copilot exists and claude target runs', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-cop-hint-'));
  try {
    fs.mkdirSync(path.join(tmpHome, '.copilot'), { recursive: true });
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /Copilot CLI/);
    assert.match(r.stdout, /served via/);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js skips Copilot hint when ~/.copilot is absent', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-cop-nohint-'));
  try {
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /Copilot CLI/);
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

// ── Gemini TOML miniparser ────────────────────────────────
test('gemini.parseGeminiToml — reads description + triple-single-quoted prompt', () => {
  const toml = [
    '# comment',
    'description = "run the tests"',
    "prompt = '''",
    'Run all tests.',
    'Report failures.',
    "'''",
    '',
  ].join('\n');
  const parsed = gemini.parseGeminiToml(toml);
  assert.strictEqual(parsed.description, 'run the tests');
  assert.match(parsed.body, /Run all tests\./);
  assert.match(parsed.body, /Report failures\./);
});

test('gemini.parseGeminiToml — reads triple-double-quoted prompt with escapes', () => {
  const toml = [
    'description = "x"',
    'prompt = """',
    'Line with \\"quotes\\" and \\\\ backslash.',
    '"""',
    '',
  ].join('\n');
  const parsed = gemini.parseGeminiToml(toml);
  assert.match(parsed.body, /"quotes"/);
  assert.match(parsed.body, /\\ backslash/);
});

test('gemini.parseGeminiToml — unescapes basic string description', () => {
  const toml = 'description = "has \\"quotes\\" and \\\\ slash"\nprompt = \'\'\'\'\'\'\n';
  const parsed = gemini.parseGeminiToml(toml);
  assert.strictEqual(parsed.description, 'has "quotes" and \\ slash');
});

test('gemini.parseGeminiToml — empty body when no prompt field', () => {
  const parsed = gemini.parseGeminiToml('description = "only desc"\n');
  assert.strictEqual(parsed.description, 'only desc');
  assert.strictEqual(parsed.body, '');
});

// ── readOnly adapter guards ───────────────────────────────
test('codex.render throws (read-only adapter)', () => {
  assert.throws(() => codex.render({}), /not implemented/);
  assert.strictEqual(codex.readOnly, true);
});

test('copilot.render throws (read-only adapter)', () => {
  assert.throws(() => copilot.render({}), /not implemented/);
  assert.strictEqual(copilot.readOnly, true);
});

test('install.js --target=codex refuses (read-only)', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-inst-readonly-'));
  try {
    const r = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=codex'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /read-only/);
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

// ── Uninstall — per-adapter unit tests ────────────────────
test('claude.uninstall — removes every weave-* dir, leaves other entries', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-cl-un-'));
  try {
    const dir = claude.targetDir(tmpHome);
    fs.mkdirSync(path.join(dir, 'weave-status'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'weave-status', 'SKILL.md'), 'x');
    fs.mkdirSync(path.join(dir, 'weave-run'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'weave-run', 'SKILL.md'), 'x');
    // non-weave sibling must survive
    fs.mkdirSync(path.join(dir, 'other-skill'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'other-skill', 'SKILL.md'), 'x');
    const { removed } = claude.uninstall(tmpHome);
    assert.strictEqual(removed.length, 2);
    assert.ok(!fs.existsSync(path.join(dir, 'weave-status')));
    assert.ok(!fs.existsSync(path.join(dir, 'weave-run')));
    assert.ok(fs.existsSync(path.join(dir, 'other-skill')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('claude.uninstall — noop on missing target dir', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-cl-un-missing-'));
  try {
    const { removed } = claude.uninstall(tmpHome);
    assert.deepStrictEqual(removed, []);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('claude.uninstall --dry-run lists files but does not touch them', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-cl-un-dry-'));
  try {
    const dir = claude.targetDir(tmpHome);
    fs.mkdirSync(path.join(dir, 'weave-status'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'weave-status', 'SKILL.md'), 'x');
    const { removed } = claude.uninstall(tmpHome, { dryRun: true });
    assert.strictEqual(removed.length, 1);
    assert.ok(fs.existsSync(path.join(dir, 'weave-status')), 'dry-run must not delete');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gemini.uninstall — removes weave/*.toml and empty namespace dir', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-gm-un-'));
  try {
    const nsDir = path.join(gemini.targetDir(tmpHome), 'weave');
    fs.mkdirSync(nsDir, { recursive: true });
    fs.writeFileSync(path.join(nsDir, 'status.toml'), 'x');
    fs.writeFileSync(path.join(nsDir, 'run.toml'), 'x');
    const { removed } = gemini.uninstall(tmpHome);
    assert.strictEqual(removed.length, 2);
    assert.ok(!fs.existsSync(nsDir), 'empty weave/ namespace should be pruned');
    // sibling non-weave namespaces must remain
    assert.ok(fs.existsSync(gemini.targetDir(tmpHome)));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('gemini.uninstall — keeps weave/ dir when unknown file is present', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-gm-un-keep-'));
  try {
    const nsDir = path.join(gemini.targetDir(tmpHome), 'weave');
    fs.mkdirSync(nsDir, { recursive: true });
    fs.writeFileSync(path.join(nsDir, 'status.toml'), 'x');
    fs.writeFileSync(path.join(nsDir, 'README'), 'user note');
    const { removed } = gemini.uninstall(tmpHome);
    assert.strictEqual(removed.length, 1);
    assert.ok(fs.existsSync(nsDir), 'non-TOML content should block rmdir');
    assert.ok(fs.existsSync(path.join(nsDir, 'README')));
    assert.ok(!fs.existsSync(path.join(nsDir, 'status.toml')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('opencode.uninstall — removes weave-*.md only', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-oc-un-'));
  try {
    const dir = opencode.targetDir(tmpHome);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'weave-status.md'), 'x');
    fs.writeFileSync(path.join(dir, 'weave-run.md'), 'x');
    fs.writeFileSync(path.join(dir, 'other.md'), 'keep me');
    const { removed } = opencode.uninstall(tmpHome);
    assert.strictEqual(removed.length, 2);
    assert.ok(!fs.existsSync(path.join(dir, 'weave-status.md')));
    assert.ok(!fs.existsSync(path.join(dir, 'weave-run.md')));
    assert.ok(fs.existsSync(path.join(dir, 'other.md')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('codex/copilot.uninstall — noop (read-only adapters)', () => {
  assert.deepStrictEqual(codex.uninstall('/fake', { dryRun: true }).removed, []);
  assert.deepStrictEqual(copilot.uninstall('/fake', { dryRun: true }).removed, []);
});

// ── install.js --uninstall integration ─────────────────────
test('install.js --uninstall with no target removes every CLI + runtime', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-un-all-'));
  try {
    // install all three first
    const install = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude,gemini,opencode'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(install.status, 0, install.stderr);
    // pre-create ~/.config/opencode so auto-detect picks it up on uninstall too
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'weave-status', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.gemini', 'commands', 'weave', 'status.toml')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.config', 'opencode', 'command', 'weave-status.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.weave', 'bin', 'cli.js')));

    // uninstall with no --target → all detected writable + runtime
    const un = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--uninstall'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(un.status, 0, un.stderr);
    assert.match(un.stdout, /Weave uninstalled\./);
    // every target cleaned
    assert.ok(!fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'weave-status')));
    assert.ok(!fs.existsSync(path.join(tmpHome, '.gemini', 'commands', 'weave')));
    assert.ok(!fs.existsSync(path.join(tmpHome, '.config', 'opencode', 'command', 'weave-status.md')));
    // runtime gone
    assert.ok(!fs.existsSync(path.join(tmpHome, '.weave', 'bin')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js --uninstall --target=gemini leaves other CLIs + runtime alone', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-un-partial-'));
  try {
    spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude,gemini'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    const un = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--uninstall', '--target=gemini'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(un.status, 0, un.stderr);
    // gemini gone
    assert.ok(!fs.existsSync(path.join(tmpHome, '.gemini', 'commands', 'weave')));
    // claude intact
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'weave-status', 'SKILL.md')));
    // runtime intact (partial uninstall keeps bin/)
    assert.ok(fs.existsSync(path.join(tmpHome, '.weave', 'bin', 'cli.js')));
    assert.match(un.stdout, /runtime at .+ kept/);
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js --uninstall --dry-run shows plan without deleting', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-un-dry-'));
  try {
    spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    const un = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--uninstall', '--dry-run'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(un.status, 0, un.stderr);
    assert.match(un.stdout, /dry-run/);
    // Nothing actually deleted
    assert.ok(fs.existsSync(path.join(tmpHome, '.claude', 'skills', 'weave-status', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(tmpHome, '.weave', 'bin', 'cli.js')));
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

test('install.js --uninstall preserves ~/.weave/workflows (user data)', () => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-un-wf-'));
  try {
    spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--target=claude'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    const wfDir = path.join(tmpHome, '.weave', 'workflows');
    fs.mkdirSync(wfDir, { recursive: true });
    fs.writeFileSync(path.join(wfDir, 'my-preset.json'), '{"steps":[]}');
    const un = spawnSync(
      process.execPath,
      [path.resolve(__dirname, '..', 'install.js'), '--uninstall'],
      {
        cwd: path.resolve(__dirname, '..'),
        env: { ...process.env, HOME: tmpHome, WEAVE_HOME: path.join(tmpHome, '.weave') },
        encoding: 'utf8',
      }
    );
    assert.strictEqual(un.status, 0, un.stderr);
    assert.ok(fs.existsSync(path.join(wfDir, 'my-preset.json')), 'user presets must survive');
    assert.match(un.stdout, /preserved/);
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
