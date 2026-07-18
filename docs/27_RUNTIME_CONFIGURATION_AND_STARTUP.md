# Runtime Configuration and Startup Validation

Version 3.7.0 introduces a single validated configuration boundary for the runtime.

## Precedence

Configuration values are resolved in this order, from lowest to highest priority:

1. Built-in defaults
2. JSON configuration file
3. Environment variables
4. Explicit programmatic overrides

## Environment variables

- `IDURAZI_ENV`
- `IDURAZI_DATABASE_FILENAME`
- `IDURAZI_QUEUE_POLL_INTERVAL_MS`
- `IDURAZI_QUEUE_LEASE_MS`
- `IDURAZI_QUEUE_HEARTBEAT_INTERVAL_MS`
- `IDURAZI_QUEUE_CONCURRENCY`
- `IDURAZI_LOG_LEVEL`
- `IDURAZI_SHUTDOWN_TIMEOUT_MS`
- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY`

## Secrets boundary

Provider credentials are wrapped in `SecretValue`. Logging, JSON serialization, and public configuration snapshots redact them as `[REDACTED]`. Code must call `reveal()` only at the provider transport boundary.

## Startup validation

`StartupValidator` checks the supported Node.js version, database directory access, SQLite opening, migrations, and `PRAGMA quick_check`. Startup fails with a structured `StartupValidationError` when a required check fails.

## Bootstrap

`bootstrapRuntime()` creates the validated configuration, database, queue, worker pool, logger, audit bridge, and health reporter. Its `close()` method performs graceful shutdown and closes SQLite.
