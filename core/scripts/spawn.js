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

function buildShellCmd(demo, marker, extraArgs = [], originCwd) {
  // stdout 은 TUI 렌더 전용이라 redirect 하지 않는다. --single-pick 모드는
  // compose-workflow.js 내부에서 --result-file 로 지정된 경로에 결과를 쓴다.
  // originCwd 는 spawn 된 shell 이 cd 할 디렉토리 — 프로젝트 스코프 데이터
  // (registry/cache) 가 올바른 경로에 쓰이려면 호출자 cwd 를 전파해야 한다.
  const argStr = extraArgs.map((a) => JSON.stringify(a)).join(' ');
  const cdPart = originCwd ? `cd ${JSON.stringify(originCwd)}; ` : '';
  return `clear; ${cdPart}node ${JSON.stringify(demo)} ${argStr}; printf '' > ${JSON.stringify(marker)}; exit`;
}

function spawnMac(demo, marker, extraArgs = [], originCwd) {
  const shellCmd = buildShellCmd(demo, marker, extraArgs, originCwd);
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

function spawnLinux(demo, marker, extraArgs = [], originCwd) {
  const argStr = extraArgs.map((a) => JSON.stringify(a)).join(' ');
  const cdPart = originCwd ? `cd ${JSON.stringify(originCwd)}; ` : '';
  const inner = `${cdPart}node ${JSON.stringify(demo)} ${argStr}; printf '' > ${JSON.stringify(marker)}; exit`;
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

function spawnWindows(demo, marker, extraArgs = [], originCwd) {
  // `start "title" cmd /c "node demo & type nul > marker & exit"` opens a new window.
  const argStr = extraArgs.map((a) => `"${a}"`).join(' ');
  const cdPart = originCwd ? `cd /d "${originCwd}" & ` : '';
  const inner = `${cdPart}node "${demo}" ${argStr} & type nul > "${marker}" & exit`;
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
  const extraArgs = options.args || [];
  // Propagate caller cwd so the spawned shell can cd there before running node.
  // Without this, macOS Terminal.app opens in $HOME and project-scope
  // registry/cache end up in the wrong location.
  const originCwd = options.cwd || process.cwd();
  if (fs.existsSync(marker)) fs.unlinkSync(marker);

  const platform = os.platform();
  let result;
  if (platform === 'darwin') result = spawnMac(demo, marker, extraArgs, originCwd);
  else if (platform === 'linux') result = spawnLinux(demo, marker, extraArgs, originCwd);
  else if (platform === 'win32') result = spawnWindows(demo, marker, extraArgs, originCwd);
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

// edit-session insert picker 전용 헬퍼. compose-workflow 를 --single-pick 모드로
// 새 창에 띄우고, 사용자가 고른 스킬 ID 를 돌려준다.
// sessionCheckedIds: 현재 세션에 이미 있는 스킬 ID 들 (배지 표시용).
//
// 주의: 새 창에선 stdout 을 TUI 가 쓰고 있어 shell redirect(>) 로 가로챌 수
// 없다. 대신 --result-file=<path> 플래그로 compose-workflow 에게 결과 JSON 을
// 쓸 파일 경로를 넘기고, spawn 이 끝나면 그 파일을 읽는다.
function spawnComposePicker(sessionCheckedIds = []) {
  fs.mkdirSync(paths.CACHE_DIR, { recursive: true });
  const resultPath = path.join(paths.CACHE_DIR, `pick-${Date.now()}-${process.pid}.json`);
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  const args = ['--single-pick', `--result-file=${resultPath}`];
  if (sessionCheckedIds.length > 0) {
    args.push(`--session-checked=${sessionCheckedIds.join(',')}`);
  }
  const result = spawnCompose({ args });
  if (!result.success) {
    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
    return { success: false, reason: result.reason, skillId: null };
  }
  let skillId = null;
  try {
    if (fs.existsSync(resultPath)) {
      const raw = fs.readFileSync(resultPath, 'utf8').trim();
      if (raw) {
        const parsed = JSON.parse(raw);
        skillId = parsed.skillId || null;
      }
    }
  } catch {
    // Malformed output — treat as canceled.
  } finally {
    if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
  }
  return { success: true, skillId, terminal: result.terminal };
}

module.exports = {
  spawnCompose,
  spawnComposePicker,
  demoPath,
  makeMarkerPath,
  waitForMarker,
  sleepSync,
};
