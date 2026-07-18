const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntimeDatabase, JobQueue, Worker, JobStatus } = require('../packages/runtime');

test('JobQueue enqueues and Worker completes a registered job', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const calls = [];
  const worker = new Worker(database, {
    id: 'worker-1',
    handlers: {
      transcribe: async (payload, context) => {
        calls.push({ payload, context });
        return { ok: true };
      }
    }
  });

  const created = queue.enqueue('transcribe', { interviewId: 'INT-001' });
  const result = await worker.runOne();

  assert.equal(result.status, JobStatus.COMPLETED);
  assert.equal(result.attempts, 1);
  assert.deepEqual(calls[0].payload, { interviewId: 'INT-001' });
  assert.equal(calls[0].context.workerId, 'worker-1');
  database.close();
});

test('Worker retries failures and eventually completes', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  let attempts = 0;
  const worker = new Worker(database, {
    id: 'worker-retry',
    retryDelayMs: 0,
    handlers: {
      extract: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('temporary failure');
      }
    }
  });

  const job = queue.enqueue('extract', {}, { maxAttempts: 2 });
  const first = await worker.runOne();
  assert.equal(first.status, JobStatus.QUEUED);
  assert.equal(first.attempts, 1);
  assert.equal(first.error.message, 'temporary failure');

  const second = await worker.runOne();
  assert.equal(second.status, JobStatus.COMPLETED);
  assert.equal(second.attempts, 2);
  assert.equal(queue.get(job.id).status, JobStatus.COMPLETED);
  database.close();
});

test('Worker marks a job failed when no handler exists and attempts are exhausted', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const worker = new Worker(database, { id: 'worker-no-handler', retryDelayMs: 0 });

  queue.enqueue('unknown', {}, { maxAttempts: 1 });
  const result = await worker.runOne();

  assert.equal(result.status, JobStatus.FAILED);
  assert.equal(result.error.code, 'JOB_HANDLER_NOT_FOUND');
  database.close();
});

test('Worker start loop processes queued work and stops cleanly', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const worker = new Worker(database, {
    pollIntervalMs: 5,
    handlers: { ping: async () => undefined }
  });
  const job = queue.enqueue('ping');

  const completed = new Promise((resolve) => worker.once('completed', resolve));
  worker.start();
  await completed;
  await worker.stop();

  assert.equal(queue.get(job.id).status, JobStatus.COMPLETED);
  database.close();
});

test('Worker heartbeats renew a long-running job lease', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const worker = new Worker(database, {
    id: 'worker-heartbeat',
    leaseMs: 80,
    heartbeatIntervalMs: 20,
    handlers: { long: async () => gate }
  });

  const job = queue.enqueue('long');
  const running = worker.runOne();
  await new Promise((resolve) => setTimeout(resolve, 130));

  assert.equal(queue.recoverExpired(), 0);
  assert.equal(queue.get(job.id).status, JobStatus.RUNNING);
  assert.equal(queue.get(job.id).leaseOwner, 'worker-heartbeat');

  release();
  await running;
  assert.equal(queue.get(job.id).status, JobStatus.COMPLETED);
  database.close();
});

test('manual heartbeat is available to a handler context', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  let renewed;
  const worker = new Worker(database, {
    id: 'worker-manual-heartbeat',
    leaseMs: 1_000,
    heartbeatIntervalMs: 250,
    handlers: {
      manual: async (_payload, context) => {
        renewed = context.heartbeat();
      }
    }
  });

  queue.enqueue('manual');
  await worker.runOne();
  assert.equal(renewed.leaseOwner, 'worker-manual-heartbeat');
  database.close();
});

test('Worker stop waits for the active job to finish gracefully', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const worker = new Worker(database, {
    pollIntervalMs: 5,
    leaseMs: 200,
    heartbeatIntervalMs: 50,
    handlers: { slow: async () => gate }
  });
  const job = queue.enqueue('slow');

  const started = new Promise((resolve) => worker.once('started', resolve));
  worker.start();
  await started;
  const stopping = worker.stop({ timeoutMs: 1_000 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(queue.get(job.id).status, JobStatus.RUNNING);

  release();
  const result = await stopping;
  assert.equal(result.graceful, true);
  assert.equal(queue.get(job.id).status, JobStatus.COMPLETED);
  database.close();
});

test('Worker can abort a cooperative handler after shutdown timeout', async () => {
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const worker = new Worker(database, {
    pollIntervalMs: 5,
    leaseMs: 200,
    heartbeatIntervalMs: 50,
    retryDelayMs: 0,
    handlers: {
      cooperative: async (_payload, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      })
    }
  });
  const job = queue.enqueue('cooperative', {}, { maxAttempts: 1 });

  const started = new Promise((resolve) => worker.once('started', resolve));
  worker.start();
  await started;
  const result = await worker.stop({ timeoutMs: 20, abortOnTimeout: true });
  assert.equal(result.graceful, false);

  await worker.loopPromise;
  assert.equal(queue.get(job.id).status, JobStatus.FAILED);
  assert.equal(queue.get(job.id).error.code, 'WORKER_SHUTDOWN_TIMEOUT');
  database.close();
});

test('WorkerPool processes jobs concurrently without duplicate claims', async () => {
  const { WorkerPool } = require('../packages/runtime');
  const database = createRuntimeDatabase();
  const queue = new JobQueue(database);
  const active = new Set();
  let peakConcurrency = 0;
  const processed = [];

  const pool = new WorkerPool(database, {
    id: 'pool-concurrency',
    concurrency: 3,
    workerOptions: { pollIntervalMs: 5, leaseMs: 500, heartbeatIntervalMs: 100 },
    handlers: {
      parallel: async (payload, { job }) => {
        active.add(job.id);
        peakConcurrency = Math.max(peakConcurrency, active.size);
        await new Promise((resolve) => setTimeout(resolve, 35));
        processed.push(payload.index);
        active.delete(job.id);
      }
    }
  });

  const jobs = Array.from({ length: 6 }, (_, index) => queue.enqueue('parallel', { index }));
  const finished = new Promise((resolve) => {
    let count = 0;
    pool.on('completed', () => {
      count += 1;
      if (count === jobs.length) resolve();
    });
  });

  pool.start();
  await finished;
  const stopped = await pool.stop();

  assert.equal(stopped.graceful, true);
  assert.equal(peakConcurrency, 3);
  assert.deepEqual(processed.toSorted((a, b) => a - b), [0, 1, 2, 3, 4, 5]);
  assert.equal(new Set(processed).size, jobs.length);
  for (const job of jobs) assert.equal(queue.get(job.id).status, JobStatus.COMPLETED);
  database.close();
});

test('WorkerPool validates concurrency and shares late handler registrations', async () => {
  const { WorkerPool } = require('../packages/runtime');
  const database = createRuntimeDatabase();
  assert.throws(() => new WorkerPool(database, { concurrency: 0 }), /positive integer/);

  const queue = new JobQueue(database);
  const pool = new WorkerPool(database, { concurrency: 2 });
  let calls = 0;
  pool.register('late', async () => { calls += 1; });
  queue.enqueue('late');
  queue.enqueue('late');
  await pool.runOneBatch();

  assert.equal(calls, 2);
  database.close();
});

test('Queue metrics report status, readiness, delayed work, and expired leases', () => {
  const database = createRuntimeDatabase();
  let current = new Date('2026-07-19T00:00:00.000Z');
  const clock = () => new Date(current);
  const repository = new (require('../packages/runtime').JobRepository)(database, { clock });
  const queue = new JobQueue(database, { repository });

  const ready = queue.enqueue('ready');
  queue.enqueue('delayed', {}, { availableAt: '2026-07-19T01:00:00.000Z' });
  const running = repository.claimNext('metrics-worker', { leaseMs: 1_000 });
  assert.equal(running.id, ready.id);
  queue.enqueue('completed');
  const completed = repository.claimNext('metrics-worker-2', { leaseMs: 1_000 });
  repository.complete(completed.id);
  queue.enqueue('failed', {}, { maxAttempts: 1 });
  const failed = repository.claimNext('metrics-worker-3', { leaseMs: 1_000 });
  repository.fail(failed.id, new Error('final'));
  const cancelled = queue.enqueue('cancelled');
  queue.cancel(cancelled.id);

  current = new Date('2026-07-19T00:00:02.000Z');
  const metrics = queue.metrics();
  assert.equal(metrics.total, 5);
  assert.deepEqual(metrics.counts, {
    queued: 1,
    running: 1,
    completed: 1,
    failed: 1,
    cancelled: 1
  });
  assert.equal(metrics.ready, 0);
  assert.equal(metrics.delayed, 1);
  assert.equal(metrics.active, 1);
  assert.equal(metrics.expiredLeases, 1);
  assert.equal(metrics.oldestQueuedAt, '2026-07-19T00:00:00.000Z');
  database.close();
});
