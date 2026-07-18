const { RuntimeDatabase } = require('./database/Database');
const { JobRepository } = require('./database/repositories/JobRepository');
const { AuditEventRepository } = require('./database/repositories/AuditEventRepository');
const { JobStatus, FINAL_JOB_STATUSES } = require('./database/types');
const { JobQueue } = require('./queue/JobQueue');
const { Worker } = require('./queue/Worker');
const { WorkerPool } = require('./queue/WorkerPool');
const { StructuredLogger, MemoryLogSink, LEVELS, normalizeError } = require('./observability/StructuredLogger');
const { RuntimeAuditBridge, DEFAULT_EVENTS, severityFor } = require('./observability/RuntimeAuditBridge');
const { RuntimeHealthReport } = require('./health/RuntimeHealthReport');

function createRuntimeDatabase(filename = ':memory:') {
  return new RuntimeDatabase(filename).open().migrate();
}

module.exports = {
  RuntimeDatabase,
  JobRepository,
  AuditEventRepository,
  JobQueue,
  Worker,
  WorkerPool,
  RuntimeAuditBridge,
  RuntimeHealthReport,
  StructuredLogger,
  MemoryLogSink,
  LEVELS,
  DEFAULT_EVENTS,
  severityFor,
  normalizeError,
  JobStatus,
  FINAL_JOB_STATUSES,
  createRuntimeDatabase
};
