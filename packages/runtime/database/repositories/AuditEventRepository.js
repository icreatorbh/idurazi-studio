const crypto = require('node:crypto');

function serialize(value) {
  return JSON.stringify(value ?? {});
}

function deserialize(value) {
  if (value == null || value === '') return {};
  return JSON.parse(value);
}

function mapAuditRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    category: row.category,
    action: row.action,
    severity: row.severity,
    actorType: row.actor_type,
    actorId: row.actor_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    correlationId: row.correlation_id,
    metadata: deserialize(row.metadata)
  };
}

class AuditEventRepository {
  constructor(database, { clock = () => new Date() } = {}) {
    if (!database?.connection) throw new Error('AuditEventRepository requires an open RuntimeDatabase');
    this.database = database;
    this.db = database.connection;
    this.clock = clock;
  }

  record(input) {
    if (!input?.category) throw new TypeError('Audit event category is required');
    if (!input?.action) throw new TypeError('Audit event action is required');

    const event = {
      id: input.id ?? crypto.randomUUID(),
      occurredAt: input.occurredAt ? new Date(input.occurredAt).toISOString() : this.clock().toISOString(),
      category: input.category,
      action: input.action,
      severity: input.severity ?? 'info',
      actorType: input.actorType ?? null,
      actorId: input.actorId ?? null,
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      correlationId: input.correlationId ?? null,
      metadata: input.metadata ?? {}
    };

    this.db.prepare(`
      INSERT INTO audit_events (
        id, occurred_at, category, action, severity,
        actor_type, actor_id, subject_type, subject_id,
        correlation_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id, event.occurredAt, event.category, event.action, event.severity,
      event.actorType, event.actorId, event.subjectType, event.subjectId,
      event.correlationId, serialize(event.metadata)
    );
    return this.findById(event.id);
  }

  findById(id) {
    return mapAuditRow(this.db.prepare('SELECT * FROM audit_events WHERE id = ?').get(id));
  }

  list({
    limit = 100,
    category,
    action,
    severity,
    subjectType,
    subjectId,
    correlationId,
    since,
    until
  } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) {
      throw new RangeError('limit must be an integer between 1 and 10000');
    }

    const clauses = [];
    const params = [];
    const add = (sql, value) => {
      if (value == null) return;
      clauses.push(sql);
      params.push(value);
    };
    add('category = ?', category);
    add('action = ?', action);
    add('severity = ?', severity);
    add('subject_type = ?', subjectType);
    add('subject_id = ?', subjectId);
    add('correlation_id = ?', correlationId);
    add('occurred_at >= ?', since ? new Date(since).toISOString() : null);
    add('occurred_at <= ?', until ? new Date(until).toISOString() : null);

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return this.db.prepare(`
      SELECT * FROM audit_events
      ${where}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ?
    `).all(...params, limit).map(mapAuditRow);
  }

  count(filters = {}) {
    const clauses = [];
    const params = [];
    for (const [column, value] of [
      ['category', filters.category],
      ['action', filters.action],
      ['severity', filters.severity],
      ['subject_type', filters.subjectType],
      ['subject_id', filters.subjectId],
      ['correlation_id', filters.correlationId]
    ]) {
      if (value != null) {
        clauses.push(`${column} = ?`);
        params.push(value);
      }
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    return Number(this.db.prepare(`SELECT COUNT(*) AS count FROM audit_events ${where}`).get(...params).count);
  }

  purgeBefore(cutoff) {
    const cutoffIso = new Date(cutoff).toISOString();
    return Number(this.db.prepare('DELETE FROM audit_events WHERE occurred_at < ?').run(cutoffIso).changes);
  }
}

module.exports = { AuditEventRepository, mapAuditRow };
