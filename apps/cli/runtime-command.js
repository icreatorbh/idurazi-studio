const path = require('node:path');
const { RuntimeService, installShutdownHooks, loadRuntimeConfig, bootstrapRuntime } = require('@idurazi/runtime');

function parseRuntimeArgs(args) {
  const command = args[0] ?? 'help';
  const options = {};
  for (let i = 1; i < args.length; i += 1) {
    const token = args[i];
    if (token === '--config') options.file = args[++i];
    else if (token === '--database') options.database = args[++i];
    else if (token === '--pid-file') options.pidFile = args[++i];
    else if (token === '--json') options.json = true;
    else throw new Error(`Unknown runtime option: ${token}`);
  }
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

async function runRuntimeCommand(args, dependencies = {}) {
  const output = dependencies.output ?? console;
  const processTarget = dependencies.processTarget ?? process;
  const parsed = parseRuntimeArgs(args);
  const bootstrapOptions = createBootstrapOptions(parsed.options, dependencies.cwd ?? process.cwd());

  if (parsed.command === 'health') {
    const runtime = (dependencies.bootstrapRuntime ?? bootstrapRuntime)(bootstrapOptions);
    try { output.log(JSON.stringify(runtime.health.capture(), null, 2)); }
    finally { await runtime.close(); }
    return 0;
  }

  if (parsed.command === 'status') {
    const config = (dependencies.loadRuntimeConfig ?? loadRuntimeConfig)(bootstrapOptions);
    output.log(JSON.stringify({ status: 'configured', database: config.database.filename, environment: config.environment }, null, 2));
    return 0;
  }

  if (parsed.command === 'start') {
    const service = dependencies.service ?? new RuntimeService({
      bootstrapOptions,
      pidFile: parsed.options.pidFile ? path.resolve(dependencies.cwd ?? process.cwd(), parsed.options.pidFile) : undefined
    });
    const hooks = (dependencies.installShutdownHooks ?? installShutdownHooks)(service, { processTarget, logger: output });
    await service.start();
    output.log(JSON.stringify(service.status(), null, 2));
    if (dependencies.waitForShutdown === false) return { code: 0, service, hooks };
    await new Promise((resolve) => service.once('stateChanged', ({ state }) => state === 'stopped' && resolve()));
    hooks.dispose();
    return 0;
  }

  output.log('Runtime commands: start | status | health [--config file] [--database file] [--pid-file file] [--json]');
  return parsed.command === 'help' ? 0 : 1;
}

module.exports = { parseRuntimeArgs, createBootstrapOptions, runRuntimeCommand };
