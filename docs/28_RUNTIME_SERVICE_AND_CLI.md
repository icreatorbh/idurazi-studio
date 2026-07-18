# Runtime Service Integration and CLI

Version 3.8.0 introduces an operational service boundary around the Stage 1A runtime.

## RuntimeService

`RuntimeService` owns runtime bootstrap, worker-pool startup, health access, handler registration, and graceful shutdown. Its lifecycle states are `idle`, `starting`, `running`, `stopping`, `stopped`, and `failed`.

## Shutdown hooks

`installShutdownHooks()` handles `SIGINT` and `SIGTERM`, invokes one idempotent shutdown, and sets the process exit code according to the result.

## CLI

```bash
npm run runtime:status
npm run runtime:health
npm run runtime:start
```

Direct usage:

```bash
node apps/cli/index.js runtime health --config runtime.json
node apps/cli/index.js runtime start --database ./data/runtime.sqlite
```

`runtime health` boots the runtime temporarily, captures a report, and closes all resources. `runtime start` remains active until an operating-system shutdown signal is received.
