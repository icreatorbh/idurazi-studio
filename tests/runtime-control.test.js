const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  RuntimeService,
  RuntimeControlClient,
  RuntimeControlError,
  defaultRuntimeControlEndpoint,
  RuntimeState
} = require('../packages/runtime');
const { runRuntimeCommand, parseRuntimeArgs } = require('../apps/cli/runtime-command');

function tempRuntimeFiles() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'idurazi-control-'));
  return { directory, pidFile: path.join(directory, 'runtime.pid') };
}

function fakeRuntime() {
  return {
    pool: { activeJobs: [], register() {}, unregister() {}, start() {} },
    health: { capture: () => ({ status: 'healthy', queue: { total: 0 } }) },
    async close() {}
  };
}

async function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('Runtime control endpoint is deterministic for a PID file', () => {
  const first = defaultRuntimeControlEndpoint('/tmp/example.pid');
  assert.equal(first, defaultRuntimeControlEndpoint('/tmp/example.pid'));
  assert.notEqual(first, defaultRuntimeControlEndpoint('/tmp/other.pid'));
});

test('external client reads status, health, and ping from a running Runtime', async () => {
  const { directory, pidFile } = tempRuntimeFiles();
  const service = new RuntimeService({ bootstrap: fakeRuntime, pidFile });
  try {
    await service.start();
    const client = new RuntimeControlClient({ pidFile, timeoutMs: 1000 });
    assert.equal((await client.ping()).status, 'ok');
    assert.equal((await client.status()).state, RuntimeState.RUNNING);
    assert.equal((await client.health()).status, 'healthy');
  } finally {
    await service.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('external stop command stops the Runtime and removes its PID file', async () => {
  const { directory, pidFile } = tempRuntimeFiles();
  const service = new RuntimeService({ bootstrap: fakeRuntime, pidFile });
  try {
    await service.start();
    const client = new RuntimeControlClient({ pidFile, timeoutMs: 1000 });
    const response = await client.stop();
    assert.equal(response.accepted, true);
    await waitFor(() => service.status().state === RuntimeState.STOPPED);
    assert.equal(fs.existsSync(pidFile), false);
  } finally {
    if (service.status().state !== RuntimeState.STOPPED) await service.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('control client reports when the Runtime is not running', async () => {
  const { directory, pidFile } = tempRuntimeFiles();
  try {
    const client = new RuntimeControlClient({ pidFile });
    await assert.rejects(client.status(), (error) => error instanceof RuntimeControlError && error.code === 'RUNTIME_NOT_RUNNING');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('runtime CLI exposes remote ping and stop commands', async () => {
  assert.deepEqual(parseRuntimeArgs(['stop', '--timeout', '2500']), { command: 'stop', options: { timeoutMs: 2500 } });
  const calls = [];
  const lines = [];
  const createControlClient = () => ({
    async ping() { calls.push('ping'); return { status: 'ok' }; },
    async stop(options) { calls.push(['stop', options]); return { accepted: true }; }
  });
  assert.equal(await runRuntimeCommand(['ping'], { output: { log: (line) => lines.push(line) }, createControlClient }), 0);
  assert.equal(await runRuntimeCommand(['stop', '--timeout', '2500'], { output: { log: (line) => lines.push(line) }, createControlClient }), 0);
  assert.deepEqual(calls, ['ping', ['stop', { timeoutMs: 2500 }]]);
  assert.match(lines[0], /ok/);
  assert.match(lines[1], /accepted/);
});
