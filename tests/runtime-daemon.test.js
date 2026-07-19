const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { RuntimeDaemonManager, RuntimeDaemonError, defaultRuntimeLogFiles, readLastLines } = require('../packages/runtime');
const { parseRuntimeArgs, runRuntimeCommand } = require('../apps/cli/runtime-command');

function tempFiles() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'idurazi-daemon-'));
  const pidFile = path.join(directory, 'runtime.pid');
  return { directory, pidFile, ...defaultRuntimeLogFiles(pidFile) };
}

test('daemon log paths and tail reading are deterministic', () => {
  const { directory, pidFile, stdout } = tempFiles();
  try {
    fs.writeFileSync(stdout, 'one\ntwo\nthree\n');
    assert.deepEqual(defaultRuntimeLogFiles(pidFile), { stdout, stderr: path.join(directory, 'runtime.error.log') });
    assert.deepEqual(readLastLines(stdout, 2), ['two', 'three']);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('daemon manager spawns detached child and waits for readiness', async () => {
  const { directory, pidFile } = tempFiles();
  const calls = [];
  const child = new EventEmitter();
  child.pid = 4321;
  child.exitCode = null;
  child.unref = () => calls.push('unref');
  const manager = new RuntimeDaemonManager({
    cliEntry: path.join(directory, 'cli.js'), pidFile, cwd: directory,
    spawnProcess(command, args, options) {
      calls.push({ command, args, options });
      fs.writeFileSync(pidFile, JSON.stringify({ pid: 4321, token: 'x' }));
      return child;
    },
    createClient: () => ({ async ping() { return { status: 'ok' }; } }),
    sleep: async () => {}
  });
  try {
    const result = await manager.start({ runtimeArgs: ['--database', 'runtime.sqlite'] });
    assert.equal(result.started, true);
    assert.equal(result.pid, 4321);
    assert.equal(calls[0].options.detached, true);
    assert.deepEqual(calls[0].args.slice(-4), ['start', '--foreground', '--database', 'runtime.sqlite']);
    assert.equal(calls[1], 'unref');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('daemon manager refuses a second running instance', async () => {
  const { directory, pidFile } = tempFiles();
  fs.writeFileSync(pidFile, JSON.stringify({ pid: process.pid, token: 'owner' }));
  const manager = new RuntimeDaemonManager({ cliEntry: __filename, pidFile, cwd: directory });
  try {
    await assert.rejects(manager.start(), (error) => error instanceof RuntimeDaemonError && error.code === 'RUNTIME_ALREADY_RUNNING');
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('runtime CLI supports background start, restart, and logs', async () => {
  assert.deepEqual(parseRuntimeArgs(['start', '--background', '--log-file', 'runtime.log']), {
    command: 'start', options: { background: true, logFile: 'runtime.log' }
  });
  const calls = [];
  const lines = [];
  const daemon = {
    async start(options) { calls.push(['start', options]); return { started: true }; },
    async restart(options) { calls.push(['restart', options]); return { started: true, restarted: true }; },
    logs(options) { calls.push(['logs', options]); return { stdout: ['ready'], stderr: [] }; }
  };
  const dependencies = { output: { log: (line) => lines.push(line) }, createDaemon: () => daemon };
  assert.equal(await runRuntimeCommand(['start', '--background'], dependencies), 0);
  assert.equal(await runRuntimeCommand(['restart'], dependencies), 0);
  assert.equal(await runRuntimeCommand(['logs', '--lines', '5'], dependencies), 0);
  assert.equal(calls[0][0], 'start');
  assert.equal(calls[1][0], 'restart');
  assert.deepEqual(calls[2], ['logs', { lines: 5 }]);
  assert.match(lines[2], /ready/);
});
