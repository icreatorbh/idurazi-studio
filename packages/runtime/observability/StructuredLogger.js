const { Writable } = require('node:stream');

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40, fatal: 50 });

function normalizeError(error) {
  if (!error) return null;
  return {
    name: error.name ?? 'Error',
    message: error.message ?? String(error),
    code: error.code ?? null,
    stack: error.stack ?? null
  };
}

class StructuredLogger {
  constructor({
    name = 'idurazi-runtime',
    level = 'info',
    sink = process.stdout,
    clock = () => new Date(),
    base = {}
  } = {}) {
    if (!(level in LEVELS)) throw new RangeError(`Unknown log level: ${level}`);
    if (!sink || typeof sink.write !== 'function') throw new TypeError('sink must implement write()');
    this.name = name;
    this.level = level;
    this.sink = sink;
    this.clock = clock;
    this.base = { ...base };
  }

  child(bindings = {}) {
    return new StructuredLogger({
      name: this.name,
      level: this.level,
      sink: this.sink,
      clock: this.clock,
      base: { ...this.base, ...bindings }
    });
  }

  debug(message, fields) { return this.log('debug', message, fields); }
  info(message, fields) { return this.log('info', message, fields); }
  warn(message, fields) { return this.log('warn', message, fields); }
  error(message, fields) { return this.log('error', message, fields); }
  fatal(message, fields) { return this.log('fatal', message, fields); }

  log(level, message, fields = {}) {
    if (!(level in LEVELS)) throw new RangeError(`Unknown log level: ${level}`);
    if (LEVELS[level] < LEVELS[this.level]) return null;

    const normalizedFields = { ...fields };
    if (normalizedFields.error instanceof Error) {
      normalizedFields.error = normalizeError(normalizedFields.error);
    }

    const entry = {
      timestamp: this.clock().toISOString(),
      level,
      logger: this.name,
      message: String(message),
      ...this.base,
      ...normalizedFields
    };
    this.sink.write(`${JSON.stringify(entry)}\n`);
    return entry;
  }
}

class MemoryLogSink extends Writable {
  constructor() {
    super();
    this.lines = [];
  }

  _write(chunk, _encoding, callback) {
    this.lines.push(...String(chunk).split('\n').filter(Boolean));
    callback();
  }

  entries() {
    return this.lines.map((line) => JSON.parse(line));
  }
}

module.exports = { StructuredLogger, MemoryLogSink, LEVELS, normalizeError };
