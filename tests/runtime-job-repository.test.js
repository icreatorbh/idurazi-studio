const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createRuntimeDatabase,
  JobRepository,
  JobStatus
} = require('../packages/runtime');

function withTempDatabase(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idurazi-runtime-'));
  const filename = path.join(dir, 'runtime.sqlite');
  try {
    return run(filename);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('job repository persists, reads, claims, and completes a job', () => {
  withTempDatabase((filename) => {
    const db = createRuntimeDatabase(filename);
    const repository = new JobRepository(db);
    const created = repository.create({
      type: 'interview.import',
      payload: { source: 'episode-001.mov' },
      priority: 10
    });

    assert.equal(created.status, JobStatus.QUEUED);
    assert.deepEqual(created.payload, { source: 'episode-001.mov' });
    assert.equal(repository.listPending().length, 1);

    const claimed = repository.claimNext('worker-1');
    assert.equal(claimed.status, JobStatus.RUNNING);
    assert.equal(claimed.attempts, 1);
    assert.equal(claimed.leaseOwner, 'worker-1');

    const completed = repository.complete(created.id);
    assert.equal(completed.status, JobStatus.COMPLETED);
    assert.ok(completed.completedAt);
    db.close();

    const reopened = createRuntimeDatabase(filename);
    const reopenedRepository = new JobRepository(reopened);
    assert.equal(reopenedRepository.findById(created.id).status, JobStatus.COMPLETED);
    assert.equal(reopenedRepository.delete(created.id), true);
    assert.equal(reopenedRepository.findById(created.id), null);
    reopened.close();
  });
});

test('failed jobs retry until max attempts and then become final', () => {
  const db = createRuntimeDatabase();
  const repository = new JobRepository(db);
  const job = repository.create({ type: 'transcription', maxAttempts: 2 });

  repository.claimNext('worker-1');
  const retrying = repository.fail(job.id, new Error('temporary failure'));
  assert.equal(retrying.status, JobStatus.QUEUED);

  repository.claimNext('worker-1');
  const failed = repository.fail(job.id, new Error('permanent failure'));
  assert.equal(failed.status, JobStatus.FAILED);
  assert.equal(failed.attempts, 2);
  assert.equal(failed.error.message, 'permanent failure');
  db.close();
});

test('expired running jobs are recovered after restart', () => {
  withTempDatabase((filename) => {
    let time = new Date('2026-07-19T00:00:00.000Z');
    const clock = () => new Date(time);
    const db = createRuntimeDatabase(filename);
    const repository = new JobRepository(db, { clock });
    const job = repository.create({ type: 'archive.index' });
    repository.claimNext('worker-crashed', { leaseMs: 1_000 });
    db.close();

    time = new Date('2026-07-19T00:00:02.000Z');
    const reopened = createRuntimeDatabase(filename);
    const recoveredRepository = new JobRepository(reopened, { clock });
    assert.equal(recoveredRepository.recoverExpired(), 1);
    const recovered = recoveredRepository.findById(job.id);
    assert.equal(recovered.status, JobStatus.QUEUED);
    assert.equal(recovered.leaseOwner, null);
    reopened.close();
  });
});
