// The on-demand daemon (native Windows).
//
// Up to 1.19.1, `unsnooze setup` registered the daemon as a logon Scheduled
// Task, and Microsoft Defender flagged setup as Trojan:Win32/Commando.A!ml for
// it. Nothing is registered with Windows any more: the wrappers and the
// StopFailure hook start the daemon whenever it is not running, and the daemon
// keeps itself a single instance through a heartbeat pidfile. The helpers take
// the platform and every side effect as parameters, so this runs on every CI
// OS; the tests at the bottom drive the real bin and run on windows-latest.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, utimesSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = mkdtempSync(join(tmpdir(), 'unsnooze-daemon-on-demand-'));
// Before any src/ import: config.js resolves the state dir at load, and the
// claude adapter reads its bin override at load. The agent is node itself, so
// the launch below works on every OS.
process.env.UNSNOOZE_STATE_DIR = join(DIR, 'state');
process.env.UNSNOOZE_CLAUDE_DIR = join(DIR, 'claude');
process.env.UNSNOOZE_CODEX_DIR = join(DIR, 'codex');
process.env.UNSNOOZE_CLAUDE_BIN = process.execPath;
process.env.UNSNOOZE_NOTIFICATIONS = 'off';

const {
  runningDaemonPid, claimDaemon, ensureDaemon, stopDaemon, pidAlive,
  DAEMON_STALE_MS,
} = await import('../src/spawn.js');

// A stubborn pidfile could hold the directory open on Windows for a moment
// after a kill; a failed cleanup must not fail the suite.
after(() => {
  try { rmSync(DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch { /* best-effort */ }
});

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitUntil(cond, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await sleep(25);
  }
  return false;
}

let n = 0;
function pidfile(pid, { ageMs = 0 } = {}) {
  const dir = join(DIR, `case-${++n}`);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, 'daemon.pid');
  if (pid !== undefined) {
    writeFileSync(path, String(pid));
    if (ageMs) { const t = new Date(Date.now() - ageMs); utimesSync(path, t, t); }
  }
  return path;
}
const readPid = path => { try { return parseInt(readFileSync(path, 'utf-8'), 10); } catch { return NaN; } };

// process.ppid: a live process that is not this one — the test runner.
const LIVE_OTHER = process.ppid;

// --- runningDaemonPid -------------------------------------------------------

test('no pidfile, no daemon', () => {
  assert.equal(runningDaemonPid({ path: pidfile() }), null);
});

test('a pidfile naming a dead process is no daemon', () => {
  assert.equal(runningDaemonPid({ path: pidfile(424242), alive: () => false }), null);
});

test('a live pid with a stale heartbeat is no daemon — Windows recycles pids', () => {
  // The case the heartbeat exists for: the daemon died at sign-out, and by the
  // next sign-in some other program owns its old pid.
  const path = pidfile(LIVE_OTHER, { ageMs: DAEMON_STALE_MS + 60_000 });
  assert.equal(runningDaemonPid({ path }), null);
});

test('a live pid with a fresh heartbeat is the daemon', () => {
  assert.equal(runningDaemonPid({ path: pidfile(LIVE_OTHER) }), LIVE_OTHER);
});

// --- claimDaemon ------------------------------------------------------------

test('the first daemon claims the pidfile, and gives it back on release', () => {
  const path = pidfile();
  const release = claimDaemon({ path });
  assert.ok(release, 'claimed');
  assert.equal(readPid(path), process.pid);
  release();
  assert.ok(!existsSync(path), 'released on shutdown');
});

test('a second daemon stands down while a live one holds the pidfile', () => {
  const path = pidfile(LIVE_OTHER);
  assert.equal(claimDaemon({ path }), null);
  assert.equal(readPid(path), LIVE_OTHER, 'the running daemon keeps its claim');
});

test('a stale pidfile is taken over, even when its pid is alive again', () => {
  const path = pidfile(LIVE_OTHER, { ageMs: DAEMON_STALE_MS + 60_000 });
  const release = claimDaemon({ path });
  try {
    assert.ok(release, 'a recycled pid must not keep the daemon from ever starting');
    assert.equal(readPid(path), process.pid);
  } finally { release?.(); }
});

test('the heartbeat keeps the claim fresh', async () => {
  const path = pidfile();
  const release = claimDaemon({ path, heartbeatMs: 20 });
  try {
    const old = new Date(Date.now() - 3_600_000);
    utimesSync(path, old, old);
    assert.ok(await waitUntil(() => Date.now() - statSync(path).mtimeMs < 60_000),
      'the next beat refreshes the mtime');
  } finally { release(); }
});

test('a daemon replaced in the pidfile stands down, and leaves the file to its successor', async () => {
  // Two claims can race, and a daemon that looked dead through a long sleep
  // can be replaced while it lives: whichever is no longer named must go.
  const path = pidfile();
  let lost = 0;
  const release = claimDaemon({ path, heartbeatMs: 20, onLost: () => { lost++; } });
  writeFileSync(path, String(LIVE_OTHER));
  assert.ok(await waitUntil(() => lost === 1), 'onLost fires on the next beat');
  release();
  assert.equal(readPid(path), LIVE_OTHER, 'release never deletes another daemon\'s claim');
});

// --- ensureDaemon -----------------------------------------------------------

function markerFile({ present = true } = {}) {
  const dir = join(DIR, `marker-${++n}`);
  mkdirSync(dir, { recursive: true });
  const marker = join(dir, 'daemon-on-demand');
  if (present) writeFileSync(marker, '');
  return marker;
}

test('ensureDaemon starts the daemon on Windows once setup asked for it', () => {
  const spawned = [];
  const pid = ensureDaemon({
    platform: 'win32', marker: markerFile(), running: () => null,
    spawner: args => { spawned.push(args); return 4321; },
  });
  assert.equal(pid, 4321);
  assert.deepEqual(spawned, [['daemon']]);
});

test('ensureDaemon leaves a running daemon alone', () => {
  let spawned = 0;
  ensureDaemon({ platform: 'win32', marker: markerFile(), running: () => 99, spawner: () => { spawned++; } });
  assert.equal(spawned, 0);
});

test('ensureDaemon does nothing until install --daemon asked for the daemon', () => {
  let spawned = 0;
  ensureDaemon({
    platform: 'win32', marker: markerFile({ present: false }), running: () => null,
    spawner: () => { spawned++; },
  });
  assert.equal(spawned, 0);
});

test('ensureDaemon does nothing off Windows — launchd and systemd own the daemon there', () => {
  let spawned = 0;
  for (const platform of ['darwin', 'linux']) {
    ensureDaemon({ platform, marker: markerFile(), running: () => null, spawner: () => { spawned++; } });
  }
  assert.equal(spawned, 0);
});

test('ensureDaemon never throws — it sits on the agent launch path', () => {
  const pid = ensureDaemon({
    platform: 'win32', marker: markerFile(), running: () => null,
    spawner: () => { throw new Error('EMFILE'); },
  });
  assert.equal(pid, null);
});

// --- stopDaemon -------------------------------------------------------------

test('stopDaemon signals a daemon proven live, and removes its pidfile', () => {
  const path = pidfile(LIVE_OTHER);
  const killed = [];
  const pid = stopDaemon({ path, kill: (p, sig) => killed.push([p, sig]) });
  assert.equal(pid, LIVE_OTHER);
  assert.deepEqual(killed, [[LIVE_OTHER, 'SIGTERM']]);
  assert.ok(!existsSync(path));
});

test('stopDaemon never signals the pid in a stale pidfile — it may be anyone\'s now', () => {
  const path = pidfile(LIVE_OTHER, { ageMs: DAEMON_STALE_MS + 60_000 });
  const killed = [];
  assert.equal(stopDaemon({ path, kill: p => killed.push(p) }), null);
  assert.deepEqual(killed, []);
  assert.ok(!existsSync(path), 'the stale file goes anyway');
});

// --- where the daemon is started from ---------------------------------------

test('a watched launch makes sure the daemon is running', async () => {
  const { runLauncher } = await import('../src/launcher.js');
  const saved = { ...process.env };
  Object.assign(process.env, {
    UNSNOOZE_MULTIPLEXER: 'headless', UNSNOOZE_ACTIVE: '',
    TMUX: '', ZELLIJ: '', HERDR_ENV: '', CMUX_SOCKET_PATH: '',
  });
  try {
    let ensured = 0;
    const status = await runLauncher(['-e', 'process.exit(0)'], 'claude', { ensureDaemonFn: () => { ensured++; } });
    assert.equal(status, 0, 'the agent still runs');
    assert.equal(ensured, 1);

    // -h/--version style runs and nested launches pass straight through —
    // nothing to watch. (`-- -h` so node itself never sees the flag.)
    ensured = 0;
    assert.equal(await runLauncher(['-e', 'process.exit(0)', '--', '-h'], 'claude',
      { ensureDaemonFn: () => { ensured++; } }), 0);
    process.env.UNSNOOZE_ACTIVE = '1';
    assert.equal(await runLauncher(['-e', 'process.exit(0)'], 'claude', { ensureDaemonFn: () => { ensured++; } }), 0);
    assert.equal(ensured, 0);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test('the StopFailure hook makes sure the daemon is running', () => {
  // In a child with stdin closed: the hook reads its payload from stdin, and a
  // listener on this runner's stdin could keep the whole file from exiting.
  const hook = pathToFileURL(fileURLToPath(new URL('../src/hook.js', import.meta.url))).href;
  const script = `const { runHook } = await import(${JSON.stringify(hook)});
    let ensured = 0;
    await runHook(['--agent', 'claude'], { ensureDaemonFn: () => { ensured++; } });
    process.stdout.write(String(ensured));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    input: '{}', encoding: 'utf-8', timeout: 30_000,
    // Not inside anybody's multiplexer: the hook would go and read that pane.
    env: {
      ...process.env, TMUX: '', TMUX_PANE: '', ZELLIJ: '', ZELLIJ_PANE_ID: '',
      HERDR_ENV: '', HERDR_PANE_ID: '', UNSNOOZE_MUX: '', UNSNOOZE_PANE: '',
    },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '1');
});

// --- the real bin, on real Windows --------------------------------------------

const winTest = (name, fn) => test(name, {
  skip: process.platform === 'win32' ? false : 'the daemon singleton runs only on native Windows',
}, fn);
const REAL_BIN = fileURLToPath(new URL('../bin/unsnooze.js', import.meta.url));

function binEnv(state) {
  return {
    ...process.env,
    UNSNOOZE_STATE_DIR: state,
    UNSNOOZE_CLAUDE_DIR: join(DIR, 'claude'),
    UNSNOOZE_CODEX_DIR: join(DIR, 'codex'),
    UNSNOOZE_UPDATE_CHECK: '0',
    UNSNOOZE_NOTIFICATIONS: 'off',
  };
}

winTest('a second `unsnooze daemon` stands down while the first is running', async () => {
  const state = join(DIR, 'bin-singleton');
  const env = binEnv(state);
  const first = spawn(process.execPath, [REAL_BIN, 'daemon'], { env, stdio: 'ignore' });
  try {
    assert.ok(await waitUntil(() => readPid(join(state, 'daemon.pid')) === first.pid, 20_000),
      'the first daemon claims the pidfile');
    const second = spawnSync(process.execPath, [REAL_BIN, 'daemon'], { env, encoding: 'utf-8', timeout: 20_000 });
    assert.equal(second.status, 0, `the second daemon must exit at once: ${second.stderr}`);
    assert.match(second.stderr, /already running/);
    assert.equal(readPid(join(state, 'daemon.pid')), first.pid, 'the first keeps its claim');
  } finally {
    first.kill();
  }
});

winTest('the StopFailure hook starts the daemon once setup asked for it', async () => {
  const state = join(DIR, 'bin-on-demand');
  mkdirSync(state, { recursive: true });
  writeFileSync(join(state, 'daemon-on-demand'), '');
  const r = spawnSync(process.execPath, [REAL_BIN, '_hook-stopfailure'], {
    env: binEnv(state), input: '{}', encoding: 'utf-8', timeout: 20_000,
  });
  assert.equal(r.status, 0, r.stderr);
  let pid = NaN;
  try {
    assert.ok(await waitUntil(() => pidAlive(pid = readPid(join(state, 'daemon.pid'))), 20_000),
      'the hook started a daemon, and it claimed the pidfile');
  } finally {
    if (pidAlive(pid)) process.kill(pid);
  }
});
