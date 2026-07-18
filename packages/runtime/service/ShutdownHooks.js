function installShutdownHooks(service, {
  processTarget = process,
  signals = ['SIGINT', 'SIGTERM'],
  timeoutMs,
  exit = true,
  logger = console
} = {}) {
  if (!service || typeof service.stop !== 'function') throw new TypeError('installShutdownHooks requires a RuntimeService-like object');
  let shuttingDown = false;
  const listeners = new Map();

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      logger.info?.(`Received ${signal}; stopping iDurazi runtime`);
      await service.stop({ timeoutMs });
      if (exit) processTarget.exitCode = 0;
    } catch (error) {
      logger.error?.('Runtime shutdown failed', error);
      if (exit) processTarget.exitCode = 1;
    }
  };

  for (const signal of signals) {
    const listener = () => void shutdown(signal);
    listeners.set(signal, listener);
    processTarget.once(signal, listener);
  }

  return {
    shutdown,
    dispose() {
      for (const [signal, listener] of listeners) processTarget.removeListener(signal, listener);
      listeners.clear();
    }
  };
}

module.exports = { installShutdownHooks };
