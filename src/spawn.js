// Detached-process helpers shared by launcher, hook, and monitor.

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync, statSync, utimesSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { RESUMER_LOCK, DAEMON_ON_DEMAND, DAEMON_PIDFILE, ensureStateDir } from './config.js';
import { makeLogger } from './logger.js';

const log = makeLogger('spawn');

export const UNSNOOZE_BIN = join(dirname(dirname(fileURLToPath(import.meta.url))), 'bin', 'unsnooze.js');

export function spawnDetached(args, env = {}) {
  const child = spawn(process.execPath, [UNSNOOZE_BIN, ...args], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...env },
  });
  child.unref();
  return child.pid;
}

// The one definition of how a per-pane monitor is launched. The launcher uses
// it to start one; a version-skewed monitor uses it to hand off to its own
// replacement. Keeping a single builder is what stops the two from drifting —
// a mismatched respawn would silently watch the wrong pane or, with a null
// hole in the argv, throw inside child_process and take the watcher with it.
export function monitorSpawnArgs({ muxName, paneOwner, pane, agentId, leaseId }) {
  return ['_monitor', muxName, paneOwner || '', pane, agentId, leaseId || ''];
}

// Signal 0 probes for existence without delivering anything. Shared: the
// resumer's lock hygiene, the dashboard's liveness column, and the version-skew
// hand-off all need the same answer.
export function pidAlive(pid) {
  // Reject 0 before probing: kill(0, 0) targets our OWN process group and
  // succeeds, so a garbage lock file holding "0" would read as a live holder
  // forever. Number.isFinite alone does not catch it.
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Spawn the resumer daemon unless one is already running (pidfile check).
// The resumer itself re-checks under its own lock; this is just to avoid
// pointless spawns.
export function spawnResumerIfNeeded() {
  try {
    if (existsSync(RESUMER_LOCK)) {
      const pid = parseInt(readFileSync(RESUMER_LOCK, 'utf-8'), 10);
      if (Number.isFinite(pid) && pidAlive(pid)) return null;
    }
  } catch { /* unreadable lock — let the daemon sort it out */ }
  const pid = spawnDetached(['_resumer']);
  log(`spawned resumer pid ${pid}`);
  return pid;
}

// Stop a running resumer (if any): SIGTERM the lock pid, unlink the lock.
// Tolerates a dead/stale pid and a missing lock — uninstall must not fail.
export function stopResumer() {
  let pid = null;
  try {
    if (!existsSync(RESUMER_LOCK)) return { stopped: false, pid: null, reason: 'no-lock' };
    pid = parseInt(readFileSync(RESUMER_LOCK, 'utf-8'), 10);
    if (Number.isFinite(pid) && pidAlive(pid)) {
      try { process.kill(pid, 'SIGTERM'); } catch { /* raced with exit */ }
      log(`stopped resumer pid ${pid}`);
      try { unlinkSync(RESUMER_LOCK); } catch { /* gone */ }
      return { stopped: true, pid };
    }
    // Stale lock: clean up.
    try { unlinkSync(RESUMER_LOCK); } catch { /* gone */ }
    return { stopped: false, pid: Number.isFinite(pid) ? pid : null, reason: 'stale' };
  } catch (err) {
    try { unlinkSync(RESUMER_LOCK); } catch { /* best-effort */ }
    return { stopped: false, pid, reason: err.message };
  }
}

// --- the on-demand daemon (native Windows) ----------------------------------
// launchd and systemd keep the daemon alive on macOS and Linux. Windows gets no
// equivalent, on purpose — see DAEMON_ON_DEMAND in config.js — so there the
// daemon is an ordinary background process that the wrappers and the
// StopFailure hook start whenever it is not running.

// How often a running daemon refreshes its pidfile, and how old the refresh may
// be before the file stops counting as proof of life. Five missed beats, so a
// busy moment is never mistaken for death. A machine waking from a long sleep
// can briefly look daemon-less; the worst that does is start a second daemon,
// which the first yields to on its next beat (claimDaemon).
export const DAEMON_HEARTBEAT_MS = 60_000;
export const DAEMON_STALE_MS = 5 * DAEMON_HEARTBEAT_MS;

function readPidfile(path) {
  try { return parseInt(readFileSync(path, 'utf-8'), 10); } catch { return NaN; }
}

// The pid of the daemon that is demonstrably running, else null. A live pid
// alone proves nothing on Windows: pids are recycled quickly, and a sign-out or
// a crash leaves the file behind to name whichever process gets that pid next.
// The daemon touches the file every minute, so a stale one is ignored whoever
// its pid belongs to now.
export function runningDaemonPid({ path = DAEMON_PIDFILE, now = Date.now(), alive = pidAlive } = {}) {
  const pid = readPidfile(path);
  if (!alive(pid)) return null;
  try {
    return now - statSync(path).mtimeMs <= DAEMON_STALE_MS ? pid : null;
  } catch {
    return null;   // vanished between the read and the stat
  }
}

// The daemon's half of the pidfile. Starters race — a wrapper and the hook can
// both find no daemon and both start one — so each new daemon claims the file,
// and a daemon that finds a live one already there stands down before doing
// anything. `wx` like the resumer lock; a stale file is replaced. Returns a
// release() for shutdown, or null when this daemon must not run.
//
// While held, the heartbeat keeps the claim fresh. If the file ever names
// another pid — this daemon looked dead through a long sleep and a newer one
// took over, or two claims raced — onLost() is called and this daemon should
// exit: one daemon, whichever claimed last.
export function claimDaemon({
  path = DAEMON_PIDFILE, pid = process.pid, running = runningDaemonPid,
  heartbeatMs = DAEMON_HEARTBEAT_MS, onLost = () => {},
} = {}) {
  ensureStateDir(dirname(path));
  let claimed = false;
  for (let attempt = 0; attempt < 2 && !claimed; attempt++) {
    try {
      writeFileSync(path, String(pid), { flag: 'wx', mode: 0o600 });
      claimed = true;
    } catch {
      const holder = running({ path });
      if (holder === pid) claimed = true;
      else if (holder) {
        log(`daemon pid ${holder} is already running — pid ${pid} not starting another`);
        return null;
      } else {
        try { unlinkSync(path); } catch { /* raced with another claimant */ }
      }
    }
  }
  if (!claimed) {
    log(`could not claim ${path} — pid ${pid} not starting`);
    return null;
  }
  const beat = setInterval(() => {
    if (readPidfile(path) !== pid) {
      clearInterval(beat);
      log(`${path} no longer names pid ${pid} — standing down`);
      onLost();
      return;
    }
    try { const t = new Date(); utimesSync(path, t, t); } catch { /* the next beat retries */ }
  }, heartbeatMs);
  beat.unref();
  return () => {
    clearInterval(beat);
    if (readPidfile(path) === pid) {
      try { unlinkSync(path); } catch { /* already gone */ }
    }
  };
}

// Start the daemon unless it is already running — native Windows only, and
// only once `unsnooze install --daemon` has asked for it (the marker). The
// wrappers and the StopFailure hook call this, and between them they run
// whenever an agent does, so the daemon is back soon after a sign-in without
// anything registered to start at logon. Never throws: it sits on the launch
// path, where a failure must cost the daemon and nothing else.
export function ensureDaemon({
  platform = process.platform, marker = DAEMON_ON_DEMAND,
  running = runningDaemonPid, spawner = spawnDetached,
} = {}) {
  try {
    if (platform !== 'win32' || !existsSync(marker) || running()) return null;
    const pid = spawner(['daemon']);
    log(`daemon not running — started it on demand (pid ${pid})`);
    return pid;
  } catch (err) {
    log(`could not start the daemon on demand: ${err.message}`);
    return null;
  }
}

// Stop the on-demand daemon (uninstall, and the restart `install --daemon`
// does). Only a daemon proven live by its heartbeat is signalled — a stale
// file's pid may be anybody's by now. The file goes either way, so a live
// daemon too stale to prove itself stands down at its next beat. Returns the
// pid that was signalled, or null.
export function stopDaemon({
  path = DAEMON_PIDFILE, running = runningDaemonPid,
  kill = (pid, signal) => process.kill(pid, signal),
} = {}) {
  const pid = running({ path });
  if (pid) {
    try { kill(pid, 'SIGTERM'); } catch { /* raced with its exit */ }
    log(`stopped daemon pid ${pid}`);
  }
  try { unlinkSync(path); } catch { /* none to remove */ }
  return pid;
}

// What `install --daemon` does on Windows, as launchctl unload+load does on
// macOS: a daemon already running keeps the code and PATH it started with, so
// re-running setup is how a user hands it new ones.
export function restartDaemon() {
  stopDaemon();
  return ensureDaemon();
}
