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
      id: options.id,
      idempotencyKey: options.idempotencyKey,
      dependsOn: options.dependsOn
    });
    this.emit(job.deduplicated ? 'deduplicated' : 'enqueued', job);
    return job;
  }

  get(id) { return this.repository.findById(id); }
  pending(options) { return this.repository.listPending(options); }
  dependencies(id) { return this.repository.dependenciesOf(id); }

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

  reconcileDependencies(options) {
    const count = this.repository.deadLetterBlockedDependencies(options);
    if (count > 0) this.emit('dependenciesFailed', { count });
    return count;
  }

  deadLetters(options) { return this.repository.listDeadLetters(options); }
  getDeadLetter(id) { return this.repository.getDeadLetter(id); }

  replayDeadLetter(id, overrides) {
    const job = this.repository.replayDeadLetter(id, overrides);
    if (job) this.emit('replayed', job, { deadLetterId: id });
    return job;
  }

  metrics(options) { return this.repository.metrics(options); }
}

module.exports = { JobQueue };
