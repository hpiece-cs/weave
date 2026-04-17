// guard.js — step prerequisite validation (pure function, no fs except loadDefaults).
// Spec: docs/src-notes/core_scripts_guard.md

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS_PATH = path.join(__dirname, '..', 'references', 'guard-defaults.json');

function loadDefaults() {
  return JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
}

function hasOutputs(step) {
  return Array.isArray(step && step.outputs) && step.outputs.length > 0;
}

function checkGuards(stepIndex, session) {
  if (stepIndex === 0) return { pass: true, warnings: [] };

  const steps = (session && session.steps) || [];
  const current = steps[stepIndex];
  const warnings = [];

  const required = Array.isArray(current && current.requiresOutputsFrom)
    ? current.requiresOutputsFrom
    : null;

  if (required) {
    for (const idx of required) {
      if (!hasOutputs(steps[idx])) {
        warnings.push(`Step ${idx + 1} has no outputs`);
      }
    }
  } else if (loadDefaults().defaults.requiresPreviousStepOutput) {
    const prev = stepIndex - 1;
    if (!hasOutputs(steps[prev])) {
      warnings.push(`Step ${prev + 1} has no outputs`);
    }
  }

  return { pass: warnings.length === 0, warnings };
}

module.exports = {
  checkGuards,
  loadDefaults,
};

if (require.main === module) {
  const [, , stepArg, sessionPath] = process.argv;
  const stepIndex = Number(stepArg);
  const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
  process.stdout.write(JSON.stringify(checkGuards(stepIndex, session)));
}
