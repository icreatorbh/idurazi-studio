const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createRuntimeDatabase,
  JobQueue,
  Worker,
  AuditEventRepository,
  RuntimeAuditBridge,
  RuntimeHealthReport,
  StructuredLogger,
  MemoryLogSink
} = require('../packages/runtime');

test('StructuredLogger emits newline-delimited JSON and respects levels', () => {
  const sink = new MemoryLogSink();
  const logger = new StructuredLogger({
    name: 'test-runtime',
    level: 'info',
    sink,
    clock: () => new Date('2026-07-19T01:00:00.000Z'),
    base: { service: 'worker' }
  });

  assert.equal(logger.debug('hidden'), null);
  logger.info('job accepted', { jobId: 'job-1' });
  logger.error('job failed', { error: Object.assign(new Error('boom'), { code: 'BOOM' }) });

  const entries = sink.entries();
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], {
    timestamp: '2026-07-19T01:00:00.000Z',
    level: 'info',
    logger: 'test-runtime',
    message: 'job accepted',
    service: 'worker',
    jobId: 'job-1'
  });
  assert.equal(entries[1].error.code, 'BOOM');
  assert.equal(entries[1].error.message, 'boom');
});

test('AuditEventRepository persists and filters audit events', () => {
  const database = createRuntimeDatabase();
  const audit = new AuditEventRepository(database, {
    clock: () => new Date('2026-07-19T02:00:00.000Z')
  });

  const first = audit.record({
    category: 'runtime',
    action: 'started',
    actorType: 'worker',
    actorId: 'worker-1',
    subjectType: 'job',
    subjectId: 'job-1',
    correlationId: 'job-1',
    metadata: { attempt: 1 }
  });
  audit.record({ category: 'runtime', action: 'failed', severity: 'error' });

  assert.equal(audit.findById(first.id).metadata.attempt, 1);
  assert.equal(audit.list({ subjectId: 'job-1' }).length, 1);
  assert.equal(audit.count({ severity: 'error' }), 1);
  database.close();
});

test('RuntimeAuditBridge records queue and worker lifecycle events', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const worker = new Worker(database, {
    id: 'audit-worker',
    handlers: { index: async () => undefined }
  });
  const audit = new AuditEventRepository(database);
  const bridge = new RuntimeAuditBridge({ auditRepository: audit });
  bridge.attach(queue, { actorType: 'queue', actorId: 'primary' });
  bridge.attach(worker, { actorType: 'worker', actorId: worker.id });

  const job = queue.enqueue('index', { privateText: 'not included in audit metadata' });
  await worker.runOne();

  const events = audit.list({ correlationId: job.id, limit: 20 });
  assert.deepEqual(events.map((event) => event.action).toSorted(), ['completed', 'enqueued', 'started']);
  const enqueued = events.find((event) => event.action === 'enqueued');
  assert.equal(JSON.stringify(enqueued.metadata).includes('privateText'), false);
  bridge.detachAll();
  database.close();
});

test('RuntimeHealthReport summarizes database, queue, audit, and process health', () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const audit = new AuditEventRepository(database);
  queue.enqueue('ready');
  audit.record({ category: 'runtime', action: 'booted' });

  const fakeProcess = {
    pid: 42,
    version: 'v22.5.0',
    uptime: () => 15.9,
    memoryUsage: () => ({ rss: 100, heapTotal: 80, heapUsed: 40, external: 2, arrayBuffers: 1 })
  };
  const report = new RuntimeHealthReport(database, {
    auditRepository: audit,
    clock: () => new Date('2026-07-19T03:00:00.000Z'),
    processInfo: fakeProcess
  }).capture();

  assert.equal(report.status, 'healthy');
  assert.equal(report.database.quickCheck, 'ok');
  assert.equal(report.database.latestMigration, 3);
  assert.equal(report.queue.counts.queued, 1);
  assert.equal(report.audit.totalEvents, 1);
  assert.equal(report.process.pid, 42);
  assert.equal(report.process.uptimeSeconds, 15);
  database.close();
});

test('RuntimeHealthReport becomes degraded when an expired lease exists', () => {
  let current = new Date('2026-07-19T04:00:00.000Z');
  const clock = () => new Date(current);
  const database = createRuntimeDatabase();
  const { JobRepository } = require('../packages/runtime');
  const repository = new JobRepository(database, { clock });
  repository.create({ type: 'stuck' });
  repository.claimNext('crashed-worker', { leaseMs: 100 });
  current = new Date('2026-07-19T04:00:01.000Z');

  const report = new RuntimeHealthReport(database, { jobRepository: repository, clock }).capture();
  assert.equal(report.status, 'degraded');
  assert.equal(report.checks.expiredLeases, false);
  assert.equal(report.queue.expiredLeases, 1);
  database.close();
});
