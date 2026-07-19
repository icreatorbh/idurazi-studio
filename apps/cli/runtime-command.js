const path = require('node:path');
const {
  RuntimeService,
  RuntimeControlClient,
  RuntimeDaemonManager,
  installShutdownHooks,
  loadRuntimeConfig,
  bootstrapRuntime,
  defaultRuntimePidFile,
  defaultRuntimeLogFiles
} = require('@idurazi/runtime');

function parseRuntimeArgs(args) {
  const command = args[0] ?? 'help';
  const options = {};
  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--config') options.file = args[++i];
    else if (token === '--database') options.database = args[++i];
    else if (token === '--pid-file') options.pidFile = args[++i];
    else if (token === '--timeout') options.timeoutMs = Number(args[++i]);
    else if (token === '--log-file') options.logFile = args[++i];
    else if (token === '--error-log') options.errorLog = args[++i];
    else if (token === '--lines') options.lines = Number(args[++i]);
    else if (token === '--background' || token === '--daemon') options.background = true;
    else if (token === '--foreground') options.foreground = true;
    else if (token === '--json') options.json = true;
    else throw new Error(`Unknown runtime option: ${token}`);
  }
  if (options.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1)) {
    throw new Error('--timeout must be a positive number of milliseconds');
  }
  if (options.lines !== undefined && (!Number.isInteger(options.lines) || options.lines < 0)) {
    throw new Error('--lines must be a non-negative integer');
  }
  if (options.background && options.foreground) throw new Error('Choose either --background or --foreground');
  return { command, options };
}

function createBootstrapOptions(options, cwd = process.cwd()) {
  const overrides = {};
  if (options.database) overrides.database = { filename: options.database };
  return {
    file: options.file ? path.resolve(cwd, options.file) : undefined,
    cwd,
    overrides
  };
}

function resolvePidFile(options, bootstrapOptions) {
  if (options.pidFile) return path.resolve(bootstrapOptions.cwd ?? process.cwd(), options.pidFile);
  return defaultRuntimePidFile(bootstrapOptions);
}

function serializeChildRuntimeArgs(options) {
  const args = [];
  if (options.file) args.push('--config', path.resolve(options.file));
  if (options.database) args.push('--database', options.database);
  if (options.pidFile) args.push('--pid-file', options.pidFile);
  if (options.timeoutMs) args.push('--timeout', String(options.timeoutMs));
  return args;
}

function createDaemon(options, bootstrapOptions, pidFile, dependencies = {}) {
  const logs = defaultRuntimeLogFiles(pidFile);
  return (dependencies.createDaemon ?? ((daemonOptions) => new RuntimeDaemonManager(daemonOptions)))({
    cliEntry: dependencies.cliEntry ?? path.resolve(__dirname, 'index.js'),
    pidFile,
    cwd: bootstrapOptions.cwd,
    stdoutFile: options.logFile ? path.resolve(bootstrapOptions.cwd, options.logFile) : logs.stdout,
    stderrFile: options.errorLog ? path.resolve(bootstrapOptions.cwd, options.errorLog) : logs.stderr
  });
}

async function runRuntimeCommand(args, dependencies = {}) {
  const output = dependencies.output ?? console;
  const processTarget = dependencies.processTarget ?? process;
  const parsed = parseRuntimeArgs(args);
  const bootstrapOptions = createBootstrapOptions(parsed.options, dependencies.cwd ?? process.cwd());
  const pidFile = resolvePidFile(parsed.options, bootstrapOptions);
  const createClient = dependencies.createControlClient ?? ((options) => new RuntimeControlClient(options));

  if (parsed.command === 'logs') {
    const daemon = createDaemon(parsed.options, bootstrapOptions, pidFile, dependencies);
    output.log(JSON.stringify(daemon.logs({ lines: parsed.options.lines ?? 100 }), null, 2));
    return 0;
  }

  if (parsed.command === 'restart') {
    const daemon = createDaemon(parsed.options, bootstrapOptions, pidFile, dependencies);
    const result = await daemon.restart({
      runtimeArgs: serializeChildRuntimeArgs(parsed.options),
      timeoutMs: parsed.options.timeoutMs ?? 10000
    });
    output.log(JSON.stringify(result, null, 2));
    return 0;
  }

  if (['status', 'health', 'ping', 'stop'].includes(parsed.command)) {
    const client = createClient({ pidFile, timeoutMs: parsed.options.timeoutMs ?? 5000 });
    try {
      const result = parsed.command === 'status' ? await client.status()
        : parsed.command === 'health' ? await client.health()
          : parsed.command === 'ping' ? await client.ping()
            : await client.stop({ timeoutMs: parsed.options.timeoutMs });
      output.log(JSON.stringify(result, null, 2));
      return 0;
    } catch (error) {
      if (parsed.command === 'status' && error.code === 'RUNTIME_NOT_RUNNING') {
        const config = (dependencies.loadRuntimeConfig ?? loadRuntimeConfig)(bootstrapOptions);
        output.log(JSON.stringify({ status: 'stopped', configured: true, database: config.database.filename, environment: config.environment, pidFile, logs: defaultRuntimeLogFiles(pidFile) }, null, 2));
        return 0;
      }
      if (parsed.command === 'health' && error.code === 'RUNTIME_NOT_RUNNING') {
        const runtime = (dependencies.bootstrapRuntime ?? bootstrapRuntime)(bootstrapOptions);
        try { output.log(JSON.stringify({ ...runtime.health.capture(), runtimeState: 'stopped' }, null, 2)); }
        finally { await runtime.close(); }
        return 0;
      }
      throw error;
    }
  }

  if (parsed.command === 'start') {
    const runInBackground = parsed.options.background || (!parsed.options.foreground && dependencies.defaultBackground === true);
    if (runInBackground) {
      const daemon = createDaemon(parsed.options, bootstrapOptions, pidFile, dependencies);
      const result = await daemon.start({
        runtimeArgs: serializeChildRuntimeArgs(parsed.options),
        timeoutMs: parsed.options.timeoutMs ?? 10000
      });
      output.log(JSON.stringify(result, null, 2));
      return 0;
    }

    const service = dependencies.service ?? new RuntimeService({ bootstrapOptions, pidFile });
    const hooks = (dependencies.installShutdownHooks ?? installShutdownHooks)(service, { processTarget, logger: output });
    await service.start();
    output.log(JSON.stringify(service.status(), null, 2));
    if (dependencies.waitForShutdown === false) return { code: 0, service, hooks };
    await new Promise((resolve) => service.once('stateChanged', ({ state }) => state === 'stopped' && resolve()));
    hooks.dispose();
    return 0;
  }

  output.log('Runtime commands: start [--background|--foreground] | restart | status | health | ping | stop | logs [--lines n]');
  return parsed.command === 'help' ? 0 : 1;
}

module.exports = { parseRuntimeArgs, createBootstrapOptions, resolvePidFile, serializeChildRuntimeArgs, createDaemon, runRuntimeCommand };
