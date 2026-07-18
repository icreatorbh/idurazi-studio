const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { RuntimeService, RuntimeState, installShutdownHooks } = require('../packages/runtime');
const { parseRuntimeArgs, createBootstrapOptions, runRuntimeCommand } = require('../apps/cli/runtime-command');

function fakeRuntime() {
  const registered = [];
  let closed = 0;
  return {
    pool: {
      activeJobs: [],
      register(type) { registered.push(type); },
      unregister() { return true; },
      start() { return new Promise(() => {}); }
    },
    health: { capture: () => ({ status: 'healthy' }) },
    async close() { closed += 1; },
    get registered() { return registered; },
    get closed() { return closed; }
  };
}

test('RuntimeService starts, reports health, and stops idempotently', async () => {
  const runtime = fakeRuntime();
  const service = new RuntimeService({ bootstrap: () => runtime, singleInstance: false, handlers: { demo: async () => {} } });
  assert.equal(service.status().state, RuntimeState.IDLE);
  await service.start();
  assert.equal(service.status().state, RuntimeState.RUNNING);
  assert.deepEqual(runtime.registered, ['demo']);
  assert.equal(service.health().status, 'healthy');
  await Promise.all([service.stop(), service.stop()]);
  assert.equal(service.status().state, RuntimeState.STOPPED);
  assert.equal(runtime.closed, 1);
});

test('RuntimeService records bootstrap failure', async () => {
  const service = new RuntimeService({ bootstrap: () => { throw new Error('boom'); }, singleInstance: false });
  await assert.rejects(service.start(), /boom/);
  assert.equal(service.status().state, RuntimeState.FAILED);
  assert.equal(service.health().status, 'unhealthy');
});

test('shutdown hooks stop the service once and are removable', async () => {
  const processTarget = new EventEmitter();
  processTarget.exitCode = null;
  let stops = 0;
  const hooks = installShutdownHooks({ async stop() { stops += 1; } }, { processTarget, logger: {}, signals: ['SIGTERM'] });
  processTarget.emit('SIGTERM');
  processTarget.emit('SIGTERM');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(stops, 1);
  assert.equal(processTarget.exitCode, 0);
  hooks.dispose();
  assert.equal(processTarget.listenerCount('SIGTERM'), 0);
});

test('runtime CLI parser and status command expose operational configuration', async () => {
  assert.deepEqual(parseRuntimeArgs(['health', '--database', 'runtime.db']), { command: 'health', options: { database: 'runtime.db' } });
  assert.equal(createBootstrapOptions({ database: 'runtime.db' }, '/tmp').overrides.database.filename, 'runtime.db');
  const lines = [];
  const code = await runRuntimeCommand(['status'], {
    output: { log: (value) => lines.push(value) },
    loadRuntimeConfig: () => ({ environment: 'test', database: { filename: ':memory:' } })
  });
  assert.equal(code, 0);
  assert.match(lines[0], /configured/);
  assert.match(lines[0], /:memory:/);
});

test('runtime CLI health closes temporary runtime', async () => {
  let closed = false;
  const lines = [];
  const code = await runRuntimeCommand(['health'], {
    output: { log: (value) => lines.push(value) },
    bootstrapRuntime: () => ({ health: { capture: () => ({ status: 'healthy' }) }, close: async () => { closed = true; } })
  });
  assert.equal(code, 0);
  assert.equal(closed, true);
  assert.match(lines[0], /healthy/);
});
