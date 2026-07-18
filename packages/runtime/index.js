const { RuntimeDatabase } = require('./database/Database');
const { JobRepository } = require('./database/repositories/JobRepository');
const { JobStatus, FINAL_JOB_STATUSES } = require('./database/types');
const { JobQueue } = require('./queue/JobQueue');
const { Worker } = require('./queue/Worker');

function createRuntimeDatabase(filename = ':memory:') {
  return new RuntimeDatabase(filename).open().migrate();
}

module.exports = {
  RuntimeDatabase,
  JobRepository,
  JobQueue,
  Worker,
  JobStatus,
  FINAL_JOB_STATUSES,
  createRuntimeDatabase
};
