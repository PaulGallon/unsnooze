// T3 Code integration. GUI-owned Codex sessions cannot be opened by a second
// `codex resume` client while T3 is attached. T3's orchestration API is the
// owning client, so send the wake message through it instead.

import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { STATE_DIR, ensureStateDir, writePrivateFile } from './config.js';

const DEFAULT_T3_HOME = join(homedir(), '.t3');
const ACCESS_FILE = () => process.env.UNSNOOZE_T3_ACCESS_FILE
  || join(STATE_DIR, 't3-access.json');
const STANDARD_SCOPES = 'orchestration:read orchestration:operate';
const TOKEN_GRANT = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN_TYPE = 'urn:ietf:params:oauth:token-type:access_token';
const BOOTSTRAP_TOKEN_TYPE = 'urn:t3:params:oauth:token-type:environment-bootstrap';

export function t3Home() {
  return process.env.UNSNOOZE_T3_HOME || process.env.T3CODE_HOME || DEFAULT_T3_HOME;
}

export function readT3Runtime(home = t3Home()) {
  try {
    const value = JSON.parse(readFileSync(join(home, 'userdata', 'server-runtime.json'), 'utf8'));
    if (!value?.origin) return null;
    return value;
  } catch { return null; }
}

export function readT3Access(path = ACCESS_FILE()) {
  const fromEnv = process.env.UNSNOOZE_T3_ACCESS_TOKEN;
  if (fromEnv) return { accessToken: fromEnv, expiresAt: null };
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    const accessToken = value.accessToken || value.access_token;
    if (!accessToken) return null;
    return { ...value, accessToken };
  } catch { return null; }
}

// Provider event filenames are keyed by T3 thread id. A structured
// thread/started notification contains the corresponding Codex rollout id.
// Parsing this event avoids a SQLite/native dependency and ignores ordinary
// transcript text that merely mentions another session id.
export function findT3Thread(sessionId, home = t3Home()) {
  if (!sessionId) return null;
  const dir = join(home, 'userdata', 'logs', 'provider');
  let files;
  try {
    files = readdirSync(dir)
      .map(name => ({ name, match: name.match(/^events\.([^.]+)\.log(?:\.\d+)?$/) }))
      .filter(file => file.match)
      .map(file => ({ ...file, mtime: statSync(join(dir, file.name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch { return null; }
  for (const { name, match } of files) {
    const path = join(dir, name);
    let text;
    try { text = readFileSync(path, 'utf8'); } catch { continue; }
    if (!text.includes(sessionId)) continue;
    for (const line of text.split('\n')) {
      const start = line.indexOf('{');
      if (start < 0) continue;
      try {
        const event = JSON.parse(line.slice(start));
        if (event.method === 'thread/started'
          && (event.payload?.thread?.id === sessionId
            || event.payload?.thread?.sessionId === sessionId)) {
          return event.threadId || match[1];
        }
      } catch { /* non-JSON provider diagnostic */ }
    }
  }
  return null;
}

async function jsonFetch(url, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body.reason || body.error_description || body.error || response.statusText;
    throw new Error(`${response.status}${detail ? ` ${detail}` : ''}`);
  }
  return body;
}

export async function exchangeT3PairingToken(pairingToken, serverUrl, {
  fetchImpl = fetch, now = Date.now(), accessFile = ACCESS_FILE(),
} = {}) {
  const body = new URLSearchParams({
    grant_type: TOKEN_GRANT,
    subject_token: pairingToken,
    subject_token_type: BOOTSTRAP_TOKEN_TYPE,
    requested_token_type: ACCESS_TOKEN_TYPE,
    scope: STANDARD_SCOPES,
  });
  const value = await jsonFetch(`${serverUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }, fetchImpl);
  if (!value.access_token) throw new Error('T3 Code token response had no access_token');
  const stored = {
    version: 1,
    serverUrl,
    accessToken: value.access_token,
    expiresAt: Number.isFinite(value.expires_in) ? now + value.expires_in * 1000 : null,
    scope: value.scope || STANDARD_SCOPES,
  };
  ensureStateDir();
  writePrivateFile(accessFile, `${accessFile}.tmp.${process.pid}`,
    JSON.stringify(stored, null, 2) + '\n');
  return stored;
}

function rpcFailure(exit) {
  const cause = exit?.cause;
  if (Array.isArray(cause)) {
    return cause.map(item => item?.defect || item?.error?.message || JSON.stringify(item)).join('; ');
  }
  return cause?.message || JSON.stringify(cause || exit);
}

export async function t3Rpc(serverUrl, accessToken, tag, payload, {
  fetchImpl = fetch, WebSocketImpl = WebSocket, timeoutMs = 10_000,
  firstChunk = false,
} = {}) {
  const ticket = await jsonFetch(`${serverUrl}/api/auth/websocket-ticket`, {
    method: 'POST', headers: { authorization: `Bearer ${accessToken}` },
  }, fetchImpl);
  if (!ticket.ticket) throw new Error('T3 Code websocket-ticket response had no ticket');
  const url = new URL(serverUrl.replace(/^http/, 'ws'));
  url.pathname = '/ws';
  url.search = '';
  url.searchParams.set('wsTicket', ticket.ticket);
  const requestId = randomUUID();
  return new Promise((resolve, reject) => {
    const ws = new WebSocketImpl(url.toString());
    const listen = (event, handler) => {
      if (typeof ws.addEventListener === 'function') ws.addEventListener(event, handler);
      else ws.on(event, handler);
    };
    let settled = false;
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* already closed */ }
      fn(value);
    };
    const timer = setTimeout(() => done(reject, new Error('T3 Code RPC timed out')), timeoutMs);
    listen('open', () => ws.send(JSON.stringify({
      _tag: 'Request', id: requestId, tag, payload, headers: [],
    })));
    listen('message', event => {
      let message;
      const raw = event?.data ?? event;
      try { message = JSON.parse(typeof raw === 'string' ? raw : raw.toString()); } catch { return; }
      if (message.requestId !== requestId && message.id !== requestId) return;
      if (firstChunk && message._tag === 'Chunk' && message.values?.length) {
        done(resolve, message.values[0]);
        return;
      }
      if (message._tag !== 'Exit') return;
      if (message.exit?._tag === 'Success') done(resolve, message.exit.value);
      else done(reject, new Error(`T3 Code RPC failed: ${rpcFailure(message.exit)}`));
    });
    listen('error', event => done(reject, event?.error || new Error(event?.message || 'T3 Code websocket error')));
    listen('close', () => {
      if (!settled) done(reject, new Error('T3 Code websocket closed before replying'));
    });
  });
}

export async function sendT3Wake(rec, message, options = {}) {
  if (rec?.agent !== 'codex' || rec?.origin !== 't3code_desktop' || !rec.sessionId) {
    return { handled: false, reason: 'not a T3 Code Codex session' };
  }
  const runtime = options.runtime || readT3Runtime(options.home);
  const access = options.access || readT3Access(options.accessFile);
  if (!runtime?.origin) {
    return { handled: false, reason: 'T3 Code is not running' };
  }
  if (!access?.accessToken) {
    return { handled: false, locked: true, reason: 'T3 Code access is not configured; run unsnooze t3 setup' };
  }
  if (access.expiresAt && access.expiresAt <= Date.now()) {
    return { handled: false, locked: true, reason: 'T3 Code access token expired; run unsnooze t3 setup' };
  }
  const threadId = options.threadId || findT3Thread(rec.sessionId, options.home);
  if (!threadId) return { handled: false, locked: true, reason: 'T3 Code thread mapping was not found' };
  const rpc = options.rpc || t3Rpc;
  const streamItem = options.threadSettings ? null : await rpc(
    runtime.origin, access.accessToken, 'orchestration.subscribeThread',
    { threadId }, { firstChunk: true },
  );
  const threadSettings = options.threadSettings || streamItem?.snapshot?.thread;
  if (!threadSettings?.runtimeMode || !threadSettings?.interactionMode) {
    throw new Error('T3 Code thread settings were not available');
  }
  if (options.beforeSend && !options.beforeSend(threadId)) {
    return { handled: true, stale: true, threadId };
  }
  const result = await rpc(runtime.origin, access.accessToken, 'orchestration.dispatchCommand', {
    type: 'thread.turn.start',
    commandId: randomUUID(),
    threadId,
    message: { messageId: randomUUID(), role: 'user', text: message, attachments: [] },
    runtimeMode: threadSettings.runtimeMode,
    interactionMode: threadSettings.interactionMode,
    createdAt: new Date().toISOString(),
  });
  return { handled: true, threadId, result };
}

export function findT3Cli(home = t3Home()) {
  const root = join(home, 'wsl-runtime');
  try {
    const candidates = readdirSync(root)
      .map(name => join(root, name, 'apps', 'server', 'dist', 'bin.mjs'))
      .filter(existsSync)
      .map(path => ({ path, mtime: statSync(path).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    return candidates[0]?.path || null;
  } catch { return null; }
}

export async function cmdT3(args = []) {
  const action = args[0] || 'status';
  const runtime = readT3Runtime();
  if (action === 'status') {
    const access = readT3Access();
    const running = !!runtime?.origin;
    const valid = !!access?.accessToken && (!access.expiresAt || access.expiresAt > Date.now());
    console.log(`T3 Code server: ${running ? `running at ${runtime.origin}` : 'not found'}`);
    console.log(`Unsnooze access: ${valid ? `configured${access.expiresAt ? ` until ${new Date(access.expiresAt).toLocaleString()}` : ''}` : 'not configured or expired'}`);
    if (!valid) console.log('Run: unsnooze t3 setup');
    return running && valid ? 0 : 1;
  }
  if (action !== 'setup') {
    console.error('Usage: unsnooze t3 [status|setup]');
    return 2;
  }
  if (!runtime?.origin) {
    console.error('unsnooze: T3 Code is not running or its server-runtime.json was not found.');
    return 1;
  }
  const cli = findT3Cli();
  if (!cli) {
    console.error('unsnooze: T3 Code CLI was not found under ~/.t3/wsl-runtime.');
    return 1;
  }
  // Pairing output contains a one-time credential. Keep it in memory, exchange
  // it immediately for a narrowly-scoped access token, and never print it.
  const paired = spawnSync(process.execPath, [cli, 'pair', '--base-dir', t3Home(),
    '--ttl', '90d', '--label', 'unsnooze'], { encoding: 'utf8', timeout: 15_000 });
  if (paired.error || paired.status !== 0) {
    console.error(`unsnooze: could not pair with T3 Code: ${paired.error?.message || paired.stderr?.trim() || `exit ${paired.status}`}`);
    return 1;
  }
  const credential = paired.stdout.match(/^Token:\s*(\S+)\s*$/m)?.[1];
  if (!credential) {
    console.error('unsnooze: T3 Code pairing output did not contain a token.');
    return 1;
  }
  try {
    const access = await exchangeT3PairingToken(credential, runtime.origin);
    console.log(`unsnooze: T3 Code integration configured until ${new Date(access.expiresAt).toLocaleString()}.`);
    return 0;
  } catch (error) {
    console.error(`unsnooze: T3 Code token exchange failed: ${error.message}`);
    return 1;
  }
}
