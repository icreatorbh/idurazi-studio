const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

class RuntimeControlError extends Error {
  constructor(message, { code = 'RUNTIME_CONTROL_ERROR', details = null } = {}) {
    super(message);
    this.name = 'RuntimeControlError';
    this.code = code;
    this.details = details;
  }
}

class RuntimeControlServer {
  constructor({ endpoint, token, service, netModule = net, maxRequestBytes = 64 * 1024 } = {}) {
    if (!endpoint) throw new TypeError('RuntimeControlServer requires an endpoint');
    if (!token) throw new TypeError('RuntimeControlServer requires an authentication token');
    if (!service) throw new TypeError('RuntimeControlServer requires a RuntimeService');
    this.endpoint = endpoint;
    this.token = token;
    this.service = service;
    this.net = netModule;
    this.maxRequestBytes = maxRequestBytes;
    this.server = null;
  }

  async start() {
    if (this.server) return this.status();
    if (process.platform !== 'win32') {
      try { fs.unlinkSync(this.endpoint); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }

    const server = this.net.createServer((socket) => this.#handleSocket(socket));
    this.server = server;
    await new Promise((resolve, reject) => {
      const onError = (error) => { cleanup(); reject(error); };
      const onListening = () => { cleanup(); resolve(); };
      const cleanup = () => {
        server.off('error', onError);
        server.off('listening', onListening);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.endpoint);
    });
    return this.status();
  }

  async close() {
    const server = this.server;
    this.server = null;
    if (!server) return false;
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (process.platform !== 'win32') {
      try { fs.unlinkSync(this.endpoint); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    return true;
  }

  status() {
    return { endpoint: this.endpoint, listening: Boolean(this.server?.listening) };
  }

  #handleSocket(socket) {
    socket.setEncoding('utf8');
    let input = '';
    let handled = false;
    const respond = (payload) => {
      if (handled) return;
      handled = true;
      socket.end(`${JSON.stringify(payload)}\n`);
    };

    socket.on('data', (chunk) => {
      if (handled) return;
      input += chunk;
      if (Buffer.byteLength(input, 'utf8') > this.maxRequestBytes) {
        respond({ ok: false, error: { code: 'REQUEST_TOO_LARGE', message: 'Runtime control request is too large' } });
        return;
      }
      const newline = input.indexOf('\n');
      if (newline < 0) return;
      const line = input.slice(0, newline).trim();
      Promise.resolve().then(() => this.#dispatch(JSON.parse(line))).then(
        (result) => respond({ ok: true, result }),
        (error) => respond({ ok: false, error: normalizeControlError(error) })
      );
    });
    socket.on('error', () => {});
  }

  #dispatch(request) {
    if (!request || request.token !== this.token) {
      throw new RuntimeControlError('Runtime control authentication failed', { code: 'UNAUTHORIZED' });
    }
    switch (request.command) {
      case 'ping':
        return { status: 'ok', pid: process.pid };
      case 'status':
        return this.service.status();
      case 'health':
        return this.service.health();
      case 'stop': {
        const timeoutMs = Number.isFinite(request.timeoutMs) ? request.timeoutMs : undefined;
        setImmediate(() => this.service.stop({ timeoutMs }).catch(() => {}));
        return { accepted: true, state: this.service.status().state };
      }
      default:
        throw new RuntimeControlError(`Unknown runtime control command: ${request.command}`, { code: 'UNKNOWN_COMMAND' });
    }
  }
}

class RuntimeControlClient {
  constructor({ pidFile, timeoutMs = 5000, netModule = net } = {}) {
    if (!pidFile) throw new TypeError('RuntimeControlClient requires a PID file');
    this.pidFile = path.resolve(pidFile);
    this.timeoutMs = timeoutMs;
    this.net = netModule;
  }

  readOwner() {
    try {
      const owner = JSON.parse(fs.readFileSync(this.pidFile, 'utf8'));
      if (!owner?.controlEndpoint || !owner?.token) {
        throw new RuntimeControlError('Runtime PID file does not contain control metadata', { code: 'CONTROL_UNAVAILABLE' });
      }
      return owner;
    } catch (error) {
      if (error instanceof RuntimeControlError) throw error;
      if (error.code === 'ENOENT') throw new RuntimeControlError('iDurazi Runtime is not running', { code: 'RUNTIME_NOT_RUNNING' });
      throw new RuntimeControlError('Could not read the Runtime PID file', { code: 'INVALID_PID_FILE', details: { cause: error.message } });
    }
  }

  request(command, payload = {}) {
    let owner;
    try { owner = this.readOwner(); }
    catch (error) { return Promise.reject(error); }
    return new Promise((resolve, reject) => {
      const socket = this.net.createConnection(owner.controlEndpoint);
      let input = '';
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        socket.destroy();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new RuntimeControlError('Runtime control request timed out', { code: 'CONTROL_TIMEOUT' })), this.timeoutMs);
      socket.setEncoding('utf8');
      socket.once('connect', () => socket.write(`${JSON.stringify({ command, token: owner.token, ...payload })}\n`));
      socket.on('data', (chunk) => {
        input += chunk;
        const newline = input.indexOf('\n');
        if (newline < 0) return;
        try {
          const response = JSON.parse(input.slice(0, newline));
          if (!response.ok) {
            finish(new RuntimeControlError(response.error?.message ?? 'Runtime control command failed', {
              code: response.error?.code ?? 'REMOTE_ERROR', details: response.error
            }));
          } else finish(null, response.result);
        } catch (error) {
          finish(new RuntimeControlError('Invalid response from Runtime control server', { code: 'INVALID_RESPONSE', details: { cause: error.message } }));
        }
      });
      socket.once('error', (error) => finish(new RuntimeControlError('Could not connect to iDurazi Runtime', {
        code: 'CONTROL_CONNECTION_FAILED', details: { cause: error.message, endpoint: owner.controlEndpoint }
      })));
      socket.once('end', () => {
        if (!settled && !input.includes('\n')) finish(new RuntimeControlError('Runtime control connection closed without a response', { code: 'EMPTY_RESPONSE' }));
      });
    });
  }

  ping() { return this.request('ping'); }
  status() { return this.request('status'); }
  health() { return this.request('health'); }
  stop({ timeoutMs } = {}) { return this.request('stop', { timeoutMs }); }
}

function defaultRuntimeControlEndpoint(pidFile) {
  const key = crypto.createHash('sha256').update(path.resolve(pidFile)).digest('hex').slice(0, 20);
  if (process.platform === 'win32') return `\\\\.\\pipe\\idurazi-runtime-${key}`;
  return path.join(os.tmpdir(), `idurazi-runtime-${key}.sock`);
}

function normalizeControlError(error) {
  return { name: error?.name ?? 'Error', message: error?.message ?? String(error), code: error?.code ?? 'RUNTIME_CONTROL_ERROR' };
}

module.exports = {
  RuntimeControlServer,
  RuntimeControlClient,
  RuntimeControlError,
  defaultRuntimeControlEndpoint
};
