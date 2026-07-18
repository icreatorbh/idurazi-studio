const { EventEmitter } = require('node:events');
const { JobRepository } = require('../database/repositories/JobRepository');

class JobQueue extends EventEmitter {
  constructor(database, options = {}) {
    super();
    this.repository = options.repository ?? new JobRepository(database, options);
  }

  enqueue(type, payload = {}, options = {}) {
    const job = this.repository.create({
      type,
      payload,
      priority: options.priority,
      maxAttempts: options.maxAttempts,
      availableAt: options.availableAt,
      id: options.id
    });
    this.emit('enqueued', job);
    return job;
  }

  get(id) {
    return this.repository.findById(id);
  }

  pending(options) {
    return this.repository.listPending(options);
  }

  cancel(id) {
    const job = this.repository.cancel(id);
    if (job) this.emit('cancelled', job);
    return job;
  }

  recoverExpired(options) {
    const count = this.repository.recoverExpired(options);
    if (count > 0) this.emit('recovered', { count });
    return count;
  }
}

module.exports = { JobQueue };
