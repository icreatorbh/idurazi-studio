const { loadRuntimeConfig, publicRuntimeConfig } = require('../config/RuntimeConfig');
const { StartupValidator } = require('./StartupValidator');
const { RuntimeDatabase } = require('../database/Database');
const { JobQueue } = require('../queue/JobQueue');
const { WorkerPool } = require('../queue/WorkerPool');
const { StructuredLogger } = require('../observability/StructuredLogger');
const { AuditEventRepository } = require('../database/repositories/AuditEventRepository');
const { RuntimeAuditBridge } = require('../observability/RuntimeAuditBridge');
const { RuntimeHealthReport } = require('../health/RuntimeHealthReport');

function bootstrapRuntime(options = {}) {
  const config = options.config ?? loadRuntimeConfig(options);
  const validator = options.validator ?? new StartupValidator({ config });
  const validation = validator.validate();
  const database = new RuntimeDatabase(config.database.filename).open().migrate();
  const logger = options.logger ?? new StructuredLogger({ name: 'idurazi-runtime', level: config.logging.level });
  const queue = new JobQueue(database);
  const pool = new WorkerPool(database, {
    concurrency: config.queue.concurrency,
    workerOptions: {
      pollIntervalMs: config.queue.pollIntervalMs,
      leaseMs: config.queue.leaseMs,
      heartbeatIntervalMs: config.queue.heartbeatIntervalMs
    }
  });
  const auditRepository = new AuditEventRepository(database);
  const auditBridge = new RuntimeAuditBridge({ auditRepository, logger });
  auditBridge.attach(queue, { actorType: 'queue', actorId: 'primary' });
  auditBridge.attach(pool, { actorType: 'worker-pool', actorId: 'primary' });
  const health = new RuntimeHealthReport(database, { auditRepository });

  let closed = false;
  async function close({ timeoutMs = config.shutdown.timeoutMs } = {}) {
    if (closed) return;
    closed = true;
    await pool.stop({ timeoutMs });
    auditBridge.detachAll();
    database.close();
  }

  logger.info('runtime bootstrapped', { config: publicRuntimeConfig(config), validation });
  return { config, validation, database, logger, queue, pool, auditRepository, auditBridge, health, close };
}

module.exports = { bootstrapRuntime };
