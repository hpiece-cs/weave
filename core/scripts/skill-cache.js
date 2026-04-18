'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CACHE_DIR } = require('./paths.js');
const discover = require('./discover.js');

const CACHE_SCHEMA_VERSION = 1;
const CACHE_FILE = path.join(CACHE_DIR, 'skill-groups.json');

function computeFingerprints() {
  const home = os.homedir();
  const skillsRoot = path.join(home, '.claude', 'skills');
  const commandsRoot = path.join(home, '.claude', 'commands');
  const result = {};

  // Locale — cached groups may contain localized strings (phase descriptions,
  // intent templates). When LANG changes between sessions the cache must
  // invalidate so the next consumer re-renders with the right language.
  const rawLang = process.env.LANG || 'en_US';
  const lang = rawLang.startsWith('ko') ? 'ko' : 'en';
  result.__locale = { lang };

  // superpowers (plugin)
  const plugins = discover.readInstalledPlugins();
  const sp = plugins.find(p => p.name === 'superpowers');
  result.superpowers = sp
    ? { version: sp.version || '', gitCommitSha: sp.gitCommitSha || '' }
    : { version: '', gitCommitSha: '' };

  // home-skills with prefix-based scanning
  const homeSkillSources = [
    { key: 'bmad-testarch', prefix: 'bmad-testarch-' },
    { key: 'bmad-cis',      prefix: 'bmad-cis-' },
    { key: 'bmad',          prefix: 'bmad-',
      exclude: ['bmad-cis-', 'bmad-testarch-'] },
    { key: 'gds',           prefix: 'gds-' },
    { key: 'wds',           prefix: 'wds-' },
  ];

  let dirs = [];
  try {
    dirs = fs.readdirSync(skillsRoot);
  } catch {}

  for (const { key, prefix, exclude } of homeSkillSources) {
    let count = 0;
    let maxMtime = 0;
    for (const d of dirs) {
      if (!d.startsWith(prefix)) continue;
      if (exclude && exclude.some(ex => d.startsWith(ex))) continue;
      const skillFile = path.join(skillsRoot, d, 'SKILL.md');
      try {
        const st = fs.statSync(skillFile);
        if (st.isFile()) {
          count++;
          if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
        }
      } catch {}
    }
    result[key] = {
      count,
      latestMtime: maxMtime ? new Date(maxMtime).toISOString() : null,
    };
  }

  // gsd (home-command): ~/.claude/commands/gsd/*.md
  const gsdDir = path.join(commandsRoot, 'gsd');
  let gsdCount = 0;
  let gsdMaxMtime = 0;
  try {
    for (const f of fs.readdirSync(gsdDir)) {
      if (!f.endsWith('.md')) continue;
      const fp = path.join(gsdDir, f);
      try {
        const st = fs.statSync(fp);
        if (st.isFile()) {
          gsdCount++;
          if (st.mtimeMs > gsdMaxMtime) gsdMaxMtime = st.mtimeMs;
        }
      } catch {}
    }
  } catch {}
  result.gsd = {
    count: gsdCount,
    latestMtime: gsdMaxMtime ? new Date(gsdMaxMtime).toISOString() : null,
  };

  return result;
}

function fingerprintsMatch(cached, current) {
  for (const [key, cur] of Object.entries(current)) {
    const prev = cached[key];
    if (!prev) return false;
    if ('lang' in cur) {
      if (prev.lang !== cur.lang) return false;
    } else if ('version' in cur) {
      if (prev.version !== cur.version || prev.gitCommitSha !== cur.gitCommitSha) {
        return false;
      }
    } else {
      if (prev.count !== cur.count || prev.latestMtime !== cur.latestMtime) {
        return false;
      }
    }
  }
  return true;
}

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (data.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    if (!data.methodologies || !Array.isArray(data.groups)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(fingerprints, groups) {
  const data = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    methodologies: fingerprints,
    groups,
  };
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

function getSkillGroups(buildGroupsFn) {
  const current = computeFingerprints();
  const cached = loadCache();

  if (cached && fingerprintsMatch(cached.methodologies, current)) {
    // Cache hit: reconstruct byId from the cached groups
    const byId = new Map();
    for (const group of cached.groups) {
      for (const skill of group.skills) {
        byId.set(skill.id, skill);
      }
    }
    return { groups: cached.groups, byId, fromCache: true };
  }

  // Cache miss: discover, build, save
  const discovered = discover.discoverAll({ workflowOnly: false });
  const workflowOnly = discover.discoverAll({ workflowOnly: true });
  const byId = new Map(discovered.map(s => [s.id, s]));
  const groups = buildGroupsFn(discovered, workflowOnly, byId);

  try {
    saveCache(current, groups);
  } catch (e) {
    // Non-fatal — TUI still works without cache
    process.stderr.write(`[skill-cache] warn: could not write cache: ${e.message}\n`);
  }

  return { groups, byId, fromCache: false };
}

module.exports = {
  getSkillGroups,
  computeFingerprints,
  loadCache,
  saveCache,
  fingerprintsMatch,
};
