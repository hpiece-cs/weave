// spawn.js — open the interactive compose demo in a new terminal window on the
// user's OS, wait for it to finish, then close the window.
// Cross-platform: macOS (Terminal.app / iTerm2), Linux (gnome-terminal / konsole
// / xterm / alacritty / kitty / x-terminal-emulator), Windows (cmd via `start`).
// Completion is signaled via a file marker written by the spawned shell.

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn: spawnChild } = require('node:child_process');
const paths = require('./paths.js');

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function demoPath() {
  const installed = path.join(paths.PLUGIN_ROOT, 'demo', 'compose-workflow.js');
  if (fs.existsSync(installed)) return installed;
  const repoLocal = path.resolve(__dirname, '..', '..', 'demo', 'compose-workflow.js');
  if (fs.existsSync(repoLocal)) return repoLocal;
  throw new Error('compose-workflow.js not found');
}

function makeMarkerPath() {
  fs.mkdirSync(paths.CACHE_DIR, { recursive: true });
  return path.join(paths.CACHE_DIR, `compose-${Date.now()}-${process.pid}.done`);
}

function sleepSync(ms) {
  // Synchronous sleep without CPU-spin (Atomics.wait on a SAB).
  const buf = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buf, 0, 0, ms);
}

function waitForMarker(markerPath, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(markerPath)) {
    if (Date.now() > deadline) return false;
    sleepSync(500);
  }
  return true;
}

function which(bin) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [bin], {
    stdio: 'ignore',
  });
  return r.status === 0;
}

// ── macOS ──────────────────────────────────────────────────────────

function appleScriptRun(script) {
  return spawnSync('osascript', ['-e', script], { stdio: ['ignore', 'pipe', 'pipe'] });
}

function spawnMac(demo, marker) {
  const shellCmd = `clear; node ${JSON.stringify(demo)}; printf '' > ${JSON.stringify(marker)}; exit`;
  const termProgram = process.env.TERM_PROGRAM || '';

  // Prefer the user's current terminal if it's iTerm2 and scriptable.
  if (termProgram === 'iTerm.app') {
    const script = [
      'tell application "iTerm"',
      '  activate',
      `  create window with default profile command ${JSON.stringify(shellCmd)}`,
      'end tell',
    ].join('\n');
    const r = appleScriptRun(script);
    if (r.status === 0) return { spawned: true, kind: 'iterm2', closer: closeItermWindow };
  }

  // Default: Terminal.app via AppleScript.
  const script = [
    'tell application "Terminal"',
    '  activate',
    `  do script ${JSON.stringify(shellCmd)}`,
    'end tell',
  ].join('\n');
  const r = appleScriptRun(script);
  if (r.status === 0) return { spawned: true, kind: 'terminal.app', closer: closeTerminalAppWindow };
  return {
    spawned: false,
    reason: `osascript failed: ${(r.stderr && r.stderr.toString().trim()) || 'unknown'}`,
  };
}

function closeTerminalAppWindow() {
  // Best-effort: close the frontmost window whose busy=false (just finished).
  appleScriptRun(
    [
      'tell application "Terminal"',
      '  try',
      '    close (first window whose (busy of selected tab) is false) saving no',
      '  end try',
      'end tell',
    ].join('\n')
  );
}

function closeItermWindow() {
  appleScriptRun(
    [
      'tell application "iTerm"',
      '  try',
      '    tell current window to close',
      '  end try',
      'end tell',
    ].join('\n')
  );
}

// ── Linux ──────────────────────────────────────────────────────────

function spawnLinux(demo, marker) {
  const inner = `node ${JSON.stringify(demo)}; printf '' > ${JSON.stringify(marker)}; exit`;
  const candidates = [
    ['gnome-terminal', ['--', 'bash', '-c', inner]],
    ['konsole', ['--separate', '-e', 'bash', '-c', inner]],
    ['alacritty', ['-e', 'bash', '-c', inner]],
    ['kitty', ['bash', '-c', inner]],
    ['xterm', ['-e', 'bash', '-c', inner]],
    ['x-terminal-emulator', ['-e', 'bash', '-c', inner]],
  ];
  for (const [bin, args] of candidates) {
    if (!which(bin)) continue;
    try {
      const child = spawnChild(bin, args, { detached: true, stdio: 'ignore' });
      child.unref();
      return { spawned: true, kind: bin, closer: () => {} };
    } catch {
      /* try next */
    }
  }
  return { spawned: false, reason: 'no supported terminal emulator found (tried gnome-terminal, konsole, alacritty, kitty, xterm, x-terminal-emulator)' };
}

// ── Windows ────────────────────────────────────────────────────────

function spawnWindows(demo, marker) {
  // `start "title" cmd /c "node demo & type nul > marker & exit"` opens a new window.
  const inner = `node "${demo}" & type nul > "${marker}" & exit`;
  try {
    const child = spawnChild('cmd', ['/c', 'start', '"weave:compose"', 'cmd', '/c', inner], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return { spawned: true, kind: 'cmd', closer: () => {} };
  } catch (e) {
    return { spawned: false, reason: `cmd start failed: ${e.message}` };
  }
}

// ── Dispatcher ─────────────────────────────────────────────────────

function spawnCompose(options = {}) {
  const demo = options.demo || demoPath();
  const marker = options.marker || makeMarkerPath();
  if (fs.existsSync(marker)) fs.unlinkSync(marker);

  const platform = os.platform();
  let result;
  if (platform === 'darwin') result = spawnMac(demo, marker);
  else if (platform === 'linux') result = spawnLinux(demo, marker);
  else if (platform === 'win32') result = spawnWindows(demo, marker);
  else result = { spawned: false, reason: `unsupported platform: ${platform}` };

  if (!result.spawned) {
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
    return { success: false, reason: result.reason };
  }

  const ok = waitForMarker(marker, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  if (fs.existsSync(marker)) fs.unlinkSync(marker);

  if (result.closer) {
    try {
      result.closer();
    } catch {
      /* closing is best-effort */
    }
  }

  if (!ok) return { success: false, reason: 'timeout waiting for compose to finish', terminal: result.kind };
  return { success: true, terminal: result.kind };
}

module.exports = {
  spawnCompose,
  demoPath,
  makeMarkerPath,
  waitForMarker,
  sleepSync,
};
