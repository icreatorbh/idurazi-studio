const os = require('node:os');
const { JobRepository } = require('../database/repositories/JobRepository');
const { AuditEventRepository } = require('../database/repositories/AuditEventRepository');

class RuntimeHealthReport {
  constructor(database, {
    jobRepository,
    auditRepository,
    clock = () => new Date(),
    processInfo = process
  } = {}) {
    if (!database?.connection) throw new Error('RuntimeHealthReport requires an open RuntimeDatabase');
    this.database = database;
    this.jobRepository = jobRepository ?? new JobRepository(database, { clock });
    this.auditRepository = auditRepository ?? new AuditEventRepository(database, { clock });
    this.clock = clock;
    this.processInfo = processInfo;
  }

  capture() {
    const capturedAt = this.clock().toISOString();
    const database = this.#databaseHealth();
    const queue = this.jobRepository.metrics({ now: this.clock() });
    const audit = {
      totalEvents: this.auditRepository.count(),
      errorEvents: this.auditRepository.count({ severity: 'error' }),
      warningEvents: this.auditRepository.count({ severity: 'warn' })
    };

    const checks = {
      database: database.ok,
      migrations: database.pendingMigrations === 0,
      expiredLeases: queue.expiredLeases === 0
    };
    const status = Object.values(checks).every(Boolean) ? 'healthy' : 'degraded';

    return {
      status,
      capturedAt,
      checks,
      database,
      queue,
      audit,
      process: {
        pid: this.processInfo.pid,
        nodeVersion: this.processInfo.version,
        uptimeSeconds: Math.floor(this.processInfo.uptime()),
        memory: this.processInfo.memoryUsage()
      },
      host: {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname()
      }
    };
  }

  #databaseHealth() {
    try {
      const quickCheck = this.database.connection.prepare('PRAGMA quick_check').get();
      const applied = this.database.connection.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get();
      const latest = this.database.connection.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
      return {
        ok: quickCheck.quick_check === 'ok',
        quickCheck: quickCheck.quick_check,
        appliedMigrations: Number(applied.count),
        latestMigration: Number(latest.version ?? 0),
        pendingMigrations: 0,
        filename: this.database.filename
      };
    } catch (error) {
      return {
        ok: false,
        quickCheck: 'error',
        appliedMigrations: 0,
        latestMigration: 0,
        pendingMigrations: null,
        filename: this.database.filename,
        error: { name: error.name, message: error.message, code: error.code ?? null }
      };
    }
  }
}

module.exports = { RuntimeHealthReport };
