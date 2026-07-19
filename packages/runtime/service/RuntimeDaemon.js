const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { RuntimeControlClient } = require('./RuntimeControl');
const { RuntimeLock, defaultRuntimePidFile } = require('./RuntimeLock');

class RuntimeDaemonError extends Error {
  constructor(message, { code = 'RUNTIME_DAEMON_ERROR', details = null } = {}) {
    super(message);
    this.name = 'RuntimeDaemonError';
    this.code = code;
    this.details = details;
  }
}

function defaultRuntimeLogFiles(pidFile) {
  const resolved = path.resolve(pidFile);
  const base = resolved.toLowerCase().endsWith('.pid') ? resolved.slice(0, -4) : resolved;
  return {
    stdout: `${base}.log`,
    stderr: `${base}.error.log`
  };
}

function readLastLines(filename, lineCount = 100, fsModule = fs) {
  const count = Math.max(0, Math.trunc(lineCount));
  if (count === 0) return [];
  try {
    const value = fsModule.readFileSync(filename, 'utf8');
    const lines = value.replace(/\r\n/g, '\n').split('\n');
    if (lines.at(-1) === '') lines.pop();
    return lines.slice(-count);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

class RuntimeDaemonManager {
  constructor({
    cliEntry,
    pidFile,
    cwd = process.cwd(),
    stdoutFile,
    stderrFile,
    nodeExecutable = process.execPath,
    spawnProcess = spawn,
    fsModule = fs,
    createClient = (options) => new RuntimeControlClient(options),
    now = () => Date.now(),
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  } = {}) {
    if (!cliEntry) throw new TypeError('RuntimeDaemonManager requires cliEntry');
    if (!pidFile) throw new TypeError('RuntimeDaemonManager requires pidFile');
    this.cliEntry = path.resolve(cliEntry);
    this.pidFile = path.resolve(pidFile);
    this.cwd = path.resolve(cwd);
    const logs = defaultRuntimeLogFiles(this.pidFile);
    this.stdoutFile = path.resolve(stdoutFile ?? logs.stdout);
    this.stderrFile = path.resolve(stderrFile ?? logs.stderr);
    this.nodeExecutable = nodeExecutable;
    this.spawnProcess = spawnProcess;
    this.fs = fsModule;
    this.createClient = createClient;
    this.now = now;
    this.sleep = sleep;
  }

  status() {
    const lock = new RuntimeLock(this.pidFile, { fsModule: this.fs }).status();
    return {
      running: Boolean(lock.locked),
      pidFile: this.pidFile,
      owner: lock.owner ?? null,
      logs: { stdout: this.stdoutFile, stderr: this.stderrFile }
    };
  }

  async start({ runtimeArgs = [], timeoutMs = 10000 } = {}) {
    const current = this.status();
    if (current.running) {
      throw new RuntimeDaemonError(`iDurazi Runtime is already running${current.owner?.pid ? ` (PID ${current.owner.pid})` : ''}`, {
        code: 'RUNTIME_ALREADY_RUNNING',
        details: current
      });
    }

    this.fs.mkdirSync(path.dirname(this.stdoutFile), { recursive: true });
    this.fs.mkdirSync(path.dirname(this.stderrFile), { recursive: true });
    const stdout = this.fs.openSync(this.stdoutFile, 'a');
    const stderr = this.fs.openSync(this.stderrFile, 'a');
    let child;
    try {
      child = this.spawnProcess(this.nodeExecutable, [this.cliEntry, 'runtime', 'start', '--foreground', ...runtimeArgs], {
        cwd: this.cwd,
        detached: true,
        windowsHide: true,
        stdio: ['ignore', stdout, stderr],
        env: { ...process.env, IDURAZI_RUNTIME_DAEMON: '1' }
      });
      child.unref?.();
    } finally {
      this.fs.closeSync(stdout);
      this.fs.closeSync(stderr);
    }

    const deadline = this.now() + timeoutMs;
    let lastError = null;
    while (this.now() < deadline) {
      if (child.exitCode !== null && child.exitCode !== undefined) {
        throw new RuntimeDaemonError(`Runtime daemon exited during startup with code ${child.exitCode}`, {
          code: 'RUNTIME_DAEMON_EXITED',
          details: { exitCode: child.exitCode, logs: this.status().logs }
        });
      }
      try {
        const client = this.createClient({ pidFile: this.pidFile, timeoutMs: Math.min(timeoutMs, 1000) });
        const ping = await client.ping();
        return { started: true, pid: child.pid ?? null, ping, ...this.status() };
      } catch (error) {
        lastError = error;
        await this.sleep(50);
      }
    }

    throw new RuntimeDaemonError(`Runtime daemon did not become ready within ${timeoutMs}ms`, {
      code: 'RUNTIME_DAEMON_START_TIMEOUT',
      details: { cause: lastError?.message ?? null, logs: this.status().logs }
    });
  }

  async stop({ timeoutMs = 10000 } = {}) {
    const client = this.createClient({ pidFile: this.pidFile, timeoutMs });
    return client.stop({ timeoutMs });
  }

  async restart({ runtimeArgs = [], timeoutMs = 10000 } = {}) {
    if (this.status().running) {
      await this.stop({ timeoutMs });
      const deadline = this.now() + timeoutMs;
      while (this.status().running && this.now() < deadline) await this.sleep(50);
      if (this.status().running) {
        throw new RuntimeDaemonError('Runtime did not stop before restart timeout', { code: 'RUNTIME_DAEMON_STOP_TIMEOUT' });
      }
    }
    return this.start({ runtimeArgs, timeoutMs });
  }

  logs({ lines = 100 } = {}) {
    return {
      stdoutFile: this.stdoutFile,
      stderrFile: this.stderrFile,
      stdout: readLastLines(this.stdoutFile, lines, this.fs),
      stderr: readLastLines(this.stderrFile, lines, this.fs)
    };
  }
}

function createDefaultRuntimeDaemon({ bootstrapOptions = {}, pidFile, cliEntry, cwd, stdoutFile, stderrFile, ...options } = {}) {
  const resolvedPidFile = pidFile ?? defaultRuntimePidFile(bootstrapOptions);
  return new RuntimeDaemonManager({
    cliEntry,
    pidFile: resolvedPidFile,
    cwd: cwd ?? bootstrapOptions.cwd,
    stdoutFile,
    stderrFile,
    ...options
  });
}

module.exports = {
  RuntimeDaemonManager,
  RuntimeDaemonError,
  defaultRuntimeLogFiles,
  readLastLines,
  createDefaultRuntimeDaemon
};
