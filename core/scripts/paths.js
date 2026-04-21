// paths.js — path constants and resolvers.
// Spec: docs/src-notes/core_scripts_paths.md
// Deps: node:os, node:path (no weave modules)

'use strict';

const os = require('node:os');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const WEAVE_HOME = process.env.WEAVE_HOME || path.join(os.homedir(), '.weave');
const WORKFLOWS_DIR = path.join(WEAVE_HOME, 'workflows');
const CACHE_DIR = path.join(WEAVE_HOME, 'cache');
const GLOBAL_CONFIG = path.join(WEAVE_HOME, 'config.json');

function projectWeaveDir(projectRoot) {
  return path.join(projectRoot || process.cwd(), '.weave');
}

function projectWorkflowsDir(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), 'workflows');
}

function projectCacheDir(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), 'cache');
}

function projectRegistryFile(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), 'source-registry.json');
}

function sessionPath(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), 'session.json');
}

function lockPath(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), '.lock');
}

function archiveDir(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), 'archive');
}

function projectConfig(projectRoot) {
  return path.join(projectWeaveDir(projectRoot), 'config.json');
}

module.exports = {
  PLUGIN_ROOT,
  WEAVE_HOME,
  WORKFLOWS_DIR,
  CACHE_DIR,
  GLOBAL_CONFIG,
  projectWeaveDir,
  projectWorkflowsDir,
  projectCacheDir,
  projectRegistryFile,
  sessionPath,
  lockPath,
  archiveDir,
  projectConfig,
};
