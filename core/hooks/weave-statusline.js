#!/usr/bin/env node
// weave-statusline.js — Claude Code StatusLine hook. Gated by WEAVE_ACTIVE env var.
// Spec: docs/src-notes/core_hooks_weave-statusline.md
// Deps: none

'use strict';

// TODO: implement per spec
// If process.env.WEAVE_ACTIVE is unset → write "" and exit.
// Else → write `weave [${WEAVE_STEP}/${WEAVE_TOTAL}] ${WEAVE_SESSION}`
