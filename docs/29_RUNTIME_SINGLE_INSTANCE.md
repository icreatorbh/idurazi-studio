# Runtime Single-Instance Protection

Version 3.9.0 adds an exclusive PID-file lock to the Runtime Service.

- The PID file is created atomically with exclusive filesystem semantics.
- A live owner prevents a second runtime from starting.
- A stale PID file is removed automatically when its process no longer exists.
- The file contains the PID, a random ownership token, start time, and service name.
- Shutdown releases the file only when the caller still owns the recorded token.
- The CLI accepts `--pid-file <path>`; otherwise the default is `<database>.pid`.

Example:

```bash
node apps/cli/index.js runtime start --database ./data/runtime.sqlite --pid-file ./data/runtime.pid
```
