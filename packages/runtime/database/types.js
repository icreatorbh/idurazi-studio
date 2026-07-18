const JobStatus = Object.freeze({
  QUEUED: 'queued',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

const FINAL_JOB_STATUSES = new Set([
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED
]);

module.exports = { JobStatus, FINAL_JOB_STATUSES };
