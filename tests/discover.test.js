// Tests for core/scripts/discover.js
// Spec: docs/src-notes/core_scripts_discover.md

'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-discover-home-'));
const TEST_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-discover-cwd-'));
const LINK_TARGET = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-discover-link-'));
const ORIGINAL_HOME = process.env.HOME;
process.env.HOME = TEST_HOME;

const discover = require('../core/scripts/discover.js');

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

// ───────── Fixture layout ─────────
// Plugin: fake-mkt, fake-plugin @ {TEST_HOME}/.claude/plugins/cache/fake-mkt/fake-plugin/1.0.0/
//   skills/plug-workflow/SKILL.md
//   commands/plug-cmd.md
// Home skills:
//   bmad-create-prd/SKILL.md         (INCLUDED — bmad)
//   bmad-agent-writer/SKILL.md       (EXCLUDED — E2)
//   bmad-cis-problem-solving/SKILL.md (INCLUDED — bmad-cis)
//   agent-settings/SKILL.md          (EXCLUDED — E3)
//   show-dashboard/SKILL.md          (EXCLUDED — E4)
//   linked-skill/ → LINK_TARGET (contains SKILL.md)
//   nested/assets/tpl/SKILL.md       (ignored — wrong depth)
// Home commands:
//   gsd/plan-phase.md                (INCLUDED)
// Project skills:
//   bmad-create-prd/SKILL.md         (overrides home — rank 1)

const PLUGIN_INSTALL = path.join(
  TEST_HOME, '.claude', 'plugins', 'cache', 'fake-mkt', 'fake-plugin', '1.0.0'
);

before(() => {
  // installed_plugins.json
  writeFile(
    path.join(TEST_HOME, '.claude', 'plugins', 'installed_plugins.json'),
    JSON.stringify({
      version: 2,
      plugins: {
        'fake-plugin@fake-mkt': [
          { installPath: PLUGIN_INSTALL, version: '1.0.0' }
        ],
      },
    }, null, 2)
  );

  // Plugin skills & commands
  writeFile(
    path.join(PLUGIN_INSTALL, 'skills', 'plug-workflow', 'SKILL.md'),
    `---
name: plug-workflow
description: Execute workflow phases. Create spec and generate implementation plan.
---

## Checklist

- Write to spec.md
- Implement feature
`
  );
  writeFile(
    path.join(PLUGIN_INSTALL, 'commands', 'plug-cmd.md'),
    `---
name: plug-cmd
description: Design and implement feature architecture with phase steps.
---

Body.
`
  );

  // Home skills
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'bmad-create-prd', 'SKILL.md'),
    `---
name: bmad-create-prd
description: Create a PRD from scratch. Use when user says create product requirements document.
---
Body with create spec and plan.
`
  );
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'bmad-agent-writer', 'SKILL.md'),
    `---
name: bmad-agent-writer
description: Technical documentation writer agent. Use when user requests the tech writer.
---
Body.
`
  );
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'bmad-cis-problem-solving', 'SKILL.md'),
    `---
name: bmad-cis-problem-solving
description: Apply problem-solving methodologies. Create plan and implement steps.
---
Body.
`
  );
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'agent-settings', 'SKILL.md'),
    `---
name: agent-settings
description: Manage per-agent settings.json configurations. Switch, save, reset.
---
Body.
`
  );
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'show-dashboard', 'SKILL.md'),
    `---
name: show-dashboard
description: Show dashboard status.
---
Body.
`
  );
  // Nested template (should be ignored — wrong depth)
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'nested', 'assets', 'tpl', 'SKILL.md'),
    `---
name: template-artifact
description: Template placeholder.
---
Body.
`
  );
  // Symlinked skill dir: create real dir + symlink
  writeFile(
    path.join(LINK_TARGET, 'SKILL.md'),
    `---
name: linked-skill
description: Create architecture and implement feature via symlink.
---
Body.
`
  );
  fs.symlinkSync(
    LINK_TARGET,
    path.join(TEST_HOME, '.claude', 'skills', 'linked-skill')
  );

  // WDS-style numeric-prefix skill (phase detection regression)
  writeFile(
    path.join(TEST_HOME, '.claude', 'skills', 'wds-0-test-phase', 'SKILL.md'),
    `---
name: wds-0-test-phase
description: Create alignment document for phase zero of the design workflow.
---
Body.
`
  );

  // Home commands
  writeFile(
    path.join(TEST_HOME, '.claude', 'commands', 'gsd', 'plan-phase.md'),
    `---
name: gsd:plan-phase
description: Create detailed phase plan with verification loop.
---
Body.
`
  );

  // Project skill override (same id "bmad:create-prd")
  writeFile(
    path.join(TEST_CWD, '.claude', 'skills', 'bmad-create-prd', 'SKILL.md'),
    `---
name: bmad-create-prd
description: Project-overridden. Create a PRD from scratch with project-specific steps.
---
Overridden body with plan and implement.
`
  );

  // Copilot CLI — home ~/.copilot/skills/
  writeFile(
    path.join(TEST_HOME, '.copilot', 'skills', 'gsd-copilot-home', 'SKILL.md'),
    `---
name: gsd-copilot-home
description: Create phase plan with verification. Execute tests and implement the feature.
---
Body.
`
  );
  // Copilot CLI — project .github/skills/
  writeFile(
    path.join(TEST_CWD, '.github', 'skills', 'gsd-copilot-project', 'SKILL.md'),
    `---
name: gsd-copilot-project
description: Execute the phase plan and generate implementation.
---
Body.
`
  );

  // Codex — home ~/.codex/skills/ (deprecated)
  writeFile(
    path.join(TEST_HOME, '.codex', 'skills', 'gsd-codex-home', 'SKILL.md'),
    `---
name: gsd-codex-home
description: Create the implementation plan for a phase and execute each story.
---
Body.
`
  );
  // Vendor-neutral — home ~/.agents/skills/ (shared: codex + opencode + copilot)
  writeFile(
    path.join(TEST_HOME, '.agents', 'skills', 'gsd-agents-home', 'SKILL.md'),
    `---
name: gsd-agents-home
description: Create verification plan and implement the quality checks.
---
Body.
`
  );
  // Vendor-neutral — project <cwd>/.agents/skills/
  writeFile(
    path.join(TEST_CWD, '.agents', 'skills', 'gsd-agents-project', 'SKILL.md'),
    `---
name: gsd-agents-project
description: Create project-scope verification plan and execute the feature.
---
Body.
`
  );
});

after(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
  fs.rmSync(TEST_CWD, { recursive: true, force: true });
  fs.rmSync(LINK_TARGET, { recursive: true, force: true });
  if (ORIGINAL_HOME === undefined) delete process.env.HOME;
  else process.env.HOME = ORIGINAL_HOME;
});

// ─────────────────── parseSkillMd (2) ───────────────────

test('1. parseSkillMd extracts name/description/body from standard frontmatter', () => {
  const out = discover.parseSkillMd(
    `---
name: foo
description: bar baz
---

# Body`,
    '/x/SKILL.md'
  );
  assert.strictEqual(out.name, 'foo');
  assert.strictEqual(out.description, 'bar baz');
  assert.match(out.body, /# Body/);
});

test('2. parseSkillMd returns empty name when frontmatter missing', () => {
  const out = discover.parseSkillMd('# No Frontmatter\n\nBody', '/y');
  assert.strictEqual(out.name, '');
  assert.strictEqual(out.description, '');
});

// ─────────────── readInstalledPlugins (3) ────────────────

test('3. readInstalledPlugins returns InstalledPlugin array', () => {
  const plugins = discover.readInstalledPlugins(TEST_HOME);
  assert.strictEqual(plugins.length, 1);
  assert.deepStrictEqual(plugins[0], {
    name: 'fake-plugin',
    marketplace: 'fake-mkt',
    installPath: PLUGIN_INSTALL,
    version: '1.0.0',
  });
});

test('4. readInstalledPlugins returns empty array when file missing', () => {
  const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'weave-empty-home-'));
  try {
    assert.deepStrictEqual(discover.readInstalledPlugins(nowhere), []);
  } finally {
    fs.rmSync(nowhere, { recursive: true, force: true });
  }
});

test('5. readInstalledPlugins splits key "name@marketplace"', () => {
  const plugins = discover.readInstalledPlugins(TEST_HOME);
  assert.strictEqual(plugins[0].name, 'fake-plugin');
  assert.strictEqual(plugins[0].marketplace, 'fake-mkt');
});

// ──────────────────── scanLocation (6) ────────────────────

test('6. scanLocation home-skill matches <root>/<name>/SKILL.md', () => {
  const out = discover.scanLocation({
    type: 'home-skill',
    root: path.join(TEST_HOME, '.claude', 'skills'),
  });
  const names = out.map((c) => path.basename(path.dirname(c.filePath))).sort();
  assert.ok(names.includes('bmad-create-prd'));
  assert.ok(names.includes('linked-skill'));
  assert.ok(names.includes('show-dashboard'));
});

test('7. scanLocation ignores nested SKILL.md (wrong depth)', () => {
  const out = discover.scanLocation({
    type: 'home-skill',
    root: path.join(TEST_HOME, '.claude', 'skills'),
  });
  const nestedHit = out.find((c) => c.filePath.includes('/assets/tpl/'));
  assert.strictEqual(nestedHit, undefined);
});

test('8. scanLocation follows symlink directories', () => {
  const out = discover.scanLocation({
    type: 'home-skill',
    root: path.join(TEST_HOME, '.claude', 'skills'),
  });
  const linked = out.find((c) =>
    c.filePath.endsWith(path.join('linked-skill', 'SKILL.md'))
  );
  assert.ok(linked, 'symlinked skill must be discovered');
});

test('9. scanLocation home-command matches <root>/<source>/<name>.md', () => {
  const out = discover.scanLocation({
    type: 'home-command',
    root: path.join(TEST_HOME, '.claude', 'commands'),
  });
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].filePath.endsWith(path.join('gsd', 'plan-phase.md')));
});

test('10. scanLocation plugin-skill matches {installPath}/skills/<name>/SKILL.md', () => {
  const out = discover.scanLocation({
    type: 'plugin-skill',
    root: PLUGIN_INSTALL,
    pluginContext: { name: 'fake-plugin' },
  });
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].filePath.endsWith(path.join('skills', 'plug-workflow', 'SKILL.md')));
  assert.strictEqual(out[0].pluginContext.name, 'fake-plugin');
});

test('11. scanLocation plugin-command matches {installPath}/commands/<name>.md (flat)', () => {
  const out = discover.scanLocation({
    type: 'plugin-command',
    root: PLUGIN_INSTALL,
    pluginContext: { name: 'fake-plugin' },
  });
  assert.strictEqual(out.length, 1);
  assert.ok(out[0].filePath.endsWith(path.join('commands', 'plug-cmd.md')));
});

// ─────────── isAgenticWorkflow — Stage 2 (8) ───────────

test('12. E1 agent persona ("talk to Mary") excluded', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Use when user asks to talk to Mary.',
    body: '',
  }, 'some-skill');
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /E1/);
});

test('13. E1 agent role ("requests the business analyst") excluded', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Use when user requests the business analyst.',
    body: '',
  }, 'some-skill');
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /E1/);
});

test('14. E2 name contains -agent- excluded', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Create a feature plan.',
    body: '',
  }, 'bmad-agent-writer');
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /E2/);
});

test('15. E3 settings/utility excluded', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Manage per-agent settings.json configurations.',
    body: '',
  }, 'agent-settings');
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /E3/);
});

test('16. E4 query/help excluded', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Show dashboard status.',
    body: '',
  }, 'show-dashboard');
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /E4/);
});

test('17. I1+I2 included ("Create a PRD")', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Create a PRD from scratch.',
    body: 'Body mentions plan and spec.',
  }, 'create-prd');
  assert.strictEqual(r.included, true);
  assert.strictEqual(r.reason, 'workflow');
});

test('18. I1 only without I2 is excluded', () => {
  const r = discover.isAgenticWorkflow({
    description: 'Generate output.',
    body: 'Transform inputs to outputs generically.',
  }, 'no-noun');
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /I2/);
});

test('19. reason string always returned', () => {
  const r1 = discover.isAgenticWorkflow({ description: 'Create a plan.', body: 'spec' }, 'x');
  const r2 = discover.isAgenticWorkflow({ description: 'Show status', body: '' }, 'x');
  assert.strictEqual(typeof r1.reason, 'string');
  assert.strictEqual(typeof r2.reason, 'string');
});

// ─────────── classifyComponent — Stage 2 framework (4) ───────────

test('19a. classifyComponent returns Agentic Workflow with full shape', () => {
  const c = discover.classifyComponent(
    { description: 'Create a PRD from scratch.', body: 'Body mentions plan and spec.' },
    'create-prd'
  );
  assert.strictEqual(c.type, 'Agentic Workflow');
  assert.strictEqual(c.category, 'Planning/Reasoning');
  assert.strictEqual(c.isAtomic, false);
  assert.strictEqual(c.hasFeedbackLoop, false);
  assert.strictEqual(c.included, true);
  assert.ok(c.signals.includes('I1') && c.signals.includes('I2'));
});

test('19b. classifyComponent returns Methodology Skill for persona (E1)', () => {
  const c = discover.classifyComponent(
    { description: 'Use when user asks to talk to Mary.', body: '' },
    'some-skill'
  );
  assert.strictEqual(c.type, 'Methodology Skill');
  assert.strictEqual(c.category, 'Action/Tool');
  assert.strictEqual(c.isAtomic, true);
  assert.strictEqual(c.hasFeedbackLoop, false);
  assert.strictEqual(c.included, false);
  assert.ok(c.signals.includes('E1'));
});

test('19c. classifyComponent Methodology Skill for utility start (E3)', () => {
  const c = discover.classifyComponent(
    { description: 'Manage per-agent settings.json configurations.', body: '' },
    'agent-settings'
  );
  assert.strictEqual(c.type, 'Methodology Skill');
  assert.strictEqual(c.isAtomic, true);
  assert.ok(c.signals.includes('E3'));
});

test('19d. isAgenticWorkflow stays backward-compatible wrapper', () => {
  const c = discover.classifyComponent(
    { description: 'Create a PRD.', body: 'Body mentions plan and spec.' },
    'create-prd'
  );
  const w = discover.isAgenticWorkflow(
    { description: 'Create a PRD.', body: 'Body mentions plan and spec.' },
    'create-prd'
  );
  assert.strictEqual(w.included, c.included);
  assert.strictEqual(w.reason, c.reason);
});

// ─────────────────── extractSource (5) ──────────────────

test('20. extractSource plugin-skill uses pluginContext.name', () => {
  const src = discover.extractSource(
    '/fake/skills/any/SKILL.md', 'plugin-skill', { name: 'fake-plugin' }
  );
  assert.strictEqual(src, 'fake-plugin');
});

test('21. extractSource home-command uses parent dir name', () => {
  const src = discover.extractSource(
    '/home/x/.claude/commands/gsd/plan-phase.md', 'home-command'
  );
  assert.strictEqual(src, 'gsd');
});

test('22. extractSource home-skill "bmad-create-prd" → "bmad"', () => {
  const src = discover.extractSource(
    '/home/x/.claude/skills/bmad-create-prd/SKILL.md', 'home-skill'
  );
  assert.strictEqual(src, 'bmad');
});

test('23. extractSource home-skill "bmad-cis-*" → "bmad-cis" (longer prefix wins)', () => {
  const src = discover.extractSource(
    '/home/x/.claude/skills/bmad-cis-problem-solving/SKILL.md', 'home-skill'
  );
  assert.strictEqual(src, 'bmad-cis');
});

test('24a. extractSource command-flat (opencode native): "/config/opencode/command/gsd-new-workspace.md" → "gsd"', () => {
  // Regression: registry once derived "command" as a cluster from this dir.
  // Seed prefixes must win over registry so baseName match returns "gsd".
  const src = discover.extractSource(
    '/home/x/.config/opencode/command/gsd-new-workspace.md',
    'home-skill',
    { registry: { assignments: {
      '/home/x/.config/opencode/command/gsd-new-workspace.md': { source: 'command', signal: 'derivation' },
    } } }
  );
  assert.strictEqual(src, 'gsd');
});

test('24. extractSource home-skill "agent-settings" (no whitelist) → full dir name', () => {
  const src = discover.extractSource(
    '/home/x/.claude/skills/agent-settings/SKILL.md', 'home-skill'
  );
  assert.strictEqual(src, 'agent-settings');
});

// ─────────────── dedupByPriority (2) ────────────────

test('25. dedup project(rank 1) vs home(rank 2) → project wins', () => {
  const out = discover.dedupByPriority([
    { id: 'bmad:x', rank: 2, path: '/home/x' },
    { id: 'bmad:x', rank: 1, path: '/project/x' },
  ]);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].rank, 1);
  assert.strictEqual(out[0].path, '/project/x');
});

test('26. dedup home vs plugin → home wins + shadowed stderr log in debug mode', () => {
  const originalWrite = process.stderr.write;
  const logs = [];
  process.stderr.write = (msg) => { logs.push(msg); return true; };
  try {
    const out = discover.dedupByPriority([
      { id: 'superpowers:brainstorm', rank: 3, path: '/plugin/x' },
      { id: 'superpowers:brainstorm', rank: 2, path: '/home/x' },
    ], { debug: true });
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].rank, 2);
    assert.ok(logs.some((l) => /shadowed/.test(l) && l.includes('/plugin/x')));
  } finally {
    process.stderr.write = originalWrite;
  }
});

// ────────────────── discoverAll E2E (2) ────────────────

test('27. discoverAll(workflowOnly=true) returns expected filtered skills', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
  });
  const ids = skills.map((s) => s.id).sort();

  // Expected includes:
  assert.ok(ids.includes('fake-plugin:plug-workflow'), 'plugin skill');
  assert.ok(ids.includes('fake-plugin:plug-cmd'), 'plugin command');
  assert.ok(ids.includes('bmad:create-prd'), 'bmad skill (project overrides home)');
  assert.ok(ids.includes('bmad-cis:problem-solving'), 'bmad-cis longer prefix');
  assert.ok(ids.includes('linked-skill:linked-skill'), 'symlinked skill');
  assert.ok(ids.includes('gsd:plan-phase'), 'home command');

  // Excluded:
  assert.ok(!ids.includes('bmad:agent-writer'), 'E2 excluded');
  assert.ok(!ids.some((id) => id.endsWith(':agent-settings')), 'E3 excluded');
  assert.ok(!ids.some((id) => id.endsWith(':show-dashboard')), 'E4 excluded');

  // Project override — verify rank 1
  const overridden = skills.find((s) => s.id === 'bmad:create-prd');
  assert.strictEqual(overridden.rank, 1);
  assert.ok(overridden.path.startsWith(TEST_CWD));
});

test('27c. discoverAll(cli:"claude") ignores codex/copilot/opencode paths', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
    cli: 'claude',
  });
  const ids = skills.map((s) => s.id);
  // Claude scoping — includes claude paths
  assert.ok(ids.includes('bmad:create-prd'), 'claude home-skill visible');
  assert.ok(ids.includes('gsd:plan-phase'), 'claude home-command visible');
  assert.ok(ids.includes('fake-plugin:plug-workflow'), 'claude plugin visible');
  // Does NOT include paths exclusive to other CLIs
  assert.ok(!ids.includes('gsd:copilot-home'),    'copilot home path excluded');
  assert.ok(!ids.includes('gsd:copilot-project'), 'copilot project path excluded');
  assert.ok(!ids.includes('gsd:codex-home'),      'codex home path excluded');
  assert.ok(!ids.includes('gsd:agents-home'),     'agents home path excluded under claude cli');
});

test('27d. discoverAll(cli:"copilot") scans .copilot + .github only (no .claude/.agents crossover)', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
    cli: 'copilot',
  });
  const ids = skills.map((s) => s.id);
  assert.ok(ids.includes('gsd:copilot-home'),    'copilot home-skill visible');
  assert.ok(ids.includes('gsd:copilot-project'), 'copilot project-skill visible');
  assert.ok(!ids.includes('bmad:create-prd'),    'no .claude crossover (scoped to native roots)');
  assert.ok(!ids.includes('gsd:agents-home'),    'no .agents crossover (scoped to native roots)');
});

test('27e. discoverAll(cli:"codex") skips .claude — no crossover', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
    cli: 'codex',
  });
  const ids = skills.map((s) => s.id);
  assert.ok(ids.includes('gsd:codex-home'),     'codex home-skill visible');
  assert.ok(ids.includes('gsd:agents-home'),    'agents home crossover');
  assert.ok(ids.includes('gsd:agents-project'), 'agents project crossover');
  assert.ok(!ids.includes('bmad:create-prd'),   'no .claude crossover for codex');
  assert.ok(!ids.includes('gsd:plan-phase'),    'no claude commands for codex');
});

test('27f. discoverAll(cli:"all") scans copilot + codex + vendor-neutral paths across CLIs', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
    cli: 'all',
  });
  const ids = skills.map((s) => s.id);
  assert.ok(ids.includes('gsd:copilot-home'), '~/.copilot/skills picked up');
  assert.ok(ids.includes('gsd:copilot-project'), '<cwd>/.github/skills picked up');
  assert.ok(ids.includes('gsd:codex-home'), '~/.codex/skills picked up');
  assert.ok(ids.includes('gsd:agents-home'), '~/.agents/skills picked up');
  assert.ok(ids.includes('gsd:agents-project'), '<cwd>/.agents/skills picked up');
});

test('28. discoverAll(workflowOnly=false) skips filter, returns all valid', () => {
  const skills = discover.discoverAll({
    workflowOnly: false,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
  });
  const ids = skills.map((s) => s.id);
  // Without filter, agent/settings/show also included
  assert.ok(ids.some((id) => id.endsWith(':agent-settings')));
  assert.ok(ids.some((id) => id.endsWith(':show-dashboard')));
  assert.ok(ids.includes('bmad:agent-writer'));
});

// ─────────────── heuristic helpers (3) ──────────────

test('29. detectCompactionAware true for STATE.md / compaction / resume', () => {
  assert.strictEqual(discover.detectCompactionAware('See STATE.md'), true);
  assert.strictEqual(discover.detectCompactionAware('handles compaction gracefully'), true);
  assert.strictEqual(discover.detectCompactionAware('can resume later'), true);
  assert.strictEqual(discover.detectCompactionAware('one-shot task'), false);
});

test('30. detectInteractive true when description mentions asking the user', () => {
  assert.strictEqual(
    discover.detectInteractive('Asks the user for preferences.', ''),
    true
  );
  assert.strictEqual(
    discover.detectInteractive('', 'User selects an option.'),
    true
  );
  assert.strictEqual(
    discover.detectInteractive('Processes automatically.', ''),
    false
  );
});

test('31. inferDefaultCheckpoint returns "verify" for review/test keywords', () => {
  assert.strictEqual(discover.inferDefaultCheckpoint('Review the code', ''), 'verify');
  assert.strictEqual(discover.inferDefaultCheckpoint('', 'Verify the output'), 'verify');
  assert.strictEqual(discover.inferDefaultCheckpoint('Create a feature', ''), 'auto');
});

// ─────────────── inferPhase (3) ────────────────

test('32. inferPhase keyword — alignment skill → Alignment stage', () => {
  const r = discover.inferPhase('0-alignment-signoff', 'Create alignment');
  assert.strictEqual(r.phase, 'Alignment');
  assert.strictEqual(r.explicit, false);
  assert.strictEqual(r.source, 'keyword');
});

test('33. inferPhase keyword-based (Requirements — Spec)', () => {
  const r = discover.inferPhase('create-prd', 'Create a PRD from scratch');
  assert.strictEqual(r.phase, 'Requirements — Spec');
  assert.strictEqual(r.explicit, false);
});

test('34. inferPhase fallback → "Other"', () => {
  const r = discover.inferPhase('mystery', 'Does something unclassified');
  assert.strictEqual(r.phase, 'Other');
  assert.strictEqual(r.explicit, false);
  assert.strictEqual(r.source, 'fallback');
});

// ─────────────── extractUsageTrigger (2) ────────────────

test('35. extractUsageTrigger pulls "Use when ..." sentence', () => {
  const trigger = discover.extractUsageTrigger(
    'Create a PRD. Use when the user says "lets create a PRD".'
  );
  assert.match(trigger, /^Use when/);
  assert.match(trigger, /PRD/);
});

test('36. extractUsageTrigger fallback to first sentence when no "Use when"', () => {
  const trigger = discover.extractUsageTrigger(
    'Does thing. Another thing.'
  );
  assert.strictEqual(trigger, 'Does thing');
});

// ─────────────── extractOutputs (3) ────────────────

test('37. extractOutputs reads workflow.md outputFile frontmatter', () => {
  const workflowContent = `---
outputFile: 'docs/prd.md'
---
# Workflow body`;
  const out = discover.extractOutputs({ body: 'Follow workflow.md' }, workflowContent);
  assert.ok(out.includes('docs/prd.md'));
});

test('38. extractOutputs regex on body ("Output: X.md", "Write to X.md")', () => {
  const body = 'Output: docs/spec.md\nAlso writes to reports/summary.json';
  const out = discover.extractOutputs({ body }, null);
  assert.ok(out.includes('docs/spec.md'));
  assert.ok(out.includes('reports/summary.json'));
});

test('39. extractOutputs empty when no patterns match', () => {
  const out = discover.extractOutputs({ body: 'No files mentioned here.' }, null);
  assert.deepStrictEqual(out, []);
});

// ─────────────── extractInputs (2) ────────────────

test('40. extractInputs matches "when you have ..." in description', () => {
  const parsed = {
    description: 'Use when you have a written implementation plan to execute',
    body: '',
  };
  const inputs = discover.extractInputs(parsed);
  assert.ok(inputs.some((s) => /implementation plan/i.test(s)));
});

test('41. extractInputs empty when no cues', () => {
  const inputs = discover.extractInputs({
    description: 'Create a feature.',
    body: 'Do things.',
  });
  assert.deepStrictEqual(inputs, []);
});

// ─────────────── extractInvokes (2) ────────────────

test('42. extractInvokes picks up source:name references', () => {
  const body = `
**REQUIRED SUB-SKILL:** Use superpowers:finishing-a-development-branch
If subagents available, use superpowers:subagent-driven-development instead.
`;
  const inv = discover.extractInvokes(body);
  assert.ok(inv.includes('superpowers:finishing-a-development-branch'));
  assert.ok(inv.includes('superpowers:subagent-driven-development'));
});

test('43. extractInvokes empty when no references', () => {
  const inv = discover.extractInvokes('A plain body with no invocations.');
  assert.deepStrictEqual(inv, []);
});

// ─────────────── inferComplexity (3) ────────────────

test('44. inferComplexity "quick" for short body', () => {
  const c = discover.inferComplexity({ body: 'short' }, null);
  assert.strictEqual(c, 'quick');
});

test('45. inferComplexity "medium" for moderate size', () => {
  const body = 'x'.repeat(3000);
  const c = discover.inferComplexity({ body }, null);
  assert.strictEqual(c, 'medium');
});

test('46. inferComplexity "full" for long (SKILL.md + workflow.md combined)', () => {
  const c = discover.inferComplexity(
    { body: 'x'.repeat(2000) },
    'y'.repeat(5000)
  );
  assert.strictEqual(c, 'full');
});

// ─────────────── extractTools (3) ────────────────

test('47. extractTools inline array format', () => {
  const fm = `name: foo
allowed-tools: [Read, Write, Bash]`;
  assert.deepStrictEqual(discover.extractTools(fm), ['Read', 'Write', 'Bash']);
});

test('48. extractTools multiline list format', () => {
  const fm = `name: foo
allowed-tools:
  - Read
  - Write
  - Task
description: bar`;
  assert.deepStrictEqual(discover.extractTools(fm), ['Read', 'Write', 'Task']);
});

test('49. extractTools empty when no allowed-tools', () => {
  assert.deepStrictEqual(discover.extractTools('name: foo\ndescription: bar'), []);
});

// ─── Regression fixes ───

test('50. extractInputs rejects word-fragment noise ("after all tasks")', () => {
  const parsed = {
    description: 'Use when you have a written implementation plan to execute',
    body: 'After all tasks complete and verified: finalize. After all tasks done.',
  };
  const inputs = discover.extractInputs(parsed);
  // Should contain the legit input.
  assert.ok(inputs.some((s) => /written implementation plan/i.test(s)));
  // Must NOT contain noise fragments like "ll tasks" or "ll tasks complete".
  assert.ok(!inputs.some((s) => /^ll\b/i.test(s)), 'noise "ll tasks" must be filtered');
  assert.ok(!inputs.some((s) => /^(all|every)\s/i.test(s)), 'noise "all tasks" must be filtered');
});

test('51. inferPhase: test-driven-development → Test Strategy (not Implementation)', () => {
  const r = discover.inferPhase(
    'test-driven-development',
    'Use when implementing any feature or bugfix, before writing implementation code'
  );
  assert.strictEqual(r.phase, 'Test Strategy');
});

test('52. inferPhase: technical-research → Research (not Design — Architecture)', () => {
  const r = discover.inferPhase(
    'technical-research',
    'Conduct technical research on technologies and architecture'
  );
  assert.strictEqual(r.phase, 'Research');
});

test('53. inferPhase: dev-story → Implementation — Dev (not Planning — Stories)', () => {
  const r = discover.inferPhase(
    'dev-story',
    'Execute story implementation following a context filled story spec file'
  );
  assert.strictEqual(r.phase, 'Implementation — Dev');
});

test('54. inferComplexity: orchestrators with 3+ invokes are "full"', () => {
  const c = discover.inferComplexity({ body: 'short' }, null, 3);
  assert.strictEqual(c, 'full');
});

test('55. inferComplexity: 1-2 invokes bump quick body to medium', () => {
  const c1 = discover.inferComplexity({ body: 'short' }, null, 1);
  assert.strictEqual(c1, 'medium');
});

test('56. discoverAll: wds numeric-prefix skill classified by keyword + stageIndex set', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
  });
  const wds = skills.find((s) => s.id === 'wds:0-test-phase');
  assert.ok(wds, 'wds-0-test-phase should be discovered as wds:0-test-phase');
  // Fixture description mentions "alignment document" → Alignment stage by keyword.
  assert.strictEqual(wds.phase, 'Alignment');
  assert.strictEqual(typeof wds.stageIndex, 'number');
  assert.ok(wds.stageIndex >= 0 && wds.stageIndex < 30);
});

test('57. I1/I2 filter: "Map business goals through structured workshops" passes (workshop/mapping)', () => {
  const r = discover.isAgenticWorkflow(
    { description: 'Map business goals to user psychology through structured workshops', body: '' },
    'trigger-mapping'
  );
  assert.strictEqual(r.included, true);
});

test('58. I1/I2 filter: "Conduct research on architecture" passes (research/architecture)', () => {
  const r = discover.isAgenticWorkflow(
    { description: 'Conduct technical research on technologies and architecture', body: '' },
    'technical-research'
  );
  assert.strictEqual(r.included, true);
});

test('59. I1/I2 filter: "evolution/improvements/pipeline" passes (wds-8)', () => {
  const r = discover.isAgenticWorkflow(
    { description: 'Brownfield improvements — the full pipeline for existing products', body: '' },
    '8-product-evolution'
  );
  assert.strictEqual(r.included, true);
});

test('60. I1/I2 filter: still rejects pure query "Show X status"', () => {
  const r = discover.isAgenticWorkflow(
    { description: 'Show current sprint status', body: '' },
    'sprint-status'
  );
  assert.strictEqual(r.included, false);
  assert.match(r.reason, /E4/);
});

// ─────────── 3-layer classifier (Layer A/B/C) — (11) ───────────

test('61. Layer A ①: processStage frontmatter overrides keyword inference', () => {
  const r = discover.inferPhase(
    'dev-story',
    'Execute story implementation',
    { processStage: 'Design — UX' }
  );
  assert.strictEqual(r.phase, 'Design — UX');
  assert.strictEqual(r.explicit, true);
  assert.strictEqual(r.source, 'frontmatter');
});

test('62. Layer A ①: invalid processStage falls through to keyword', () => {
  const r = discover.inferPhase(
    'create-prd',
    'Create a PRD',
    { processStage: 'NotARealStage' }
  );
  assert.strictEqual(r.phase, 'Requirements — Spec');
  assert.strictEqual(r.explicit, false);
  assert.strictEqual(r.source, 'keyword');
});

test('63. Layer A ②: OVERRIDE_TABLE id match beats keyword', () => {
  // gsd:new-milestone keyword would catch Onboarding/etc. if any; override forces Requirements — Spec.
  const r = discover.inferPhase(
    'new-milestone',
    'Start a new milestone cycle — update PROJECT.md and route to requirements',
    { id: 'gsd:new-milestone' }
  );
  assert.strictEqual(r.phase, 'Requirements — Spec');
  assert.strictEqual(r.explicit, true);
  assert.strictEqual(r.source, 'override');
});

test('64. Layer A ②: OVERRIDE_TABLE handles verify-work → User Testing', () => {
  // keyword would match QA — Review/Trace via "verify-work"; override forces User Testing.
  const r = discover.inferPhase(
    'verify-work',
    'Validate built features through conversational UAT',
    { id: 'gsd:verify-work' }
  );
  assert.strictEqual(r.phase, 'User Testing');
  assert.strictEqual(r.source, 'override');
});

test('65. Layer A ③: test-design → Test Strategy (not Design — UX)', () => {
  const r = discover.inferPhase(
    'test-design',
    'Create system-level or epic-level test plans'
  );
  assert.strictEqual(r.phase, 'Test Strategy');
});

test('66. Layer A ③: ship → Integration & Ship', () => {
  const r = discover.inferPhase(
    'ship',
    'Create PR, run review, and prepare for merge after verification passes'
  );
  assert.strictEqual(r.phase, 'Integration & Ship');
});

test('67. Layer A ③: progress / session-report → Progress cross-cutting band', () => {
  const r1 = discover.inferPhase('progress', 'Check project progress');
  assert.strictEqual(r1.phase, 'Progress');
  const r2 = discover.inferPhase('session-report', 'Generate a session report');
  assert.strictEqual(r2.phase, 'Progress');
});

test('68. Layer B: stageIndexOf assigns ascending index to STAGE_ORDER', () => {
  assert.strictEqual(discover.stageIndexOf('Onboarding'), 0);
  assert.ok(discover.stageIndexOf('Implementation — Dev') > discover.stageIndexOf('Planning — Sprint'));
  assert.ok(discover.stageIndexOf('Retrospective') > discover.stageIndexOf('Integration & Ship'));
  assert.ok(discover.stageIndexOf('Progress') >= 27); // cross-cutting, after main flow
  // Unknown → max (pushed to end)
  assert.strictEqual(discover.stageIndexOf('Other'), discover.STAGE_ORDER.length);
});

test('69. Layer C: compareSkills sorts by (stage → methodology → processOrder → numericPrefix → step → alpha)', () => {
  const skills = [
    { id: 'gsd:autonomous',           name: 'autonomous',           source: 'gsd',    phase: 'Implementation — Dev' },
    { id: 'bmad:dev-story',           name: 'dev-story',            source: 'bmad',   phase: 'Implementation — Dev' },
    { id: 'bmad:create-prd',          name: 'create-prd',           source: 'bmad',   phase: 'Requirements — Spec' },
    { id: 'wds:0-project-setup',      name: '0-project-setup',      source: 'wds',    phase: 'Onboarding' },
    { id: 'bmad:brainstorming',       name: 'brainstorming',        source: 'bmad',   phase: 'Discovery' },
  ];
  const sorted = skills.slice().sort(discover.compareSkills);
  const order = sorted.map((s) => s.id);
  // Onboarding first, then Discovery, Requirements — Spec, finally Implementation — Dev
  assert.deepStrictEqual(order, [
    'wds:0-project-setup',
    'bmad:brainstorming',
    'bmad:create-prd',
    'bmad:dev-story',
    'gsd:autonomous',
  ]);
});

test('70. Layer C: same-stage different methodology — priority prefers wds → bmad → gds → gsd → superpowers', () => {
  const skills = [
    { id: 'superpowers:executing-plans', name: 'executing-plans', source: 'superpowers', phase: 'Implementation — Dev' },
    { id: 'gsd:execute-phase',           name: 'execute-phase',   source: 'gsd',         phase: 'Implementation — Dev' },
    { id: 'bmad:dev-story',              name: 'dev-story',       source: 'bmad',        phase: 'Implementation — Dev' },
  ];
  const sorted = skills.slice().sort(discover.compareSkills);
  assert.deepStrictEqual(sorted.map((s) => s.source), ['bmad', 'gsd', 'superpowers']);
});

test('71. Layer C: custom methodologyPriority honored', () => {
  const cmp = discover.makeCompareSkills({ methodologyPriority: ['gsd', 'bmad', 'wds'] });
  const skills = [
    { id: 'wds:5-agentic-development',   name: '5-agentic-development', source: 'wds',  phase: 'Implementation — Dev' },
    { id: 'bmad:dev-story',              name: 'dev-story',             source: 'bmad', phase: 'Implementation — Dev' },
    { id: 'gsd:execute-phase',           name: 'execute-phase',         source: 'gsd',  phase: 'Implementation — Dev' },
  ];
  const sorted = skills.slice().sort(cmp);
  assert.deepStrictEqual(sorted.map((s) => s.source), ['gsd', 'bmad', 'wds']);
});

test('72. discoverAll: Skill exposes phase, phaseExplicit, phaseSource, stageIndex', () => {
  const skills = discover.discoverAll({
    workflowOnly: true,
    homeDir: TEST_HOME,
    cwd: TEST_CWD,
  });
  const prd = skills.find((s) => s.id === 'bmad:create-prd');
  assert.ok(prd, 'bmad:create-prd should exist');
  assert.strictEqual(prd.phase, 'Requirements — Spec');
  assert.strictEqual(prd.phaseExplicit, false);
  assert.strictEqual(prd.phaseSource, 'keyword');
  assert.strictEqual(typeof prd.stageIndex, 'number');
  assert.strictEqual(prd.stageIndex, discover.STAGE_INDEX['Requirements — Spec']);
});
