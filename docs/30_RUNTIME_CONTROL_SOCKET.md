# Runtime Control Socket

Version 3.10.0 adds an authenticated local control channel for the long-running iDurazi Runtime.

## Transport

- Windows uses a named pipe.
- macOS and Linux use a Unix domain socket in the operating-system temporary directory.
- The endpoint is deterministically derived from the PID-file path.
- The PID file is created with restricted permissions and stores the endpoint and a random ownership token.

The server accepts one newline-delimited JSON request per connection. Requests without the token in the PID file are rejected.

## Commands

```bash
npm run runtime:start
npm run runtime:status
npm run runtime:health
node apps/cli/index.js runtime ping
node apps/cli/index.js runtime stop
```

All commands accept the same `--database`, `--config`, and `--pid-file` options. `stop` also accepts `--timeout <milliseconds>` for the graceful Worker shutdown deadline.

## Operational behavior

`status` and `health` query the running process instead of opening a second database connection. When no Runtime is running, `status` reports `stopped`; `health` performs a one-shot local health inspection. The `stop` request is acknowledged before the control server closes and the Runtime begins graceful shutdown.
