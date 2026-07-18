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
    leaseExpiresAt: row.lease_expires_at,
    idempotencyKey: row.idempotency_key ?? null,
    deadLetteredAt: row.dead_lettered_at ?? null
  };
}

function mapDeadLetter(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    type: row.type,
    payload: deserialize(row.payload),
    error: row.error ? deserialize(row.error) : null,
    attempts: Number(row.attempts),
    reason: row.reason,
    createdAt: row.created_at,
    replayedAt: row.replayed_at,
    replayJobId: row.replay_job_id
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
    const dependencies = [...new Set(input.dependsOn ?? [])];
    const idempotencyKey = input.idempotencyKey ?? null;

    return this.database.transaction(() => {
      if (idempotencyKey) {
        const existing = this.findByIdempotencyKey(idempotencyKey);
        if (existing) return { ...existing, deduplicated: true };
      }

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
        updatedAt: now,
        idempotencyKey
      };

      for (const dependencyId of dependencies) {
        if (dependencyId === job.id) throw new Error('A job cannot depend on itself');
        if (!this.findById(dependencyId)) {
          const error = new Error(`Dependency job not found: ${dependencyId}`);
          error.code = 'JOB_DEPENDENCY_NOT_FOUND';
          throw error;
        }
      }

      this.db.prepare(`
        INSERT INTO jobs (
          id, type, status, payload, priority, attempts, max_attempts,
          available_at, created_at, updated_at, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        job.id, job.type, job.status, serialize(job.payload), job.priority,
        job.attempts, job.maxAttempts, job.availableAt, job.createdAt, job.updatedAt,
        job.idempotencyKey
      );

      const dependencyStatement = this.db.prepare(`
        INSERT INTO job_dependencies(job_id, depends_on_job_id, created_at)
        VALUES (?, ?, ?)
      `);
      for (const dependencyId of dependencies) {
        dependencyStatement.run(job.id, dependencyId, now);
      }
      return { ...this.findById(job.id), deduplicated: false };
    });
  }

  findById(id) {
    return mapRow(this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id));
  }

  findByIdempotencyKey(key) {
    if (!key) return null;
    return mapRow(this.db.prepare('SELECT * FROM jobs WHERE idempotency_key = ?').get(key));
  }

  dependenciesOf(id) {
    return this.db.prepare(`
      SELECT j.* FROM jobs j
      JOIN job_dependencies d ON d.depends_on_job_id = j.id
      WHERE d.job_id = ?
      ORDER BY d.created_at ASC
    `).all(id).map(mapRow);
  }

  listPending({ limit = 100, now = this.clock() } = {}) {
    return this.db.prepare(`
      SELECT j.* FROM jobs j
      WHERE j.status = ? AND j.available_at <= ?
        AND NOT EXISTS (
          SELECT 1 FROM job_dependencies d
          JOIN jobs parent ON parent.id = d.depends_on_job_id
          WHERE d.job_id = j.id AND parent.status <> ?
        )
      ORDER BY j.priority DESC, j.created_at ASC
      LIMIT ?
    `).all(JobStatus.QUEUED, now.toISOString(), JobStatus.COMPLETED, limit).map(mapRow);
  }

  claimNext(workerId, { leaseMs = 30_000 } = {}) {
    if (!workerId) throw new TypeError('workerId is required');
    const now = this.clock();
    const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
    const nowIso = now.toISOString();

    return this.database.transaction(() => {
      this.deadLetterBlockedDependencies({ now });
      const row = this.db.prepare(`
        SELECT j.* FROM jobs j
        WHERE j.status = ? AND j.available_at <= ?
          AND NOT EXISTS (
            SELECT 1 FROM job_dependencies d
            JOIN jobs parent ON parent.id = d.depends_on_job_id
            WHERE d.job_id = j.id AND parent.status <> ?
          )
        ORDER BY j.priority DESC, j.created_at ASC
        LIMIT 1
      `).get(JobStatus.QUEUED, nowIso, JobStatus.COMPLETED);
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
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) throw new RangeError('leaseMs must be a positive number');
    const now = this.clock();
    const result = this.db.prepare(`
      UPDATE jobs SET lease_expires_at = ?, updated_at = ?
      WHERE id = ? AND status = ? AND lease_owner = ?
    `).run(new Date(now.getTime() + leaseMs).toISOString(), now.toISOString(), id, JobStatus.RUNNING, workerId);
    if (Number(result.changes) !== 1) return null;
    return this.findById(id);
  }

  complete(id) {
    return this.#transition(id, JobStatus.COMPLETED, { completed: true });
  }

  fail(id, error, { retryDelayMs = 0, reason = 'attempts_exhausted' } = {}) {
    const job = this.findById(id);
    if (!job) return null;
    if (job.status !== JobStatus.RUNNING) throw new Error(`Cannot fail job ${id} from status ${job.status}`);

    const now = this.clock();
    const retry = job.attempts < job.maxAttempts;
    const status = retry ? JobStatus.QUEUED : JobStatus.FAILED;
    const normalizedError = {
      name: error?.name ?? 'Error',
      message: error?.message ?? String(error),
      code: error?.code ?? null
    };
    const nowIso = now.toISOString();

    this.database.transaction(() => {
      this.db.prepare(`
        UPDATE jobs
        SET status = ?, error = ?, available_at = ?, completed_at = ?,
            updated_at = ?, lease_owner = NULL, lease_expires_at = NULL,
            dead_lettered_at = ?
        WHERE id = ?
      `).run(
        status, serialize(normalizedError), new Date(now.getTime() + retryDelayMs).toISOString(),
        retry ? null : nowIso, nowIso, retry ? null : nowIso, id
      );
      if (!retry) this.#insertDeadLetter(this.findById(id), normalizedError, reason, nowIso);
    });
    return this.findById(id);
  }

  cancel(id) {
    return this.#transition(id, JobStatus.CANCELLED, { completed: true, allowQueued: true });
  }

  deadLetterBlockedDependencies({ now = this.clock() } = {}) {
    const blocked = this.db.prepare(`
      SELECT DISTINCT child.*
      FROM jobs child
      JOIN job_dependencies d ON d.job_id = child.id
      JOIN jobs parent ON parent.id = d.depends_on_job_id
      WHERE child.status = ? AND parent.status IN (?, ?)
    `).all(JobStatus.QUEUED, JobStatus.FAILED, JobStatus.CANCELLED).map(mapRow);
    if (blocked.length === 0) return 0;

    const nowIso = now.toISOString();
    for (const job of blocked) {
      const error = {
        name: 'JobDependencyError',
        message: 'A required dependency failed or was cancelled',
        code: 'JOB_DEPENDENCY_FAILED'
      };
      this.db.prepare(`
        UPDATE jobs SET status = ?, error = ?, completed_at = ?, updated_at = ?, dead_lettered_at = ?
        WHERE id = ? AND status = ?
      `).run(JobStatus.FAILED, serialize(error), nowIso, nowIso, nowIso, job.id, JobStatus.QUEUED);
      this.#insertDeadLetter(this.findById(job.id), error, 'dependency_failed', nowIso);
    }
    return blocked.length;
  }

  listDeadLetters({ limit = 100 } = {}) {
    return this.db.prepare(`SELECT * FROM dead_letters ORDER BY created_at DESC LIMIT ?`)
      .all(limit).map(mapDeadLetter);
  }

  getDeadLetter(id) {
    return mapDeadLetter(this.db.prepare('SELECT * FROM dead_letters WHERE id = ? OR job_id = ?').get(id, id));
  }

  replayDeadLetter(id, overrides = {}) {
    const letter = this.getDeadLetter(id);
    if (!letter) return null;
    if (letter.replayedAt) {
      const error = new Error(`Dead letter ${letter.id} was already replayed`);
      error.code = 'DEAD_LETTER_ALREADY_REPLAYED';
      throw error;
    }
    const replay = this.create({
      type: overrides.type ?? letter.type,
      payload: overrides.payload ?? letter.payload,
      priority: overrides.priority ?? 0,
      maxAttempts: overrides.maxAttempts ?? 3,
      availableAt: overrides.availableAt,
      idempotencyKey: overrides.idempotencyKey,
      dependsOn: overrides.dependsOn ?? []
    });
    const now = this.clock().toISOString();
    this.db.prepare(`UPDATE dead_letters SET replayed_at = ?, replay_job_id = ? WHERE id = ?`)
      .run(now, replay.id, letter.id);
    return replay;
  }

  recoverExpired({ now = this.clock() } = {}) {
    const nowIso = now.toISOString();
    const result = this.db.prepare(`
      UPDATE jobs SET status = ?, updated_at = ?, available_at = ?, lease_owner = NULL, lease_expires_at = NULL
      WHERE status = ? AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
    `).run(JobStatus.QUEUED, nowIso, nowIso, JobStatus.RUNNING, nowIso);
    return Number(result.changes);
  }

  metrics({ now = this.clock() } = {}) {
    const nowIso = now.toISOString();
    const rows = this.db.prepare('SELECT status, COUNT(*) AS count FROM jobs GROUP BY status').all();
    const counts = { queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 };
    for (const row of rows) counts[row.status] = Number(row.count);
    const ready = Number(this.db.prepare(`
      SELECT COUNT(*) AS count FROM jobs j WHERE j.status = ? AND j.available_at <= ?
      AND NOT EXISTS (
        SELECT 1 FROM job_dependencies d JOIN jobs parent ON parent.id = d.depends_on_job_id
        WHERE d.job_id = j.id AND parent.status <> ?
      )
    `).get(JobStatus.QUEUED, nowIso, JobStatus.COMPLETED).count);
    const blocked = Number(this.db.prepare(`
      SELECT COUNT(DISTINCT j.id) AS count FROM jobs j
      JOIN job_dependencies d ON d.job_id = j.id
      JOIN jobs parent ON parent.id = d.depends_on_job_id
      WHERE j.status = ? AND parent.status <> ?
    `).get(JobStatus.QUEUED, JobStatus.COMPLETED).count);
    const expiredLeases = Number(this.db.prepare(`
      SELECT COUNT(*) AS count FROM jobs WHERE status = ? AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
    `).get(JobStatus.RUNNING, nowIso).count);
    const oldestQueued = this.db.prepare(`SELECT created_at FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1`).get(JobStatus.QUEUED);
    const deadLetters = Number(this.db.prepare('SELECT COUNT(*) AS count FROM dead_letters').get().count);
    return {
      total: Object.values(counts).reduce((sum, value) => sum + value, 0), counts, ready,
      delayed: Math.max(0, counts.queued - ready - blocked), blocked, active: counts.running,
      expiredLeases, deadLetters, oldestQueuedAt: oldestQueued?.created_at ?? null, capturedAt: nowIso
    };
  }

  delete(id) {
    return Number(this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id).changes) === 1;
  }

  #insertDeadLetter(job, error, reason, createdAt) {
    this.db.prepare(`
      INSERT OR IGNORE INTO dead_letters(id, job_id, type, payload, error, attempts, reason, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), job.id, job.type, serialize(job.payload), serialize(error), job.attempts, reason, createdAt);
  }

  #transition(id, nextStatus, { completed = false, allowQueued = false } = {}) {
    const job = this.findById(id);
    if (!job) return null;
    if (FINAL_JOB_STATUSES.has(job.status)) throw new Error(`Job ${id} is already final (${job.status})`);
    if (!allowQueued && job.status !== JobStatus.RUNNING) throw new Error(`Cannot transition job ${id} from ${job.status} to ${nextStatus}`);
    const now = this.clock().toISOString();
    this.db.prepare(`
      UPDATE jobs SET status = ?, updated_at = ?, completed_at = ?, lease_owner = NULL, lease_expires_at = NULL
      WHERE id = ?
    `).run(nextStatus, now, completed ? now : null, id);
    return this.findById(id);
  }
}

module.exports = { JobRepository, mapRow, mapDeadLetter };
