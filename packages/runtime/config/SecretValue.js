const REDACTED = '[REDACTED]';

class SecretValue {
  #value;

  constructor(value, { name = 'secret' } = {}) {
    if (typeof value !== 'string' || value.length === 0) {
      throw new TypeError(`${name} must be a non-empty string`);
    }
    this.#value = value;
    this.name = name;
    Object.freeze(this);
  }

  reveal() {
    return this.#value;
  }

  equals(other) {
    const candidate = other instanceof SecretValue ? other.reveal() : other;
    return typeof candidate === 'string' && candidate === this.#value;
  }

  toString() {
    return REDACTED;
  }

  toJSON() {
    return REDACTED;
  }

  [Symbol.for('nodejs.util.inspect.custom')]() {
    return `SecretValue(${REDACTED})`;
  }
}

function redactSecrets(value, { keyPattern = /(secret|token|password|api[_-]?key|private[_-]?key|credential)/i } = {}) {
  if (value instanceof SecretValue) return REDACTED;
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, { keyPattern }));
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    keyPattern.test(key) ? REDACTED : redactSecrets(entry, { keyPattern })
  ]));
}

module.exports = { SecretValue, REDACTED, redactSecrets };
