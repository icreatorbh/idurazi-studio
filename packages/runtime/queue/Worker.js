const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const { JobRepository } = require('../database/repositories/JobRepository');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Worker extends EventEmitter {
  constructor(database, {
    id = `worker-${crypto.randomUUID()}`,
    handlers = {},
    repository,
    pollIntervalMs = 250,
    leaseMs = 30_000,
    retryDelayMs = 1_000,
    recoverOnStart = true
  } = {}) {
    super();
    this.id = id;
    this.handlers = new Map(Object.entries(handlers));
    this.repository = repository ?? new JobRepository(database);
    this.pollIntervalMs = pollIntervalMs;
    this.leaseMs = leaseMs;
    this.retryDelayMs = retryDelayMs;
    this.recoverOnStart = recoverOnStart;
    this.running = false;
    this.loopPromise = null;
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

  async runOne() {
    const job = this.repository.claimNext(this.id, { leaseMs: this.leaseMs });
    if (!job) return null;

    this.emit('started', job);
    const handler = this.handlers.get(job.type);
    if (!handler) {
      const error = new Error(`No handler registered for job type: ${job.type}`);
      error.code = 'JOB_HANDLER_NOT_FOUND';
      const failed = this.repository.fail(job.id, error, { retryDelayMs: this.retryDelayMs });
      this.emit(failed.status === 'failed' ? 'failed' : 'retrying', failed, error);
      return failed;
    }

    try {
      const result = await handler(job.payload, {
        job,
        workerId: this.id,
        attempt: job.attempts
      });
      const completed = this.repository.complete(job.id);
      this.emit('completed', completed, result);
      return completed;
    } catch (error) {
      const failed = this.repository.fail(job.id, error, { retryDelayMs: this.retryDelayMs });
      this.emit(failed.status === 'failed' ? 'failed' : 'retrying', failed, error);
      return failed;
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

  async stop() {
    this.running = false;
    await this.loopPromise;
    this.loopPromise = null;
  }

  async #loop() {
    while (this.running) {
      const processed = await this.runOne();
      if (!processed && this.running) await sleep(this.pollIntervalMs);
    }
  }
}

module.exports = { Worker };
