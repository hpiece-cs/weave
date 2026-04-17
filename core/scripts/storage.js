// storage.js — preset CRUD with project/global scope.
// Project scope: <cwd>/.weave/workflows/<name>.json  (default)
// Global  scope: ~/.weave/workflows/<name>.json
// Load order: project first → global → error.
// Spec: docs/src-notes/core_scripts_storage.md

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths.js');

const CURRENT_SCHEMA = 1;
const SCOPES = ['project', 'global'];

function workflowsDirFor(scope) {
  return scope === 'global' ? paths.WORKFLOWS_DIR : paths.projectWorkflowsDir();
}

function presetPath(name, scope) {
  return path.join(workflowsDirFor(scope), `${name}.json`);
}

function now() {
  return new Date().toISOString();
}

function migratePreset(preset) {
  if (preset.schemaVersion === undefined) {
    return { ...preset, schemaVersion: CURRENT_SCHEMA };
  }
  return preset;
}

function save(name, data, options = {}) {
  const scope = options.scope || 'project';
  if (!SCOPES.includes(scope)) throw new Error(`Invalid scope: ${scope}`);
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  const filePath = presetPath(name, scope);
  const existing = fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
    : null;
  const preset = {
    ...parsed,
    name,
    schemaVersion: CURRENT_SCHEMA,
    created: (existing && existing.created) || parsed.created || now(),
    updated: now(),
  };
  fs.mkdirSync(workflowsDirFor(scope), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(preset, null, 2));
  return { path: filePath, scope };
}

function load(name, options = {}) {
  if (options.scope) {
    if (!SCOPES.includes(options.scope)) throw new Error(`Invalid scope: ${options.scope}`);
    const filePath = presetPath(name, options.scope);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Preset not found: ${name} (scope=${options.scope})`);
    }
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return { ...migratePreset(raw), _scope: options.scope };
  }
  for (const scope of SCOPES) {
    const filePath = presetPath(name, scope);
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return { ...migratePreset(raw), _scope: scope };
    }
  }
  throw new Error(`Preset not found: ${name}`);
}

function list() {
  const names = new Set();
  for (const scope of SCOPES) {
    const dir = workflowsDirFor(scope);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json')) names.add(f.slice(0, -5));
    }
  }
  return [...names];
}

function listWithScope() {
  const out = [];
  const seen = new Set();
  for (const scope of SCOPES) {
    const dir = workflowsDirFor(scope);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const name = f.slice(0, -5);
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ name, scope });
    }
  }
  return out;
}

function remove(name, options = {}) {
  if (options.scope) {
    if (!SCOPES.includes(options.scope)) throw new Error(`Invalid scope: ${options.scope}`);
    const filePath = presetPath(name, options.scope);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Preset not found: ${name} (scope=${options.scope})`);
    }
    fs.unlinkSync(filePath);
    return { scope: options.scope };
  }
  for (const scope of SCOPES) {
    const filePath = presetPath(name, scope);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { scope };
    }
  }
  throw new Error(`Preset not found: ${name}`);
}

function clone(from, to, options = {}) {
  const fromOpts = options.fromScope ? { scope: options.fromScope } : {};
  const src = load(from, fromOpts);
  const { created, updated, _scope, ...rest } = src;
  const toScope = options.toScope || 'project';
  return save(to, rest, { scope: toScope });
}

module.exports = {
  CURRENT_SCHEMA,
  SCOPES,
  save,
  load,
  list,
  listWithScope,
  remove,
  clone,
  migratePreset,
  workflowsDirFor,
};
