const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadRuntimeConfig } = require('../config/RuntimeConfig');

class RuntimeLockError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RuntimeLockError';
    this.code = 'RUNTIME_ALREADY_RUNNING';
    this.details = details;
  }
}

class RuntimeLock {
  constructor(filename, {
    pid = process.pid,
    now = () => new Date(),
    processAlive = defaultProcessAlive,
    fsModule = fs
  } = {}) {
    if (!filename || typeof filename !== 'string') throw new TypeError('RuntimeLock requires a filename');
    this.filename = path.resolve(filename);
    this.pid = pid;
    this.now = now;
    this.processAlive = processAlive;
    this.fs = fsModule;
    this.token = null;
    this.metadata = null;
  }

  acquire(extra = {}) {
    if (this.token) return this.status();
    this.fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    this.#clearStaleLock();

    const token = crypto.randomUUID();
    const metadata = {
      pid: this.pid,
      token,
      startedAt: this.now().toISOString(),
      ...extra
    };

    let descriptor;
    try {
      descriptor = this.fs.openSync(this.filename, 'wx', 0o600);
      this.fs.writeFileSync(descriptor, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
      this.fs.fsyncSync(descriptor);
    } catch (error) {
      if (error.code === 'EEXIST') {
        const owner = this.read();
        throw new RuntimeLockError(`iDurazi Runtime is already running${owner?.pid ? ` (PID ${owner.pid})` : ''}`, {
          filename: this.filename,
          owner
        });
      }
      throw error;
    } finally {
      if (descriptor !== undefined) this.fs.closeSync(descriptor);
    }

    this.token = token;
    this.metadata = metadata;
    return this.status();
  }

  release() {
    if (!this.token) return false;
    const current = this.read();
    if (current?.token !== this.token) {
      this.token = null;
      this.metadata = null;
      return false;
    }
    try { this.fs.unlinkSync(this.filename); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    this.token = null;
    this.metadata = null;
    return true;
  }

  read() {
    try {
      const value = JSON.parse(this.fs.readFileSync(this.filename, 'utf8'));
      return value && typeof value === 'object' ? value : null;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      return null;
    }
  }

  status() {
    const owner = this.token ? this.metadata : this.read();
    return {
      filename: this.filename,
      acquired: Boolean(this.token),
      locked: Boolean(owner),
      owner
    };
  }

  #clearStaleLock() {
    const owner = this.read();
    if (!owner) {
      if (this.fs.existsSync(this.filename)) this.fs.unlinkSync(this.filename);
      return;
    }
    if (Number.isInteger(owner.pid) && this.processAlive(owner.pid)) return;
    try { this.fs.unlinkSync(this.filename); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function defaultProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function defaultRuntimePidFile(bootstrapOptions = {}) {
  const config = bootstrapOptions.config ?? loadRuntimeConfig(bootstrapOptions);
  if (config.database.filename === ':memory:') return path.resolve(bootstrapOptions.cwd ?? process.cwd(), '.idurazi-runtime.pid');
  return `${config.database.filename}.pid`;
}

module.exports = { RuntimeLock, RuntimeLockError, defaultProcessAlive, defaultRuntimePidFile };
