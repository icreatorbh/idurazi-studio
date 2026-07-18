const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

class RuntimeDatabase {
  constructor(filename = ':memory:') {
    this.filename = filename;
    this.connection = null;
  }

  open() {
    if (this.connection) return this;
    if (this.filename !== ':memory:') {
      fs.mkdirSync(path.dirname(path.resolve(this.filename)), { recursive: true });
    }
    this.connection = new DatabaseSync(this.filename);
    this.connection.exec('PRAGMA foreign_keys = ON;');
    this.connection.exec('PRAGMA journal_mode = WAL;');
    this.connection.exec('PRAGMA busy_timeout = 5000;');
    return this;
  }

  migrate() {
    this.#assertOpen();
    const migrationDir = path.join(__dirname, 'migrations');
    const migrations = fs.readdirSync(migrationDir)
      .filter((name) => /^\d+_.*\.sql$/.test(name))
      .sort();

    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = this.connection.prepare(
      'SELECT version FROM schema_migrations ORDER BY version'
    ).all();
    const appliedVersions = new Set(applied.map((row) => Number(row.version)));

    for (const filename of migrations) {
      const version = Number(filename.split('_', 1)[0]);
      if (appliedVersions.has(version)) continue;
      const sql = fs.readFileSync(path.join(migrationDir, filename), 'utf8');
      const now = new Date().toISOString();
      this.transaction(() => {
        this.connection.exec(sql);
        this.connection.prepare(
          'INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)'
        ).run(version, filename, now);
      });
    }
    return this;
  }

  transaction(callback) {
    this.#assertOpen();
    this.connection.exec('BEGIN IMMEDIATE;');
    try {
      const result = callback(this.connection);
      this.connection.exec('COMMIT;');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK;');
      throw error;
    }
  }

  close() {
    if (!this.connection) return;
    this.connection.close();
    this.connection = null;
  }

  #assertOpen() {
    if (!this.connection) throw new Error('Runtime database is not open');
  }
}

module.exports = { RuntimeDatabase };
