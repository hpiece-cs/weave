---
name: weave-ref
description: Search workflow artifacts across all completed steps. Supports keyword:/step:/type: prefixes, or freeform search across path + summary + keywords.
---

# /weave:ref

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
