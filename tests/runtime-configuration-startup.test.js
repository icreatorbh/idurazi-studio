const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const util = require('node:util');
const {
  SecretValue,
  ConfigurationError,
  loadRuntimeConfig,
  publicRuntimeConfig,
  StartupValidator,
  StartupValidationError,
  compareVersions
} = require('../packages/runtime');

test('loadRuntimeConfig applies precedence and coercion', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'idurazi-config-'));
  const file = path.join(cwd, 'runtime.json');
  fs.writeFileSync(file, JSON.stringify({ queue: { concurrency: 2 }, logging: { level: 'warn' } }));
  const config = loadRuntimeConfig({
    cwd,
    file,
    env: { IDURAZI_QUEUE_CONCURRENCY: '3', IDURAZI_DATABASE_FILENAME: './db/runtime.sqlite' },
    overrides: { queue: { concurrency: 4 } }
  });
  assert.equal(config.queue.concurrency, 4);
  assert.equal(config.logging.level, 'warn');
  assert.equal(config.database.filename, path.join(cwd, 'db', 'runtime.sqlite'));
  assert.equal(Object.isFrozen(config.queue), true);
});

test('invalid runtime configuration reports every issue', () => {
  assert.throws(() => loadRuntimeConfig({
    env: {},
    overrides: {
      environment: 'invalid',
      queue: { leaseMs: 100, heartbeatIntervalMs: 100, concurrency: 0 },
      logging: { level: 'verbose' }
    }
  }), (error) => {
    assert.equal(error instanceof ConfigurationError, true);
    assert.equal(error.code, 'RUNTIME_CONFIG_INVALID');
    assert.equal(error.issues.some((item) => item.path === 'environment'), true);
    assert.equal(error.issues.some((item) => item.path === 'queue.heartbeatIntervalMs'), true);
    return true;
  });
});

test('SecretValue and publicRuntimeConfig never serialize credentials', () => {
  const secret = new SecretValue('super-secret', { name: 'openai.apiKey' });
  assert.equal(secret.reveal(), 'super-secret');
  assert.equal(String(secret), '[REDACTED]');
  assert.equal(JSON.stringify({ secret }), '{"secret":"[REDACTED]"}');
  assert.equal(util.inspect(secret).includes('super-secret'), false);

  const config = loadRuntimeConfig({ env: { OPENAI_API_KEY: 'top-secret' }, overrides: { database: { filename: ':memory:' } } });
  const publicConfig = publicRuntimeConfig(config);
  assert.equal(publicConfig.providers.openai.apiKey, '[REDACTED]');
  assert.equal(JSON.stringify(publicConfig).includes('top-secret'), false);
});

test('StartupValidator validates Node.js, directory, and SQLite startup', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'idurazi-startup-'));
  const config = loadRuntimeConfig({ cwd, env: {}, overrides: { database: { filename: './nested/runtime.sqlite' } } });
  const report = new StartupValidator({
    config,
    nodeVersion: '22.5.0',
    clock: () => new Date('2026-07-19T05:00:00.000Z')
  }).validate();
  assert.equal(report.ok, true);
  assert.equal(report.checks.every((check) => check.ok), true);
  assert.equal(fs.existsSync(path.dirname(config.database.filename)), true);
});

test('StartupValidator fails fast for unsupported Node.js versions', () => {
  const config = loadRuntimeConfig({ env: {}, overrides: { database: { filename: ':memory:' } } });
  const validator = new StartupValidator({ config, nodeVersion: '20.0.0' });
  assert.throws(() => validator.validate({ checkDatabase: false }), (error) => {
    assert.equal(error instanceof StartupValidationError, true);
    assert.equal(error.report.failures[0].name, 'node-version');
    return true;
  });
  assert.equal(compareVersions('22.5.0', '22.5.0'), 0);
  assert.equal(compareVersions('23.0.0', '22.5.0'), 1);
});

test('bootstrapRuntime creates and closes the configured runtime boundary', async () => {
  const { bootstrapRuntime, MemoryLogSink, StructuredLogger } = require('../packages/runtime');
  const sink = new MemoryLogSink();
  const logger = new StructuredLogger({ name: 'bootstrap-test', sink });
  const config = loadRuntimeConfig({
    env: {},
    overrides: {
      database: { filename: ':memory:' },
      queue: { concurrency: 2, leaseMs: 500, heartbeatIntervalMs: 100 }
    }
  });
  const runtime = bootstrapRuntime({ config, logger });
  assert.equal(runtime.validation.ok, true);
  assert.equal(runtime.pool.concurrency, 2);
  assert.equal(runtime.health.capture().status, 'healthy');
  await runtime.close();
  await runtime.close();
  assert.equal(sink.entries().some((entry) => entry.message === 'runtime bootstrapped'), true);
});
