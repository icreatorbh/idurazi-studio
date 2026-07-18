# Runtime Observability and Health

Version 3.6.0 adds three production-facing runtime capabilities.

## Structured logging

`StructuredLogger` writes one JSON object per line. Every entry includes a timestamp, severity, logger name, message, inherited bindings, and event-specific fields. Child loggers inherit context without mutating their parent.

## Durable audit events

`AuditEventRepository` persists operational events in SQLite. `RuntimeAuditBridge` can subscribe to a `JobQueue`, `Worker`, or `WorkerPool` and convert lifecycle events into durable audit records. Job payloads are intentionally omitted from automatically captured metadata.

## Health reports

`RuntimeHealthReport.capture()` returns a single serializable report containing:

- SQLite integrity and migration state
- queue counts, delayed or blocked work, expired leases, and dead letters
- audit warning and error counts
- process uptime and memory use
- host platform metadata

A report is `healthy` when the database is valid, migrations are current, and no lease is expired. Otherwise it is `degraded`.
