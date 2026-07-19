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
const { SecretValue, REDACTED, redactSecrets } = require('./config/SecretValue');
const { DEFAULTS, ConfigurationError, loadRuntimeConfig, publicRuntimeConfig, validateRawConfig } = require('./config/RuntimeConfig');
const { StartupValidator, StartupValidationError, compareVersions } = require('./startup/StartupValidator');
const { bootstrapRuntime } = require('./startup/RuntimeBootstrap');
const { RuntimeService, RuntimeState } = require('./service/RuntimeService');
const { installShutdownHooks } = require('./service/ShutdownHooks');
const { RuntimeLock, RuntimeLockError, defaultProcessAlive, defaultRuntimePidFile } = require('./service/RuntimeLock');
const { RuntimeControlServer, RuntimeControlClient, RuntimeControlError, defaultRuntimeControlEndpoint } = require('./service/RuntimeControl');
const { RuntimeDaemonManager, RuntimeDaemonError, defaultRuntimeLogFiles, readLastLines, createDefaultRuntimeDaemon } = require('./service/RuntimeDaemon');

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
  SecretValue,
  REDACTED,
  redactSecrets,
  DEFAULTS,
  ConfigurationError,
  loadRuntimeConfig,
  publicRuntimeConfig,
  validateRawConfig,
  StartupValidator,
  StartupValidationError,
  compareVersions,
  bootstrapRuntime,
  RuntimeService,
  RuntimeState,
  installShutdownHooks,
  RuntimeLock,
  RuntimeLockError,
  defaultProcessAlive,
  defaultRuntimePidFile,
  RuntimeControlServer,
  RuntimeControlClient,
  RuntimeControlError,
  defaultRuntimeControlEndpoint,
  RuntimeDaemonManager,
  RuntimeDaemonError,
  defaultRuntimeLogFiles,
  readLastLines,
  createDefaultRuntimeDaemon,
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
