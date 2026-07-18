const { RuntimeDatabase } = require('./database/Database');
const { JobRepository } = require('./database/repositories/JobRepository');
const { JobStatus, FINAL_JOB_STATUSES } = require('./database/types');

function createRuntimeDatabase(filename = ':memory:') {
  return new RuntimeDatabase(filename).open().migrate();
}

module.exports = {
  RuntimeDatabase,
  JobRepository,
  JobStatus,
  FINAL_JOB_STATUSES,
  createRuntimeDatabase
};
