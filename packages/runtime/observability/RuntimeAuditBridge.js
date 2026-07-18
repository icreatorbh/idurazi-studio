const DEFAULT_EVENTS = [
  'enqueued', 'deduplicated', 'cancelled', 'recovered', 'dependenciesFailed', 'replayed',
  'started', 'heartbeatLost', 'heartbeatError', 'completed', 'retrying', 'failed',
  'ownershipLost', 'aborting', 'stopped', 'startedPool', 'stoppedPool'
];

function severityFor(eventName) {
  if (['failed', 'heartbeatError', 'ownershipLost'].includes(eventName)) return 'error';
  if (['retrying', 'heartbeatLost', 'aborting', 'dependenciesFailed'].includes(eventName)) return 'warn';
  return 'info';
}

function identifySubject(args) {
  const candidate = args.find((value) => value && typeof value === 'object' && typeof value.id === 'string');
  if (!candidate) return { subjectType: null, subjectId: null, correlationId: null };
  return {
    subjectType: candidate.type ? 'job' : 'runtime',
    subjectId: candidate.id,
    correlationId: candidate.id
  };
}

function sanitize(value) {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, code: value.code ?? null };
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'payload') continue;
    if (key === 'stack') continue;
    result[key] = sanitize(item);
  }
  return result;
}

class RuntimeAuditBridge {
  constructor({ auditRepository, logger = null, category = 'runtime' } = {}) {
    if (!auditRepository) throw new TypeError('auditRepository is required');
    this.auditRepository = auditRepository;
    this.logger = logger;
    this.category = category;
    this.bindings = [];
  }

  attach(emitter, { actorType = 'runtime', actorId = null, events = DEFAULT_EVENTS } = {}) {
    if (!emitter || typeof emitter.on !== 'function') throw new TypeError('emitter must be an EventEmitter');
    for (const eventName of events) {
      const listener = (...args) => {
        const subject = identifySubject(args);
        const metadata = { arguments: args.map(sanitize) };
        const event = this.auditRepository.record({
          category: this.category,
          action: eventName,
          severity: severityFor(eventName),
          actorType,
          actorId,
          ...subject,
          metadata
        });
        this.logger?.log(event.severity === 'error' ? 'error' : event.severity, `runtime.${eventName}`, {
          auditEventId: event.id,
          subjectType: event.subjectType,
          subjectId: event.subjectId,
          correlationId: event.correlationId
        });
      };
      emitter.on(eventName, listener);
      this.bindings.push({ emitter, eventName, listener });
    }
    return this;
  }

  detachAll() {
    for (const { emitter, eventName, listener } of this.bindings) {
      emitter.off(eventName, listener);
    }
    this.bindings = [];
  }
}

module.exports = { RuntimeAuditBridge, DEFAULT_EVENTS, severityFor };
