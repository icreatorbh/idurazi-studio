const fs = require('node:fs');
const path = require('node:path');
const { RuntimeDatabase } = require('../database/Database');

class StartupValidationError extends Error {
  constructor(report) {
    super(`Runtime startup validation failed: ${report.failures.map((failure) => failure.name).join(', ')}`);
    this.name = 'StartupValidationError';
    this.code = 'RUNTIME_STARTUP_INVALID';
    this.report = report;
  }
}

class StartupValidator {
  constructor({
    config,
    nodeVersion = process.versions.node,
    minimumNodeVersion = '22.5.0',
    fsImpl = fs,
    databaseFactory = (filename) => new RuntimeDatabase(filename),
    clock = () => new Date()
  } = {}) {
    if (!config) throw new TypeError('StartupValidator requires runtime config');
    this.config = config;
    this.nodeVersion = nodeVersion;
    this.minimumNodeVersion = minimumNodeVersion;
    this.fs = fsImpl;
    this.databaseFactory = databaseFactory;
    this.clock = clock;
  }

  validate({ throwOnFailure = true, checkDatabase = true } = {}) {
    const checks = [this.#nodeCheck(), this.#databaseDirectoryCheck()];
    if (checkDatabase) checks.push(this.#databaseCheck());
    const failures = checks.filter((check) => !check.ok);
    const report = {
      ok: failures.length === 0,
      checkedAt: this.clock().toISOString(),
      checks,
      failures
    };
    if (!report.ok && throwOnFailure) throw new StartupValidationError(report);
    return report;
  }

  #nodeCheck() {
    const ok = compareVersions(this.nodeVersion, this.minimumNodeVersion) >= 0;
    return {
      name: 'node-version',
      ok,
      actual: this.nodeVersion,
      required: `>=${this.minimumNodeVersion}`,
      message: ok ? 'Supported Node.js version' : `Node.js ${this.minimumNodeVersion} or newer is required`
    };
  }

  #databaseDirectoryCheck() {
    const filename = this.config.database.filename;
    if (filename === ':memory:') return { name: 'database-directory', ok: true, path: filename, message: 'In-memory database selected' };
    const directory = path.dirname(filename);
    try {
      this.fs.mkdirSync(directory, { recursive: true });
      this.fs.accessSync(directory, fs.constants.R_OK | fs.constants.W_OK);
      return { name: 'database-directory', ok: true, path: directory, message: 'Database directory is readable and writable' };
    } catch (error) {
      return { name: 'database-directory', ok: false, path: directory, message: error.message, code: error.code ?? null };
    }
  }

  #databaseCheck() {
    let database;
    try {
      database = this.databaseFactory(this.config.database.filename);
      database.open().migrate();
      const quickCheck = database.connection.prepare('PRAGMA quick_check').get().quick_check;
      const ok = quickCheck === 'ok';
      return { name: 'database', ok, quickCheck, message: ok ? 'Database opened and migrations applied' : `SQLite quick_check returned ${quickCheck}` };
    } catch (error) {
      return { name: 'database', ok: false, message: error.message, code: error.code ?? null };
    } finally {
      try { database?.close(); } catch {}
    }
  }
}

function compareVersions(actual, required) {
  const a = parseVersion(actual);
  const b = parseVersion(required);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] > b[index]) return 1;
    if (a[index] < b[index]) return -1;
  }
  return 0;
}

function parseVersion(value) {
  const match = String(value).replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return match.slice(1).map(Number);
}

module.exports = { StartupValidator, StartupValidationError, compareVersions };
