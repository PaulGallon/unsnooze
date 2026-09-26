// Native-Windows platform surfaces, tested by injecting the platform so they
// run on every CI OS rather than only on windows-latest.
//
// Each of these was a hard blocker for watching anything on native Windows:
//   - the StopFailure hook command was POSIX-only (`test -f ... || exit 0`),
//     so detection channel #1 never fired under cmd.exe;
//   - the shell wrapper only ever reached ~/.zshrc and ~/.bashrc, so nothing
//     routed a PowerShell `claude` through unsnooze at all;
//   - processBirth() returned null off darwin/linux, so leases failed closed.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';

import {
  mergeHookIntoSettings, hookCommand, powershellWrapperBlock,
  installPowershellBlock,
  stripFencedBlock, installDaemonAutostart, uninstallDaemonAutostart, isSupervised,
} from '../src/install.js';
import { runDoctor } from '../src/doctor.js';
import { powershellProfilePath } from '../src/powershell.js';
import {
} from '../src/install.js';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// runDoctor's state-permissions check defaults to the real ~/.unsnooze. These
// tests assert on wrapper findings only, but without a pinned directory the
// report they build would depend on the developer's own machine — and the
// walk would read whatever that machine happens to have there.
const NO_STATE_DIR = join(tmpdir(), 'unsnooze-windows-test-nostate');

// --- StopFailure hook command ---------------------------------------------

test('the posix hook command is unchanged', () => {
  const cmd = hookCommand({ platform: 'darwin', bin: '/opt/unsnooze/bin/unsnooze.js' });
  assert.match(cmd, /^test -f "/);
  assert.match(cmd, /_hook-stopfailure/);
  assert.match(cmd, /\|\| exit 0$/);
});

test('the windows hook command uses cmd.exe syntax, not `test -f`', () => {
  const cmd = hookCommand({ platform: 'win32', bin: 'C:\\tools\\unsnooze\\bin\\unsnooze.js' });
  assert.doesNotMatch(cmd, /test -f/, '`test` does not exist in cmd.exe');
  assert.match(cmd, /if exist/i);
  assert.match(cmd, /_hook-stopfailure/);
  assert.ok(cmd.includes('C:\\tools\\unsnooze\\bin\\unsnooze.js'));
});

test('a vanished entry point exits 0 on every platform', () => {
  // The guard is the whole reason the command is not a bare `node <bin>`:
  // an uninstalled unsnooze must not spray MODULE_NOT_FOUND into every turn.
  for (const platform of ['darwin', 'linux', 'win32']) {
    assert.match(hookCommand({ platform, bin: '/x/y.js' }), /exit 0/,
      `${platform} must degrade to exit 0`);
  }
});

test('the agent flag survives the windows form', () => {
  const cmd = hookCommand({ platform: 'win32', bin: 'C:\\u.js', agent: 'qwen' });
  assert.match(cmd, /--agent qwen/);
});

test('merged settings carry the platform-appropriate command', () => {
  const win = JSON.parse(mergeHookIntoSettings('{}', { platform: 'win32' }));
  assert.match(win.hooks.StopFailure[0].hooks[0].command, /if exist/i);

  const mac = JSON.parse(mergeHookIntoSettings('{}', { platform: 'darwin' }));
  assert.match(mac.hooks.StopFailure[0].hooks[0].command, /test -f/);
});

test('merge stays idempotent across a platform change', () => {
  // A user who set up under WSL and later runs setup on native Windows must
  // end with one hook, not two competing ones.
  const once = mergeHookIntoSettings('{}', { platform: 'darwin' });
  const twice = JSON.parse(mergeHookIntoSettings(once, { platform: 'win32' }));
  assert.equal(twice.hooks.StopFailure.length, 1);
  assert.match(twice.hooks.StopFailure[0].hooks[0].command, /if exist/i);
});

// --- PowerShell wrapper ----------------------------------------------------

test('the powershell wrapper shadows the agent command like the posix one does', () => {
  const block = powershellWrapperBlock(['claude'], 'C:\\tools\\unsnooze\\bin\\unsnooze.js');
  assert.match(block, /function claude/);
  assert.match(block, /_run claude/);
});

test('the powershell wrapper degrades to the real CLI if unsnooze is gone', () => {
  // Same guarantee as the zsh/bash block: uninstalling unsnooze without
  // cleaning the profile must never brick the user's `claude`.
  const block = powershellWrapperBlock(['claude'], 'C:\\tools\\unsnooze\\bin\\unsnooze.js');
  assert.match(block, /Test-Path/);
  assert.match(block, /UNSNOOZE_ACTIVE/);
});

test('the powershell wrapper covers every enabled agent', () => {
  const block = powershellWrapperBlock(['claude', 'codex'], 'C:\\u.js');
  assert.match(block, /function claude/);
  assert.match(block, /function codex/);
});

test('the powershell wrapper is fenced so it can be removed again', () => {
  const block = powershellWrapperBlock(['claude'], 'C:\\u.js');
  const lines = block.trim().split('\n');
  assert.match(lines[0], /unsnooze/i, 'opens with a marker');
  assert.match(lines[lines.length - 1], /unsnooze/i, 'closes with a marker');
});

// --- PowerShell profile location -------------------------------------------

test('the profile path is asked of PowerShell rather than guessed', () => {
  // ~/Documents can be redirected to OneDrive, and PS 5.1 and 7 use different
  // directories. Guessing a path writes a wrapper nobody ever loads, so ask
  // the shell that will load it.
  const calls = [];
  const runner = (file, args) => {
    calls.push({ file, args });
    return file === 'pwsh' ? 'C:\\Users\\me\\Documents\\PowerShell\\profile.ps1' : '';
  };
  const path = powershellProfilePath({ platform: 'win32', runner });
  assert.equal(path, 'C:\\Users\\me\\Documents\\PowerShell\\profile.ps1');
  assert.match(calls[0].args.join(' '), /CurrentUserAllHosts/);
});

test('the profile lookup falls back to Windows PowerShell when pwsh is absent', () => {
  const runner = file => {
    if (file === 'pwsh') throw new Error('ENOENT');
    return 'C:\\Users\\me\\Documents\\WindowsPowerShell\\profile.ps1';
  };
  assert.match(powershellProfilePath({ platform: 'win32', runner }),
    /WindowsPowerShell\\profile\.ps1$/);
});

test('there is no powershell profile to write off windows', () => {
  const runner = () => { throw new Error('should not be called'); };
  assert.equal(powershellProfilePath({ platform: 'darwin', runner }), null);
});

test('an unusable powershell yields null rather than a bogus path', () => {
  const runner = () => { throw new Error('ENOENT'); };
  assert.equal(powershellProfilePath({ platform: 'win32', runner }), null);
  assert.equal(powershellProfilePath({ platform: 'win32', runner: () => '  ' }), null);
});

// --- PowerShell profile editing --------------------------------------------

test('installing into a profile preserves what was already there', () => {
  const before = 'Set-Alias ll Get-ChildItem\n';
  const after = installPowershellBlock(before, ['claude'], 'C:\\u.js');
  assert.match(after, /Set-Alias ll Get-ChildItem/);
  assert.match(after, /function claude/);
});

test('re-installing into a profile does not stack duplicate blocks', () => {
  const once = installPowershellBlock('', ['claude'], 'C:\\u.js');
  const twice = installPowershellBlock(once, ['claude'], 'C:\\u.js');
  assert.equal(twice.match(/function claude/g).length, 1);
});

test('a profile block can be removed cleanly, leaving the user content', () => {
  const before = 'Set-Alias ll Get-ChildItem\n';
  const withBlock = installPowershellBlock(before, ['claude'], 'C:\\u.js');
  const { content, found } = stripFencedBlock(withBlock, '# >>> unsnooze >>>', '# <<< unsnooze <<<');
  assert.equal(found, true);
  assert.match(content, /Set-Alias ll Get-ChildItem/);
  assert.doesNotMatch(content, /function claude/);
});

test('the default runner is wired up, not just the injected one', () => {
  // Guards the seam every other test bypasses: with no runner injected this
  // spawns a real PowerShell, which surfaces a missing import as the
  // ReferenceError the lookup deliberately rethrows.
  //
  // The RESULT cannot be asserted, only its shape: GitHub's macOS and Ubuntu
  // runners ship pwsh, so this returns a genuine profile path there and null on
  // a developer machine without PowerShell. An earlier version of this test
  // asserted null off win32 and went red on CI for that reason.
  const result = powershellProfilePath({ platform: 'win32' });
  assert.ok(result === null || (typeof result === 'string' && result.length > 0),
    `expected null or a non-empty path, got ${JSON.stringify(result)}`);
});

// --- Windows daemon autostart (on demand, nothing registered) ---------------
// Up to 1.19.1, setup ran `schtasks /create /f /sc onlogon /tr "node … daemon"`,
// and Microsoft Defender flagged it as Trojan:Win32/Commando.A!ml: an
// interpreter running a script out of %APPDATA% at every logon is how malware
// persists. Setup must never register a logon entry again — the daemon is
// started now, and on demand afterwards.

const WIN_AUTOSTART_DIR = mkdtempSync(join(tmpdir(), 'unsnooze-windows-autostart-'));
after(() => rmSync(WIN_AUTOSTART_DIR, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }));

function recorder() {
  const calls = [];
  const activate = (file, args) => { calls.push({ file, args }); return false; };
  return { calls, activate };
}

test('windows autostart registers nothing with the OS — no Scheduled Task, no Run key', () => {
  const dir = join(WIN_AUTOSTART_DIR, 'fresh');
  const { calls, activate } = recorder();
  let starts = 0;
  const target = installDaemonAutostart({ platform: 'win32', dir, activate, start: () => { starts++; } });
  assert.deepEqual(calls, [], 'setup must not run schtasks, reg, or anything else to persist the daemon');
  assert.equal(starts, 1, 'the daemon is started right away instead');
  assert.equal(target, join(dir, 'daemon-on-demand'));
  assert.match(readFileSync(target, 'utf-8'), /started on demand/,
    'the marker says what it is to anyone who finds it');
});

test('re-running windows setup rewrites the marker and restarts the daemon', () => {
  // A running daemon keeps the code and PATH it started with; re-running setup
  // is how a user hands it new ones, as launchctl unload+load does on macOS.
  const dir = join(WIN_AUTOSTART_DIR, 'rerun');
  let starts = 0;
  const start = () => { starts++; };
  installDaemonAutostart({ platform: 'win32', dir, activate: () => true, start });
  installDaemonAutostart({ platform: 'win32', dir, activate: () => true, start });
  assert.equal(starts, 2);
  assert.deepEqual(readdirSync(dir), ['daemon-on-demand']);
});

test('the real starter never runs for a marker outside the live location', () => {
  // The unit platforms' interlock, carried over: the default starter restarts
  // the daemon the live marker describes, so a fixture written elsewhere must
  // not bounce the user's real one. Writing still works; only the start is
  // withheld.
  const dir = join(WIN_AUTOSTART_DIR, 'interlock');
  const target = installDaemonAutostart({ platform: 'win32', dir, activate: () => true });
  assert.ok(existsSync(target), 'the marker is still written');

  // An injected starter is always honored — that is a caller stating intent,
  // and it is how every other test drives this code.
  let starts = 0;
  installDaemonAutostart({ platform: 'win32', dir, start: () => { starts++; } });
  assert.equal(starts, 1, 'injected starters still run');
});

test('windows uninstall removes the marker and stops the daemon', () => {
  const dir = join(WIN_AUTOSTART_DIR, 'uninstall');
  installDaemonAutostart({ platform: 'win32', dir, activate: () => true, start: () => {} });
  const { calls, activate } = recorder();   // no legacy task: every query fails
  let stops = 0;
  const removed = uninstallDaemonAutostart({ platform: 'win32', dir, activate, stop: () => { stops++; } });
  assert.equal(removed, join(dir, 'daemon-on-demand'));
  assert.ok(!existsSync(join(dir, 'daemon-on-demand')));
  assert.equal(stops, 1);
  assert.deepEqual(calls.map(c => [c.file, ...c.args]), [['schtasks', '/query', '/tn', 'unsnooze']],
    'a machine without the old task sees a read-only query, never a delete');
});

test('windows uninstall deletes a Scheduled Task left by 1.19.1 or earlier', () => {
  const dir = join(WIN_AUTOSTART_DIR, 'legacy');
  const calls = [];
  const removed = uninstallDaemonAutostart({
    platform: 'win32', dir, stop: () => {},
    activate: (file, args) => { calls.push([file, ...args]); return true; },
  });
  assert.deepEqual(calls, [
    ['schtasks', '/query', '/tn', 'unsnooze'],
    ['schtasks', '/delete', '/f', '/tn', 'unsnooze'],
  ], 'delete must not prompt');
  assert.equal(removed, 'Scheduled Task \\unsnooze');
});

test('windows uninstall says how to delete an old task it could not', () => {
  // A task created from an elevated shell can need one to delete it.
  const dir = join(WIN_AUTOSTART_DIR, 'stuck');
  const said = [];
  const removed = uninstallDaemonAutostart({
    platform: 'win32', dir, stop: () => {}, say: m => said.push(m),
    activate: (file, args) => args[0] === '/query',   // it exists; the delete is refused
  });
  assert.equal(removed, null, 'not reported as removed');
  assert.equal(said.length, 1);
  assert.match(said[0], /administrator/);
  assert.match(said[0], /schtasks \/delete \/tn unsnooze \/f/);
});

test('windows uninstall with nothing installed reports nothing removed', () => {
  const dir = join(WIN_AUTOSTART_DIR, 'nothing');
  assert.equal(uninstallDaemonAutostart({ platform: 'win32', dir, activate: () => false, stop: () => {} }), null);
});

test('no source file creates a Scheduled Task or another logon entry', () => {
  // A tripwire for the Defender detection: whatever else changes, nothing in
  // src/ may hand schtasks a /create or write a Run key or the Startup folder.
  const srcDir = fileURLToPath(new URL('../src/', import.meta.url));
  const offenders = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) {
        const code = readFileSync(p, 'utf-8');
        if (/['"]schtasks(?:\.exe)?['"]\s*,\s*\[\s*['"]\/create['"]/i.test(code)
          || /Register-ScheduledTask/i.test(code)
          || /CurrentVersion\\\\Run\b/i.test(code)
          || /Start Menu\\\\Programs\\\\Startup/i.test(code)) offenders.push(p);
      }
    }
  };
  walk(srcDir);
  assert.deepEqual(offenders, []);
});

test('nothing supervises the Windows daemon, so it must never exit into nothing', () => {
  // launchd KeepAlive and systemd Restart=always bring the daemon back; on
  // Windows only the next wrapped launch or hook does, which may be hours
  // away. isSupervised() gates the version-skew exit, so answering true here
  // would stop Windows watching until then.
  assert.equal(isSupervised({ platform: 'win32', env: {} }), false);
  assert.equal(isSupervised({ platform: 'win32', env: { INVOCATION_ID: 'x' } }), false);
});

// --- doctor's wrapper check ------------------------------------------------

test('doctor looks for the wrapper where the platform actually puts it', async () => {
  // Without this, every native-Windows `unsnooze doctor` reports "shell
  // wrappers are not installed" — a false health failure pointing the user at
  // an install they already did.
  const withBlock = installPowershellBlock('', ['claude'], 'C:\\u.js');
  const report = await runDoctor({
    stateDir: NO_STATE_DIR,
    platform: 'win32',
    runner: () => ({ status: 1, stdout: '' }),
    csgBinPath: null,
    mux: { available: () => true, name: 'headless' },
    designRegistered: () => false,
    hookInstalled: () => true,
    profileContent: () => withBlock,
    rcContent: () => '',
  });
  assert.ok(!report.findings.some(f => f.id === 'wrappers-missing'),
    'a PowerShell profile carrying the block counts as installed');
});

test('doctor still reports a genuinely missing windows wrapper', async () => {
  const report = await runDoctor({
    stateDir: NO_STATE_DIR,
    platform: 'win32',
    runner: () => ({ status: 1, stdout: '' }),
    csgBinPath: null,
    mux: { available: () => true, name: 'headless' },
    designRegistered: () => false,
    hookInstalled: () => true,
    profileContent: () => '',
    rcContent: () => '',
  });
  assert.ok(report.findings.some(f => f.id === 'wrappers-missing'));
});
