const { EventEmitter } = require('node:events');
const { bootstrapRuntime } = require('../startup/RuntimeBootstrap');
const { RuntimeLock, defaultRuntimePidFile } = require('./RuntimeLock');

const RuntimeState = Object.freeze({
  IDLE: 'idle',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed'
});

class RuntimeService extends EventEmitter {
  constructor({ bootstrap = bootstrapRuntime, bootstrapOptions = {}, handlers = {}, singleInstance = true, pidFile, lockFactory } = {}) {
    super();
    this.bootstrap = bootstrap;
    this.bootstrapOptions = bootstrapOptions;
    this.handlers = new Map(Object.entries(handlers));
    this.state = RuntimeState.IDLE;
    this.runtime = null;
    this.startPromise = null;
    this.stopPromise = null;
    this.failure = null;
    this.singleInstance = singleInstance;
    this.pidFile = pidFile;
    this.lockFactory = lockFactory ?? ((filename) => new RuntimeLock(filename));
    this.lock = null;
  }

  register(type, handler) {
    if (!type || typeof handler !== 'function') throw new TypeError('register(type, handler) requires a job type and function');
    this.handlers.set(type, handler);
    if (this.runtime) this.runtime.pool.register(type, handler);
    return this;
  }

  unregister(type) {
    const removed = this.handlers.delete(type);
    if (this.runtime) this.runtime.pool.unregister(type);
    return removed;
  }

  async start() {
    if (this.state === RuntimeState.RUNNING) return this.snapshot();
    if (this.state === RuntimeState.STARTING) return this.startPromise;
    if (this.state === RuntimeState.STOPPING) await this.stopPromise;

    this.#transition(RuntimeState.STARTING);
    this.startPromise = Promise.resolve().then(() => {
      if (this.singleInstance) {
        const filename = this.pidFile ?? defaultRuntimePidFile(this.bootstrapOptions);
        this.lock = this.lockFactory(filename);
        this.lock.acquire({ service: 'idurazi-runtime' });
      }
      this.runtime = this.bootstrap(this.bootstrapOptions);
      for (const [type, handler] of this.handlers) this.runtime.pool.register(type, handler);
      this.runtime.pool.start();
      this.failure = null;
      this.#transition(RuntimeState.RUNNING);
      return this.snapshot();
    }).catch(async (error) => {
      this.failure = error;
      this.#transition(RuntimeState.FAILED, { error: normalizeError(error) });
      if (this.runtime) {
        try { await this.runtime.close(); } catch {}
        this.runtime = null;
      }
      this.lock?.release();
      this.lock = null;
      throw error;
    }).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async stop({ timeoutMs } = {}) {
    if ([RuntimeState.IDLE, RuntimeState.STOPPED].includes(this.state)) {
      if (this.state === RuntimeState.IDLE) this.#transition(RuntimeState.STOPPED);
      return this.snapshot();
    }
    if (this.state === RuntimeState.STOPPING) return this.stopPromise;
    if (this.state === RuntimeState.STARTING) await this.startPromise;

    this.#transition(RuntimeState.STOPPING);
    this.stopPromise = Promise.resolve().then(async () => {
      if (this.runtime) await this.runtime.close({ timeoutMs });
      this.runtime = null;
      this.lock?.release();
      this.lock = null;
      this.#transition(RuntimeState.STOPPED);
      return this.snapshot();
    }).catch((error) => {
      this.failure = error;
      this.#transition(RuntimeState.FAILED, { error: normalizeError(error) });
      throw error;
    }).finally(() => {
      this.stopPromise = null;
    });

    return this.stopPromise;
  }

  status() {
    return this.snapshot();
  }

  health() {
    if (!this.runtime) {
      return {
        status: this.state === RuntimeState.FAILED ? 'unhealthy' : 'stopped',
        runtimeState: this.state,
        error: this.failure ? normalizeError(this.failure) : null
      };
    }
    return { ...this.runtime.health.capture(), runtimeState: this.state };
  }

  snapshot() {
    return {
      state: this.state,
      running: this.state === RuntimeState.RUNNING,
      handlers: [...this.handlers.keys()].sort(),
      activeJobs: this.runtime?.pool.activeJobs ?? [],
      failure: this.failure ? normalizeError(this.failure) : null,
      lock: this.lock?.status() ?? null
    };
  }

  #transition(nextState, detail = {}) {
    const previousState = this.state;
    this.state = nextState;
    this.emit('stateChanged', { previousState, state: nextState, ...detail });
  }
}

function normalizeError(error) {
  return { name: error?.name ?? 'Error', message: error?.message ?? String(error), code: error?.code ?? null };
}

module.exports = { RuntimeService, RuntimeState };
