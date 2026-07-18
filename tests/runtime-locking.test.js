const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { RuntimeLock, RuntimeLockError, RuntimeService } = require('../packages/runtime');

function temporaryPidFile() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'idurazi-lock-'));
  return { directory, filename: path.join(directory, 'runtime.pid') };
}

function fakeRuntime() {
  return {
    pool: { activeJobs: [], register() {}, unregister() {}, start() {} },
    health: { capture: () => ({ status: 'healthy' }) },
    async close() {}
  };
}

test('RuntimeLock creates a protected PID file and removes it on release', () => {
  const { directory, filename } = temporaryPidFile();
  try {
    const lock = new RuntimeLock(filename, { pid: 1234, processAlive: () => true });
    const status = lock.acquire({ instance: 'test' });
    assert.equal(status.acquired, true);
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).pid, 1234);
    assert.equal(lock.release(), true);
    assert.equal(fs.existsSync(filename), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('RuntimeLock rejects a second live owner', () => {
  const { directory, filename } = temporaryPidFile();
  try {
    const first = new RuntimeLock(filename, { pid: 100, processAlive: () => true });
    first.acquire();
    const second = new RuntimeLock(filename, { pid: 200, processAlive: () => true });
    assert.throws(() => second.acquire(), RuntimeLockError);
    first.release();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('RuntimeLock replaces a stale PID file', () => {
  const { directory, filename } = temporaryPidFile();
  try {
    fs.writeFileSync(filename, JSON.stringify({ pid: 999999, token: 'stale' }));
    const lock = new RuntimeLock(filename, { pid: 300, processAlive: () => false });
    lock.acquire();
    assert.equal(JSON.parse(fs.readFileSync(filename, 'utf8')).pid, 300);
    lock.release();
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('RuntimeService holds the single-instance lock for its lifecycle', async () => {
  const { directory, filename } = temporaryPidFile();
  try {
    const service = new RuntimeService({ bootstrap: fakeRuntime, pidFile: filename });
    await service.start();
    assert.equal(fs.existsSync(filename), true);
    assert.equal(service.status().lock.locked, true);
    await service.stop();
    assert.equal(fs.existsSync(filename), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
