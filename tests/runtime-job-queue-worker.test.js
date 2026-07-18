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
