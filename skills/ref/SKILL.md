---
name: weave-ref
description: Search workflow artifacts across all completed steps. Supports keyword:/step:/type: prefixes, or freeform search across path + summary + keywords.
processStage: tracking
processOrder: 4.3
lifecycleGroup: progress-monitoring
lifecycleGroupNames:
  ko: 진행상황 모니터링
  en: Progress Monitoring
lifecycleOrder: 4.3
usesWhen: Find specific artifacts by keyword, type, or step number
skillNames:
  ko: 산출물 검색
  en: Search Artifacts
domain: session-query
dataRole: artifact-searcher
scope: project
filePatterns:
  - input: {proj}/.weave/session.json (outputs[]) + query string
  - output: terminal display (matching artifacts with path, type, summary, keywords)
mutates: false
frequency: variable
---

# /weave:ref

> **Locale**: Reply in Korean if `$LANG` starts with `ko`, otherwise English. Applies to user-facing summaries, status, confirmations, and error messages.

Use when the user asks "where did we produce X?" or "find the spec from step 2".

## Resolve Weave CLI

```bash
WEAVE_CLI="${WEAVE_HOME:-$HOME/.weave}/bin/cli.js"
[ -f "$WEAVE_CLI" ] || { echo "Weave not installed. Run: node install.js from the weave repo"; exit 1; }
```

## Flow

### 1. Determine the query

Take the text after `/weave:ref` as the query. Supported prefixes:

- `keyword:<term>` — exact match in the artifact's keywords array
- `step:<N>` — artifacts from step N (1-indexed)
- `type:<kind>` — artifacts matching the type (e.g., `spec`, `architecture`)
- no prefix — substring search across path + summary + keywords

### 2. Run

```bash
node "$WEAVE_CLI" runtime ref "<query>"
```

(If no query, call without argument to list all artifacts.)

Result: array of `{ path, type, summary, keywords, source, stepOrder, skillId }`.

### 3. Present

For each hit:

```
  [step <N>] <path>  (<type>)  — <skillId>
     "<summary>"    keywords: <list>
```

If no matches, suggest alternate queries (broader substring, or drop a prefix).

### 4. No active session

Tell the user no workflow is running. Artifacts from archived sessions live under `.weave/archive/<sessionId>.json`.
