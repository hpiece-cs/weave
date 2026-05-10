// source-registry.js — prefix derivation + append-only registry.
// Spec: docs/src-notes/core_scripts_source-registry.md
// Role: single source of truth for skill "source" (methodology bucket)
//       used by discover.js (Pass 2) and skill-cache.js (fingerprinting).

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const paths = require('./paths.js');

function getRegistryPath(projectRoot) {
  return paths.projectRegistryFile(projectRoot);
}

// v2 → v3: metadata-marker rules now include frequency-based clustering.
// Existing unknown or split source assignments are intentionally recomputed.
const SCHEMA_VERSION = 3;

const GENERIC_MARKERS = new Set([
  'recommended',
  'required',
  'optional',
  'default',
  'deprecated',
  'experimental',
  'preview',
  'beta',
  'alpha',
]);

// ──────────────────────── derivation ────────────────────────

// Build a map of prefix → count from hyphen-segmented dirNames.
//   'bmad-cis-storytelling' contributes 'bmad', 'bmad-cis', 'bmad-cis-storytelling'.
function buildPrefixCounts(dirNames) {
  const counts = new Map();
  for (const name of dirNames) {
    if (!name) continue;
    const parts = name.split('-');
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('-');
      counts.set(prefix, (counts.get(prefix) || 0) + 1);
    }
  }
  return counts;
}

function longestMatch(dirName, boundaries) {
  let best = null;
  for (const b of boundaries) {
    if (dirName === b || dirName.startsWith(`${b}-`)) {
      if (!best || b.length > best.length) best = b;
    }
  }
  return best;
}

function nowIso() {
  return new Date().toISOString();
}

// Extract all methodology marker candidates from a parsed skill.
// Description markers are returned before frontmatter markers so canonical
// markers in the description beat incidental frontmatter labels.
function extractMethodologyMarkers(parsed) {
  const description = (parsed && parsed.description) || '';
  const frontmatter = (parsed && parsed.frontmatter) || '';
  const re = /\(([a-z][a-z0-9-]{2,})\)/gi;
  const markers = [];
  for (const text of [description, frontmatter]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const marker = m[1].toLowerCase();
      if (GENERIC_MARKERS.has(marker)) continue;
      markers.push(marker);
    }
  }
  return markers;
}

// Backward-compat helper — returns the last marker (legacy single-result API).
function extractMethodologyMarker(parsed) {
  const markers = extractMethodologyMarkers(parsed);
  return markers.length ? markers[markers.length - 1] : null;
}

// Core — pure function (no fs/network).
// parsedList = [{filePath, type, parsed, pluginContext?}]
// Returns {prefixes, assignments} per contract.
function derivePrefixes(parsedList, options = {}) {
  const {
    seed = [],
    existingRegistry = null,
    minClusterSize = 2,
  } = options;

  const existingAssignments = (existingRegistry && existingRegistry.assignments) || {};

  // Clustering targets: only home-skill / project-skill flat dirs.
  const clusterItems = parsedList.filter(
    (p) => p.type === 'home-skill' || p.type === 'project-skill'
  );
  const dirNames = clusterItems.map((p) => path.basename(path.dirname(p.filePath)));

  // Count prefix frequencies.
  const counts = buildPrefixCounts(dirNames);

  // Derivation boundaries: any prefix that occurs minClusterSize+ times.
  const derivedBoundaries = new Set();
  for (const [prefix, count] of counts) {
    if (count >= minClusterSize) derivedBoundaries.add(prefix);
  }

  // Seed boundaries: seed entries with at least one matching file.
  const seedBoundaries = new Set();
  for (const s of seed) {
    if (counts.has(s) && counts.get(s) >= 1) seedBoundaries.add(s);
  }

  // Frequency-based metadata-marker boundaries.
  const markersByPath = new Map();
  const markerCounts = new Map();
  for (const item of clusterItems) {
    const candidates = extractMethodologyMarkers(item.parsed);
    if (candidates.length === 0) continue;
    markersByPath.set(item.filePath, candidates);
    const seen = new Set();
    for (const marker of candidates) {
      if (seen.has(marker)) continue;
      seen.add(marker);
      markerCounts.set(marker, (markerCounts.get(marker) || 0) + 1);
    }
  }
  const trustedMarkers = new Set();
  for (const [marker, count] of markerCounts) {
    if (count >= minClusterSize) trustedMarkers.add(marker);
  }

  // Union for the public prefix list.
  const allBoundaries = new Set([...seedBoundaries, ...derivedBoundaries, ...trustedMarkers]);

  // Assign each candidate a source.
  const assignments = {};
  for (const item of parsedList) {
    // Preserve existing assignment (append-only — id stability).
    const existing = existingAssignments[item.filePath];
    if (existing && existing.source) {
      assignments[item.filePath] = existing;
      continue;
    }

    // plugin-* → pluginContext.name.
    if (item.type === 'plugin-skill' || item.type === 'plugin-command') {
      assignments[item.filePath] = {
        source: (item.pluginContext && item.pluginContext.name) || 'unknown',
        signal: 'plugin',
        firstSeen: nowIso(),
      };
      continue;
    }
    // *-command → parent dir name.
    if (item.type === 'home-command' || item.type === 'project-command') {
      assignments[item.filePath] = {
        source: path.basename(path.dirname(item.filePath)),
        signal: 'command-dir',
        firstSeen: nowIso(),
      };
      continue;
    }
    // home-skill / project-skill: marker, seed, derivation, then orphan.
    const dirName = path.basename(path.dirname(item.filePath));
    const candidates = markersByPath.get(item.filePath) || [];
    let acceptedMarker = null;
    for (const marker of candidates) {
      if (dirName === marker || dirName.startsWith(`${marker}-`)) {
        acceptedMarker = marker;
        break;
      }
    }
    if (!acceptedMarker) {
      for (const marker of candidates) {
        if (trustedMarkers.has(marker)) {
          acceptedMarker = marker;
          break;
        }
      }
    }
    if (acceptedMarker) {
      assignments[item.filePath] = {
        source: acceptedMarker,
        signal: 'metadata-marker',
        firstSeen: nowIso(),
      };
      continue;
    }
    const seedMatch = longestMatch(dirName, seedBoundaries);
    if (seedMatch) {
      assignments[item.filePath] = {
        source: seedMatch,
        signal: 'seed',
        firstSeen: nowIso(),
      };
      continue;
    }
    const derivedMatch = longestMatch(dirName, derivedBoundaries);
    if (derivedMatch) {
      assignments[item.filePath] = {
        source: derivedMatch,
        signal: 'derivation',
        firstSeen: nowIso(),
      };
      continue;
    }
    assignments[item.filePath] = {
      source: dirName,
      signal: 'unknown',
      firstSeen: nowIso(),
    };
  }

  // Retain historical assignments for files not in current scan (append-only).
  for (const [p, entry] of Object.entries(existingAssignments)) {
    if (!assignments[p]) assignments[p] = entry;
  }

  // Sorted prefix list (length desc, then alpha for stability).
  const prefixes = [...allBoundaries].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  );

  return { prefixes, assignments };
}

// ──────────────────────── persistence ────────────────────────

function loadRegistry(projectRoot) {
  try {
    const raw = fs.readFileSync(getRegistryPath(projectRoot), 'utf8');
    const data = JSON.parse(raw);
    if (data.schemaVersion !== SCHEMA_VERSION) return null;
    if (!data.assignments || typeof data.assignments !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function saveRegistry({ prefixes, assignments }, projectRoot) {
  const data = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: nowIso(),
    derivedPrefixes: prefixes,
    assignments,
  };
  const filePath = getRegistryPath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function deleteRegistry(projectRoot) {
  const filePath = getRegistryPath(projectRoot);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

function resolveSource(filePath, registry) {
  if (!registry || !registry.assignments) return null;
  const entry = registry.assignments[filePath];
  return entry ? entry.source : null;
}

// Compare two assignment maps; returns list of changed paths.
function diffAssignments(prev, next) {
  const changed = [];
  if (!prev || !next) return changed;
  for (const p of Object.keys(next)) {
    const before = prev[p];
    const after = next[p];
    if (!before) continue;
    if (before.source !== after.source) {
      changed.push({ filePath: p, prevSource: before.source, nextSource: after.source });
    }
  }
  return changed;
}

module.exports = {
  SCHEMA_VERSION,
  getRegistryPath,
  derivePrefixes,
  loadRegistry,
  saveRegistry,
  deleteRegistry,
  resolveSource,
  diffAssignments,
  extractMethodologyMarker,
  extractMethodologyMarkers,
  // Internal (exported for tests)
  buildPrefixCounts,
  longestMatch,
};
