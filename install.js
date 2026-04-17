#!/usr/bin/env node
// install.js — copy runtime to <weave-home>/bin/ and skills to <claude-skills>/weave-*/SKILL.md.
// Honors $WEAVE_HOME override.
// Run: node install.js   (or: npm run install-weave)

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = __dirname;
const HOME = process.env.HOME || os.homedir();
const WEAVE_HOME = process.env.WEAVE_HOME || path.join(HOME, '.weave');
const WEAVE_BIN = path.join(WEAVE_HOME, 'bin');
const CLAUDE_SKILLS = path.join(HOME, '.claude', 'skills');

// Bundle = files + dirs that make up the runtime.
const RUNTIME_FILES = ['cli.js'];
const RUNTIME_DIRS = ['core', 'demo'];

function copyFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dst = path.join(dstDir, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else if (entry.isFile()) copyFile(src, dst);
  }
}

function listSkillSources() {
  const skillsDir = path.join(REPO_ROOT, 'skills');
  if (!fs.existsSync(skillsDir)) return [];
  return fs
    .readdirSync(skillsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => fs.existsSync(path.join(skillsDir, name, 'SKILL.md')));
}

function installRuntime() {
  fs.mkdirSync(WEAVE_BIN, { recursive: true });
  for (const file of RUNTIME_FILES) {
    const src = path.join(REPO_ROOT, file);
    const dst = path.join(WEAVE_BIN, file);
    copyFile(src, dst);
  }
  for (const dir of RUNTIME_DIRS) {
    const src = path.join(REPO_ROOT, dir);
    const dst = path.join(WEAVE_BIN, dir);
    copyDir(src, dst);
  }

  // Make entry points executable.
  const executables = [
    path.join(WEAVE_BIN, 'cli.js'),
    path.join(WEAVE_BIN, 'core', 'hooks', 'weave-statusline.js'),
  ];
  for (const exec of executables) {
    if (fs.existsSync(exec)) fs.chmodSync(exec, 0o755);
  }
}

function installSkills(names) {
  for (const name of names) {
    const src = path.join(REPO_ROOT, 'skills', name, 'SKILL.md');
    const dst = path.join(CLAUDE_SKILLS, `weave-${name}`, 'SKILL.md');
    copyFile(src, dst);
  }
}

function statuslineSnippet() {
  const hookPath = path.join(WEAVE_BIN, 'core', 'hooks', 'weave-statusline.js');
  return [
    '// Add to ~/.claude/settings.json → statusLine:',
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
  const skills = listSkillSources();
  installRuntime();
  installSkills(skills);

  const summary = [
    'Weave installed.',
    `  runtime →  ${WEAVE_HOME}`,
    `  skills  →  ${CLAUDE_SKILLS}`,
    `  skills count: ${skills.length} (${skills.map((n) => `weave-${n}`).join(', ')})`,
    '',
    'Optional — StatusLine hook:',
    statuslineSnippet(),
    '',
    `Usage from SKILL.md:  node "$WEAVE_HOME/bin/cli.js" <subcommand> [args...]`,
    '  where WEAVE_HOME defaults to $HOME/.weave',
  ].join('\n');

  process.stdout.write(`${summary}\n`);
}

main();
