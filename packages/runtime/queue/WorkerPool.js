const { EventEmitter } = require('node:events');
const crypto = require('node:crypto');
const { JobRepository } = require('../database/repositories/JobRepository');
const { Worker } = require('./Worker');

const FORWARDED_EVENTS = [
  'started',
  'heartbeat',
  'heartbeatLost',
  'heartbeatError',
  'completed',
  'retrying',
  'failed',
  'ownershipLost',
  'aborting',
  'stopped'
];

class WorkerPool extends EventEmitter {
  constructor(database, {
    id = `pool-${crypto.randomUUID()}`,
    concurrency = 2,
    handlers = {},
    repository,
    workerOptions = {}
  } = {}) {
    super();
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('concurrency must be a positive integer');
    }

    this.id = id;
    this.concurrency = concurrency;
    this.repository = repository ?? new JobRepository(database);
    this.handlers = new Map(Object.entries(handlers));
    this.running = false;
    this.loopPromise = null;

    this.workers = Array.from({ length: concurrency }, (_, index) => {
      const worker = new Worker(database, {
        ...workerOptions,
        id: `${id}-${index + 1}`,
        handlers: Object.fromEntries(this.handlers),
        repository: this.repository,
        // Recovery is coordinated once by the pool before workers start.
        recoverOnStart: false
      });
      this.#forwardEvents(worker);
      return worker;
    });
  }

  register(type, handler) {
    if (!type || typeof handler !== 'function') {
      throw new TypeError('register(type, handler) requires a job type and function');
    }
    this.handlers.set(type, handler);
    for (const worker of this.workers) worker.register(type, handler);
    return this;
  }

  unregister(type) {
    this.handlers.delete(type);
    let removed = false;
    for (const worker of this.workers) removed = worker.unregister(type) || removed;
    return removed;
  }

  async runOneBatch() {
    return Promise.all(this.workers.map((worker) => worker.runOne()));
  }

  start() {
    if (this.running) return this.loopPromise;
    this.running = true;

    const recovered = this.repository.recoverExpired();
    if (recovered > 0) this.emit('recovered', { count: recovered, poolId: this.id });

    const loops = this.workers.map((worker) => worker.start());
    this.loopPromise = Promise.all(loops).finally(() => {
      this.running = false;
      this.loopPromise = null;
    });
    this.emit('startedPool', { poolId: this.id, concurrency: this.concurrency });
    return this.loopPromise;
  }

  async stop(options = {}) {
    this.running = false;
    const results = await Promise.all(this.workers.map((worker) => worker.stop(options)));
    const graceful = results.every((result) => result.graceful);
    const activeJobs = results.map((result) => result.activeJob).filter(Boolean);
    const summary = { graceful, activeJobs, workers: results };
    this.emit('stoppedPool', summary);
    return summary;
  }

  get activeJobs() {
    return this.workers.map((worker) => worker.activeJob).filter(Boolean);
  }

  #forwardEvents(worker) {
    for (const eventName of FORWARDED_EVENTS) {
      worker.on(eventName, (...args) => {
        this.emit(eventName, ...args, { workerId: worker.id, poolId: this.id });
      });
    }
  }
}

module.exports = { WorkerPool };
