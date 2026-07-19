# Runtime Background Daemon

Version 3.11.0 adds detached background operation for the iDurazi Runtime.

## Commands

```bash
npm run runtime:start
npm run runtime:status
npm run runtime:health
npm run runtime:logs
npm run runtime:restart
npm run runtime:stop
```

`runtime:start` launches a detached Node.js child process and waits until the authenticated local control channel answers `ping`. The foreground mode remains available:

```bash
node apps/cli/index.js runtime start --foreground
```

Custom operational files can be selected with `--pid-file`, `--log-file`, and `--error-log`. The default log files are placed beside the PID file and use `.log` and `.error.log` suffixes.

## Safety

The existing single-instance lock remains authoritative. A second daemon start fails instead of creating duplicate workers. Restart sends a graceful remote stop, waits for the PID file to disappear, then starts a new detached process.
