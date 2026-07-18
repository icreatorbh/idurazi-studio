const fs = require('node:fs');
const path = require('node:path');
const { SecretValue, redactSecrets } = require('./SecretValue');

class ConfigurationError extends Error {
  constructor(issues, message = 'Runtime configuration is invalid') {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'RUNTIME_CONFIG_INVALID';
    this.issues = issues;
  }
}

const DEFAULTS = Object.freeze({
  environment: 'development',
  database: Object.freeze({ filename: './data/idurazi-runtime.sqlite' }),
  queue: Object.freeze({ pollIntervalMs: 250, leaseMs: 30_000, heartbeatIntervalMs: 10_000, concurrency: 1 }),
  logging: Object.freeze({ level: 'info' }),
  shutdown: Object.freeze({ timeoutMs: 15_000 })
});

const ENVIRONMENT_VALUES = new Set(['development', 'test', 'production']);
const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal']);

function loadRuntimeConfig({ env = process.env, file, overrides = {}, cwd = process.cwd() } = {}) {
  const fileConfig = file ? readConfigFile(file, cwd) : {};
  const envConfig = fromEnvironment(env);
  const merged = deepMerge(DEFAULTS, fileConfig, envConfig, overrides);
  const issues = validateRawConfig(merged);
  if (issues.length > 0) throw new ConfigurationError(issues);

  const config = {
    environment: merged.environment,
    database: {
      filename: normalizeDatabaseFilename(merged.database.filename, cwd)
    },
    queue: {
      pollIntervalMs: Number(merged.queue.pollIntervalMs),
      leaseMs: Number(merged.queue.leaseMs),
      heartbeatIntervalMs: Number(merged.queue.heartbeatIntervalMs),
      concurrency: Number(merged.queue.concurrency)
    },
    logging: { level: merged.logging.level },
    shutdown: { timeoutMs: Number(merged.shutdown.timeoutMs) },
    providers: normalizeProviders(merged.providers ?? {})
  };

  return deepFreeze(config);
}

function readConfigFile(filename, cwd) {
  const resolved = path.isAbsolute(filename) ? filename : path.resolve(cwd, filename);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new ConfigurationError([{ path: 'file', message: error.message, value: resolved }], `Unable to read runtime configuration: ${resolved}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigurationError([{ path: 'file', message: 'Configuration root must be an object', value: resolved }]);
  }
  return parsed;
}

function fromEnvironment(env) {
  const output = {};
  assign(output, 'environment', env.IDURAZI_ENV);
  assign(output, 'database.filename', env.IDURAZI_DATABASE_FILENAME);
  assign(output, 'queue.pollIntervalMs', parseOptionalInteger(env.IDURAZI_QUEUE_POLL_INTERVAL_MS));
  assign(output, 'queue.leaseMs', parseOptionalInteger(env.IDURAZI_QUEUE_LEASE_MS));
  assign(output, 'queue.heartbeatIntervalMs', parseOptionalInteger(env.IDURAZI_QUEUE_HEARTBEAT_INTERVAL_MS));
  assign(output, 'queue.concurrency', parseOptionalInteger(env.IDURAZI_QUEUE_CONCURRENCY));
  assign(output, 'logging.level', env.IDURAZI_LOG_LEVEL);
  assign(output, 'shutdown.timeoutMs', parseOptionalInteger(env.IDURAZI_SHUTDOWN_TIMEOUT_MS));

  const providerKeys = {
    openai: env.OPENAI_API_KEY,
    anthropic: env.ANTHROPIC_API_KEY,
    gemini: env.GEMINI_API_KEY
  };
  for (const [provider, apiKey] of Object.entries(providerKeys)) {
    if (apiKey !== undefined && apiKey !== '') assign(output, `providers.${provider}.apiKey`, apiKey);
  }
  return output;
}

function validateRawConfig(config) {
  const issues = [];
  if (!ENVIRONMENT_VALUES.has(config.environment)) issue(issues, 'environment', 'must be development, test, or production', config.environment);
  if (!config.database || typeof config.database.filename !== 'string' || config.database.filename.trim() === '') issue(issues, 'database.filename', 'must be a non-empty string', config.database?.filename);
  validatePositiveInteger(issues, 'queue.pollIntervalMs', config.queue?.pollIntervalMs, { min: 10 });
  validatePositiveInteger(issues, 'queue.leaseMs', config.queue?.leaseMs, { min: 100 });
  validatePositiveInteger(issues, 'queue.heartbeatIntervalMs', config.queue?.heartbeatIntervalMs, { min: 50 });
  validatePositiveInteger(issues, 'queue.concurrency', config.queue?.concurrency, { min: 1, max: 64 });
  validatePositiveInteger(issues, 'shutdown.timeoutMs', config.shutdown?.timeoutMs, { min: 100 });
  if (!LOG_LEVELS.has(config.logging?.level)) issue(issues, 'logging.level', 'must be debug, info, warn, error, or fatal', config.logging?.level);
  if (Number(config.queue?.heartbeatIntervalMs) >= Number(config.queue?.leaseMs)) {
    issue(issues, 'queue.heartbeatIntervalMs', 'must be lower than queue.leaseMs', config.queue?.heartbeatIntervalMs);
  }
  return issues;
}

function normalizeProviders(providers) {
  const output = {};
  for (const [name, provider] of Object.entries(providers)) {
    if (!provider || typeof provider !== 'object') continue;
    output[name] = { ...provider };
    if (typeof provider.apiKey === 'string' && provider.apiKey.length > 0) {
      output[name].apiKey = new SecretValue(provider.apiKey, { name: `${name}.apiKey` });
    }
  }
  return output;
}

function publicRuntimeConfig(config) {
  return redactSecrets(config);
}

function normalizeDatabaseFilename(filename, cwd) {
  if (filename === ':memory:') return filename;
  return path.isAbsolute(filename) ? path.normalize(filename) : path.resolve(cwd, filename);
}

function validatePositiveInteger(issues, pathName, value, { min, max = Number.MAX_SAFE_INTEGER }) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    issue(issues, pathName, `must be an integer between ${min} and ${max}`, value);
  }
}

function parseOptionalInteger(value) {
  if (value === undefined || value === '') return undefined;
  return Number(value);
}

function issue(issues, pathName, message, value) {
  issues.push({ path: pathName, message, value });
}

function assign(target, dottedPath, value) {
  if (value === undefined) return;
  const keys = dottedPath.split('.');
  let cursor = target;
  for (const key of keys.slice(0, -1)) cursor = cursor[key] ??= {};
  cursor[keys.at(-1)] = value;
}

function deepMerge(...sources) {
  const output = {};
  for (const source of sources) mergeInto(output, source);
  return output;
}

function mergeInto(target, source) {
  if (!source || typeof source !== 'object') return target;
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = mergeInto(target[key] && typeof target[key] === 'object' ? { ...target[key] } : {}, value);
    } else target[key] = value;
  }
  return target;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

module.exports = {
  DEFAULTS,
  ConfigurationError,
  loadRuntimeConfig,
  publicRuntimeConfig,
  validateRawConfig
};
