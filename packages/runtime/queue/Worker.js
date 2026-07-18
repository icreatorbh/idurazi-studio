const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const { JobRepository } = require('../database/repositories/JobRepository');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs)) return promise.then(() => true);
  return Promise.race([
    promise.then(() => true),
    sleep(Math.max(0, timeoutMs)).then(() => false)
  ]);
}

class Worker extends EventEmitter {
  constructor(database, {
    id = `worker-${crypto.randomUUID()}`,
    handlers = {},
    repository,
    pollIntervalMs = 250,
    leaseMs = 30_000,
    heartbeatIntervalMs = Math.max(10, Math.floor(leaseMs / 3)),
    retryDelayMs = 1_000,
    recoverOnStart = true
  } = {}) {
    super();
    if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
      throw new RangeError('leaseMs must be a positive number');
    }
    if (!Number.isFinite(heartbeatIntervalMs) || heartbeatIntervalMs <= 0) {
      throw new RangeError('heartbeatIntervalMs must be a positive number');
    }
    if (heartbeatIntervalMs >= leaseMs) {
      throw new RangeError('heartbeatIntervalMs must be shorter than leaseMs');
    }

    this.id = id;
    this.handlers = new Map(Object.entries(handlers));
    this.repository = repository ?? new JobRepository(database);
    this.pollIntervalMs = pollIntervalMs;
    this.leaseMs = leaseMs;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
    this.retryDelayMs = retryDelayMs;
    this.recoverOnStart = recoverOnStart;
    this.running = false;
    this.loopPromise = null;
    this.activeJob = null;
    this.activeController = null;
  }

  register(type, handler) {
    if (!type || typeof handler !== 'function') {
      throw new TypeError('register(type, handler) requires a job type and function');
    }
    this.handlers.set(type, handler);
    return this;
  }

  unregister(type) {
    return this.handlers.delete(type);
  }

  heartbeat(jobId = this.activeJob?.id) {
    if (!jobId) return null;
    const renewed = this.repository.renewLease(jobId, this.id, { leaseMs: this.leaseMs });
    if (renewed) this.emit('heartbeat', renewed);
    else this.emit('heartbeatLost', { jobId, workerId: this.id });
    return renewed;
  }

  async runOne() {
    if (this.activeJob) {
      throw new Error(`Worker ${this.id} is already processing job ${this.activeJob.id}`);
    }

    const job = this.repository.claimNext(this.id, { leaseMs: this.leaseMs });
    if (!job) return null;

    this.activeJob = job;
    this.activeController = new AbortController();
    this.emit('started', job);

    let heartbeatTimer = null;
    const startHeartbeat = () => {
      heartbeatTimer = setInterval(() => {
        try {
          this.heartbeat(job.id);
        } catch (error) {
          this.emit('heartbeatError', error, job);
        }
      }, this.heartbeatIntervalMs);
      heartbeatTimer.unref?.();
    };

    try {
      const handler = this.handlers.get(job.type);
      if (!handler) {
        const error = new Error(`No handler registered for job type: ${job.type}`);
        error.code = 'JOB_HANDLER_NOT_FOUND';
        const failed = this.repository.fail(job.id, error, { retryDelayMs: this.retryDelayMs });
        this.emit(failed.status === 'failed' ? 'failed' : 'retrying', failed, error);
        return failed;
      }

      startHeartbeat();
      const result = await handler(job.payload, {
        job,
        workerId: this.id,
        attempt: job.attempts,
        signal: this.activeController.signal,
        heartbeat: () => this.heartbeat(job.id)
      });
      const completed = this.repository.complete(job.id);
      this.emit('completed', completed, result);
      return completed;
    } catch (error) {
      const current = this.repository.findById(job.id);
      if (!current || current.status !== 'running' || current.leaseOwner !== this.id) {
        this.emit('ownershipLost', { job, current, error });
        return current;
      }
      const failed = this.repository.fail(job.id, error, { retryDelayMs: this.retryDelayMs });
      this.emit(failed.status === 'failed' ? 'failed' : 'retrying', failed, error);
      return failed;
    } finally {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      this.activeJob = null;
      this.activeController = null;
    }
  }

  start() {
    if (this.running) return this.loopPromise;
    this.running = true;
    if (this.recoverOnStart) {
      const count = this.repository.recoverExpired();
      if (count > 0) this.emit('recovered', { count });
    }
    this.loopPromise = this.#loop();
    return this.loopPromise;
  }

  async stop({ timeoutMs = Infinity, abortOnTimeout = false } = {}) {
    this.running = false;
    const loop = this.loopPromise ?? Promise.resolve();
    const graceful = await waitFor(loop, timeoutMs);

    if (!graceful && abortOnTimeout && this.activeController) {
      const error = new Error(`Worker ${this.id} shutdown timed out`);
      error.code = 'WORKER_SHUTDOWN_TIMEOUT';
      this.activeController.abort(error);
      this.emit('aborting', { job: this.activeJob, error });
    }

    if (graceful) this.loopPromise = null;
    this.emit('stopped', { graceful, activeJob: this.activeJob });
    return { graceful, activeJob: this.activeJob };
  }

  async #loop() {
    while (this.running) {
      const processed = await this.runOne();
      if (!processed && this.running) await sleep(this.pollIntervalMs);
    }
  }
}

module.exports = { Worker };
