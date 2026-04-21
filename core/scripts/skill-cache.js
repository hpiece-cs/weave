'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const paths = require('./paths.js');
const discover = require('./discover.js');
const sourceRegistry = require('./source-registry.js');

// Bump when the shape or filtering rules of cached groups change — this
// forces old caches to be discarded on the next run.
//   v1 → v2: compose-workflow.js 가 'Other' phase 를 그룹 목록에서 제외하고,
//             각 그룹에 maxSrcWidth 필드를 추가했음.
//   v2 → v3: fingerprint 구성을 source-registry.json 의 derivedPrefixes 로부터
//             동적으로 계산. 하드코딩된 homeSkillSources 제거.
const CACHE_SCHEMA_VERSION = 3;

function getCachePath(projectRoot) {
  return path.join(paths.projectCacheDir(projectRoot), 'skill-groups.json');
}

// v3 — registry-driven fingerprint.
// Groups registry assignments by source; for each source aggregates file count +
// latestMtime. No more hardcoded source list — whatever is in the registry drives
// the fingerprint, so discover.js derivation and skill-cache cannot drift.
function computeFingerprints(projectRoot) {
  const result = {};

  // Locale — cached groups may contain localized strings (phase descriptions,
  // intent templates). When LANG changes between sessions the cache must
  // invalidate so the next consumer re-renders with the right language.
  const rawLang = process.env.LANG || 'en_US';
  const lang = rawLang.startsWith('ko') ? 'ko' : 'en';
  result.__locale = { lang };

  // Plugins — version + gitCommitSha are authoritative (not file mtime).
  // We still emit a fingerprint per installed plugin so updates invalidate cache.
  const plugins = discover.readInstalledPlugins();
  for (const p of plugins) {
    result[p.name] = {
      version: p.version || '',
      gitCommitSha: p.gitCommitSha || '',
    };
  }
  // Back-compat: older caches expected a `superpowers` key even if not installed.
  if (!result.superpowers) {
    result.superpowers = { version: '', gitCommitSha: '' };
  }

  // Registry — aggregate file stats per source (excluding plugin-* sources,
  // which are fingerprinted by plugin metadata above).
  const reg = sourceRegistry.loadRegistry(projectRoot);
  if (reg && reg.assignments) {
    const bySource = new Map();
    for (const [filePath, entry] of Object.entries(reg.assignments)) {
      if (!entry || !entry.source) continue;
      if (entry.signal === 'plugin') continue;
      if (!bySource.has(entry.source)) bySource.set(entry.source, []);
      bySource.get(entry.source).push(filePath);
    }
    for (const [source, paths] of bySource) {
      let count = 0;
      let maxMtime = 0;
      for (const p of paths) {
        try {
          const st = fs.statSync(p);
          if (st.isFile()) {
            count++;
            if (st.mtimeMs > maxMtime) maxMtime = st.mtimeMs;
          }
        } catch {
          /* file may have been removed — skip */
        }
      }
      result[source] = {
        count,
        latestMtime: maxMtime ? new Date(maxMtime).toISOString() : null,
      };
    }
  }

  return result;
}

function fingerprintsMatch(cached, current) {
  // Compare union of keys so either side gaining a new source invalidates.
  const allKeys = new Set([...Object.keys(cached || {}), ...Object.keys(current || {})]);
  for (const key of allKeys) {
    const prev = cached && cached[key];
    const cur = current && current[key];
    if (!prev || !cur) return false;
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

function loadCache(projectRoot) {
  try {
    const raw = fs.readFileSync(getCachePath(projectRoot), 'utf8');
    const data = JSON.parse(raw);
    if (data.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
    if (!data.methodologies || !Array.isArray(data.groups)) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(fingerprints, groups, projectRoot) {
  const data = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    methodologies: fingerprints,
    groups,
  };
  const filePath = getCachePath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function getSkillGroups(buildGroupsFn, { force = false, projectRoot } = {}) {
  const current = computeFingerprints(projectRoot);
  // force=true 이면 디스크 캐시를 무시하고 항상 새로 discover·빌드한 뒤 재저장.
  // compose UI 의 'r' (다시 읽기) 같이 사용자가 명시적으로 재스캔을 요청할 때 사용.
  const cached = force ? null : loadCache(projectRoot);

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

  // Cache miss: discover (populates source-registry), build, save.
  // Fingerprint is recomputed AFTER discover so registry-driven keys are present.
  const discovered = discover.discoverAll({ workflowOnly: false, projectRoot });
  const workflowOnly = discover.discoverAll({ workflowOnly: true, projectRoot });
  const byId = new Map(discovered.map(s => [s.id, s]));
  const groups = buildGroupsFn(discovered, workflowOnly, byId);

  try {
    saveCache(computeFingerprints(projectRoot), groups, projectRoot);
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
