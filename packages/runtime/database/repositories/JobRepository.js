const crypto = require('node:crypto');
const { JobStatus, FINAL_JOB_STATUSES } = require('../types');

function serialize(value) {
  return JSON.stringify(value ?? {});
}

function deserialize(value) {
  if (value == null || value === '') return {};
  return JSON.parse(value);
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    payload: deserialize(row.payload),
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    availableAt: row.available_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    error: row.error ? deserialize(row.error) : null,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at
  };
}

class JobRepository {
  constructor(database, { clock = () => new Date() } = {}) {
    if (!database?.connection) throw new Error('JobRepository requires an open RuntimeDatabase');
    this.database = database;
    this.db = database.connection;
    this.clock = clock;
  }

  create(input) {
    if (!input?.type) throw new TypeError('Job type is required');
    const now = this.clock().toISOString();
    const job = {
      id: input.id ?? crypto.randomUUID(),
      type: input.type,
      status: JobStatus.QUEUED,
      payload: input.payload ?? {},
      priority: input.priority ?? 0,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? 3,
      availableAt: input.availableAt ? new Date(input.availableAt).toISOString() : now,
      createdAt: now,
      updatedAt: now
    };

    this.db.prepare(`
      INSERT INTO jobs (
        id, type, status, payload, priority, attempts, max_attempts,
        available_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      job.id, job.type, job.status, serialize(job.payload), job.priority,
      job.attempts, job.maxAttempts, job.availableAt, job.createdAt, job.updatedAt
    );
    return this.findById(job.id);
  }

  findById(id) {
    return mapRow(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
  }

  listPending({ limit = 100, now = this.clock() } = {}) {
    return this.db.prepare(`
      SELECT * FROM jobs
      WHERE status = ? AND available_at <= ?
      ORDER BY priority DESC, created_at ASC
      LIMIT ?
    `).all(JobStatus.QUEUED, now.toISOString(), limit).map(mapRow);
  }

  claimNext(workerId, { leaseMs = 30_000 } = {}) {
    if (!workerId) throw new TypeError('workerId is required');
    const now = this.clock();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const nowIso = now.toISOString();

    return this.database.transaction(() => {
      const row = this.db.prepare(`
        SELECT * FROM jobs
        WHERE status = ? AND available_at <= ?
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `).get(JobStatus.QUEUED, nowIso);
      if (!row) return null;

      const result = this.db.prepare(`
        UPDATE jobs
        SET status = ?, attempts = attempts + 1, started_at = COALESCE(started_at, ?),
            updated_at = ?, lease_owner = ?, lease_expires_at = ?
        WHERE id = ? AND status = ?
      `).run(
        JobStatus.RUNNING, nowIso, nowIso, workerId, leaseExpiresAt,
        row.id, JobStatus.QUEUED
      );
      if (Number(result.changes) !== 1) return null;
      return this.findById(row.id);
    });
  }

  renewLease(id, workerId, { leaseMs = 30_000 } = {}) {
    if (!workerId) throw new TypeError('workerId is required');
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw new RangeError('leaseMs must be a positive number');
    }

    const now = this.clock();
    const nowIso = now.toISOString();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const result = this.db.prepare(`
      UPDATE jobs
      SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = ? AND lease_owner = ?
    `).run(leaseExpiresAt, nowIso, id, JobStatus.RUNNING, workerId);

    if (Number(result.changes) !== 1) return null;
    return this.findById(id);
  }

  complete(id) {
    return this.#transition(id, JobStatus.COMPLETED, { completed: true });
  }

  fail(id, error, { retryDelayMs = 0 } = {}) {
    const job = this.findById(id);
    if (!job) return null;
    if (job.status !== JobStatus.RUNNING) {
      throw new Error(`Cannot fail job ${id} from status ${job.status}`);
    }

    const now = this.clock();
    const retry = job.attempts < job.maxAttempts;
    const status = retry ? JobStatus.QUEUED : JobStatus.FAILED;
    const availableAt = new Date(now.getTime() + retryDelayMs).toISOString();
    const completedAt = retry ? null : now.toISOString();
    const normalizedError = {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      code: error?.code ?? null
    };

    this.db.prepare(`
      UPDATE jobs
      SET status = ?, error = ?, available_at = ?, completed_at = ?,
          updated_at = ?, lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ?
    `).run(
      status, serialize(normalizedError), availableAt, completedAt,
      now.toISOString(), id
    );
    return this.findById(id);
  }

  cancel(id) {
    return this.#transition(id, JobStatus.CANCELLED, { completed: true, allowQueued: true });
  }

  recoverExpired({ now = this.clock() } = {}) {
    const nowIso = now.toISOString();
    const result = this.db.prepare(`
      UPDATE jobs
      SET status = ?, updated_at = ?, available_at = ?,
          lease_owner = NULL, lease_expires_at = NULL
      WHERE status = ? AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
    `).run(JobStatus.QUEUED, nowIso, nowIso, JobStatus.RUNNING, nowIso);
    return Number(result.changes);
  }

  delete(id) {
    return Number(this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id).changes) === 1;
  }

  #transition(id, nextStatus, { completed = false, allowQueued = false } = {}) {
    const job = this.findById(id);
    if (!job) return null;
    if (FINAL_JOB_STATUSES.has(job.status)) {
      throw new Error(`Job ${id} is already final (${job.status})`);
    }
    if (!allowQueued && job.status !== JobStatus.RUNNING) {
      throw new Error(`Cannot transition job ${id} from ${job.status} to ${nextStatus}`);
    }
    const now = this.clock().toISOString();
    this.db.prepare(`
      UPDATE jobs
      SET status = ?, updated_at = ?, completed_at = ?,
          lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ?
    `).run(nextStatus, now, completed ? now : null, id);
    return this.findById(id);
  }
}

module.exports = { JobRepository, mapRow };
