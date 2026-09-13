import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIR = mkdtempSync(join(tmpdir(), 'unsnooze-t3-test-'));
process.env.UNSNOOZE_STATE_DIR = join(DIR, 'unsnooze');
const { findT3Thread, exchangeT3PairingToken, t3Rpc, sendT3Wake } = await import('../src/t3.js');

after(() => rmSync(DIR, { recursive: true, force: true }));

test('maps a Codex rollout to its owning T3 thread from structured provider events', () => {
  const home = join(DIR, 't3');
  const logs = join(home, 'userdata', 'logs', 'provider');
  mkdirSync(logs, { recursive: true });
  writeFileSync(join(logs, 'events.thread-wrong.log'),
    '[now] NOTE: user mentioned session-codex\n');
  writeFileSync(join(logs, 'events.thread-right.log.2'), '[now] NTIVE: ' + JSON.stringify({
    threadId: 'thread-right', method: 'thread/started',
    payload: { thread: { id: 'session-codex', sessionId: 'session-codex' } },
  }) + '\n');
  assert.equal(findT3Thread('session-codex', home), 'thread-right');
  assert.equal(findT3Thread('missing', home), null);
});

test('pairing exchange requests narrow scopes and stores the access token privately', async () => {
  const accessFile = join(DIR, 'access.json');
  let request;
  const fetchImpl = async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ access_token: 'secret-access', expires_in: 60, scope: 'orchestration:read orchestration:operate' }) };
  };
  const result = await exchangeT3PairingToken('one-time', 'http://127.0.0.1:3773', {
    fetchImpl, now: 1000, accessFile,
  });
  assert.equal(result.expiresAt, 61_000);
  assert.equal(request.url, 'http://127.0.0.1:3773/oauth/token');
  assert.match(String(request.options.body), /scope=orchestration%3Aread\+orchestration%3Aoperate/);
  assert.equal(JSON.parse(readFileSync(accessFile)).accessToken, 'secret-access');
  if (process.platform !== 'win32') assert.equal(statSync(accessFile).mode & 0o077, 0);
});

test('RPC uses a one-time websocket ticket and resolves the matching Effect RPC exit', async () => {
  let socket;
  class FakeSocket extends EventEmitter {
    constructor(url) { super(); this.url = url; socket = this; queueMicrotask(() => this.emit('open')); }
    send(raw) {
      const request = JSON.parse(raw);
      this.sent = request;
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({
        _tag: 'Exit', requestId: request.id, exit: { _tag: 'Success', value: { sequence: 42 } },
      }))));
    }
    close() { this.closed = true; }
  }
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ticket: 'short-ticket' }) });
  const result = await t3Rpc('http://127.0.0.1:3773', 'access', 'orchestration.dispatchCommand',
    { type: 'test' }, { fetchImpl, WebSocketImpl: FakeSocket });
  assert.deepEqual(result, { sequence: 42 });
  assert.match(socket.url, /wsTicket=short-ticket/);
  assert.equal(socket.sent.tag, 'orchestration.dispatchCommand');
  assert.deepEqual(socket.sent.headers, []);
});

test('RPC can resolve the first item from a streaming response', async () => {
  class FakeSocket extends EventEmitter {
    constructor() { super(); queueMicrotask(() => this.emit('open')); }
    send(raw) {
      const request = JSON.parse(raw);
      queueMicrotask(() => this.emit('message', Buffer.from(JSON.stringify({
        _tag: 'Chunk', requestId: request.id,
        values: [{ kind: 'snapshot', snapshot: { thread: { runtimeMode: 'approval-required' } } }],
      }))));
    }
    close() {}
  }
  const fetchImpl = async () => ({ ok: true, json: async () => ({ ticket: 'short-ticket' }) });
  const result = await t3Rpc('http://127.0.0.1:3773', 'access',
    'orchestration.subscribeThread', { threadId: 'thread' },
    { fetchImpl, WebSocketImpl: FakeSocket, firstChunk: true });
  assert.equal(result.snapshot.thread.runtimeMode, 'approval-required');
});

test('wake preserves the T3 thread runtime and interaction modes', async () => {
  const calls = [];
  const result = await sendT3Wake({
    agent: 'codex', origin: 't3code_desktop', sessionId: 'codex-session',
  }, 'Continue', {
    runtime: { origin: 'http://127.0.0.1:3773' },
    access: { accessToken: 'access' }, threadId: 't3-thread',
    rpc: async (_server, _token, tag, payload, rpcOptions) => {
      calls.push({ tag, payload, rpcOptions });
      if (tag === 'orchestration.subscribeThread') return {
        kind: 'snapshot', snapshot: { thread: {
          runtimeMode: 'approval-required', interactionMode: 'plan',
        } },
      };
      return { sequence: 7 };
    },
  });
  assert.equal(result.result.sequence, 7);
  assert.equal(calls[0].rpcOptions.firstChunk, true);
  assert.equal(calls[1].payload.runtimeMode, 'approval-required');
  assert.equal(calls[1].payload.interactionMode, 'plan');
});
