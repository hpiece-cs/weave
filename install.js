#!/usr/bin/env node
// install.js — copy runtime to <weave-home>/bin/ and deploy weave skills to
// one or more CLI targets (Claude Code, Gemini CLI, …) via adapters.
// Honors $WEAVE_HOME override or command-line argument.
//
// Usage:
//   node install.js                              # auto-detect targets (all configured CLIs)
//   node install.js --target=claude              # single target
//   node install.js --target=claude,gemini       # explicit multi-target
//   node install.js --dry-run                    # print what would be written, don't write
//   node install.js /custom/weave/home           # override WEAVE_HOME via positional arg
//   WEAVE_HOME=/x node install.js
//
// Available adapters: claude, gemini (see core/adapters/).

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const adapters = require('./core/adapters/index.js');

const REPO_ROOT = __dirname;
const HOME = process.env.HOME || os.homedir();

// ─────────── argv parsing ───────────────────────────────────

function parseArgs(argv) {
  const out = { positional: [], target: null, dryRun: false };
  for (const a of argv) {
    if (a === '--dry-run') out.dryRun = true;
    else if (a.startsWith('--target=')) out.target = a.slice('--target='.length);
    else out.positional.push(a);
  }
  return out;
}

const argv = parseArgs(process.argv.slice(2));

// Support three ways to specify WEAVE_HOME (precedence):
//   1. Command-line positional argument
//   2. Environment variable
//   3. Default: ~/.weave
let WEAVE_HOME = argv.positional[0] || process.env.WEAVE_HOME || path.join(HOME, '.weave');
if (!path.isAbsolute(WEAVE_HOME)) {
  WEAVE_HOME = path.resolve(process.cwd(), WEAVE_HOME);
}
const WEAVE_BIN = path.join(WEAVE_HOME, 'bin');

// Bundle = files + dirs that make up the runtime.
const RUNTIME_FILES = ['cli.js'];
const RUNTIME_DIRS = ['core', 'demo'];

// ─────────── runtime copy ───────────────────────────────────

function copyFile(src, dst, { dryRun }) {
  if (dryRun) {
    process.stdout.write(`  [dry-run] write ${dst}\n`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function writeFile(dst, content, { dryRun }) {
  if (dryRun) {
    process.stdout.write(`  [dry-run] write ${dst} (${content.length} bytes)\n`);
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, content);
}

function copyDir(srcDir, dstDir, { dryRun }) {
  if (!dryRun) fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDir(src, dst, { dryRun });
    else if (entry.isFile()) copyFile(src, dst, { dryRun });
  }
}

function installRuntime({ dryRun }) {
  if (!dryRun) fs.mkdirSync(WEAVE_BIN, { recursive: true });
  for (const file of RUNTIME_FILES) {
    copyFile(path.join(REPO_ROOT, file), path.join(WEAVE_BIN, file), { dryRun });
  }
  for (const dir of RUNTIME_DIRS) {
    copyDir(path.join(REPO_ROOT, dir), path.join(WEAVE_BIN, dir), { dryRun });
  }
  if (dryRun) return;
  // Make entry points executable.
  const executables = [
    path.join(WEAVE_BIN, 'cli.js'),
    path.join(WEAVE_BIN, 'core', 'hooks', 'weave-statusline.js'),
  ];
  for (const exec of executables) {
    if (fs.existsSync(exec)) fs.chmodSync(exec, 0o755);
  }
}

// ─────────── skill discovery (source) ───────────────────────

function listSkillSources() {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, 'SKILL.md')));
}

function loadSkill(name) {
  const src = path.join(REPO_ROOT, 'skills', name, 'SKILL.md');
  const raw = fs.readFileSync(src, 'utf8');
  const parsed = adapters.parseSkillMd(raw);
  return {
    name,
    raw,
    frontmatter: parsed.frontmatter,
    description: parsed.description,
    body: parsed.body,
  };
}

// ─────────── target selection ───────────────────────────────

function resolveTargets(spec) {
  if (!spec) {
    const detected = adapters.detectTargets(HOME);
    if (detected.length === 0) {
      // Default to claude even if ~/.claude/ is absent — preserves legacy install UX.
      return ['claude'];
    }
    return detected;
  }
  const list = spec
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const t of list) {
    if (!adapters.listAdapters().includes(t)) {
      throw new Error(
        `Unknown target: ${t}. Available: ${adapters.listAdapters().join(', ')}`
      );
    }
  }
  return list;
}

// ─────────── skill installation per target ─────────────────

function installSkillsForTarget(adapter, { dryRun }) {
  const names = listSkillSources();
  const dir = adapter.targetDir(HOME);
  const written = [];
  for (const name of names) {
    const skill = loadSkill(name);
    const { filename, content } = adapter.render(skill);
    const dst = path.join(dir, filename);
    writeFile(dst, content, { dryRun });
    written.push(dst);
  }
  return { count: names.length, dir, written };
}

// ─────────── main ───────────────────────────────────────────

function statuslineSnippet() {
  const hookPath = path.join(WEAVE_BIN, 'core', 'hooks', 'weave-statusline.js');
  return [
    '// Claude Code only — add to ~/.claude/settings.json → statusLine:',
    JSON.stringify(
      {
        statusLine: {
          type: 'command',
          command: `node "${hookPath}"`,
        },
      },
      null,
      2
    ),
  ].join('\n');
}

function main() {
  const { dryRun, target } = argv;
  let targets;
  try {
    targets = resolveTargets(target);
  } catch (e) {
    process.stderr.write(e.message + '\n');
    process.exit(2);
  }

  installRuntime({ dryRun });

  const summary = [
    dryRun ? 'Weave install (dry-run).' : 'Weave installed.',
    `  runtime  →  ${WEAVE_HOME}`,
  ];

  const perTargetCounts = {};
  for (const name of targets) {
    const adapter = adapters.getAdapter(name);
    const { count, dir } = installSkillsForTarget(adapter, { dryRun });
    perTargetCounts[name] = count;
    summary.push(`  ${adapter.label.padEnd(12)} →  ${dir} (${count} skills)`);
  }

  summary.push('');
  summary.push(`Targets: ${targets.join(', ')}`);
  summary.push('');
  summary.push('Optional — StatusLine hook:');
  summary.push(statuslineSnippet());
  summary.push('');
  summary.push(`Usage from SKILL.md:  node "$WEAVE_HOME/bin/cli.js" <subcommand> [args...]`);
  summary.push('  where WEAVE_HOME defaults to $HOME/.weave');

  process.stdout.write(summary.join('\n') + '\n');
}

main();
