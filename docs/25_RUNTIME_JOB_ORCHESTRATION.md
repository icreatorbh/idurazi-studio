# Runtime Job Orchestration

Version 3.5.0 extends the persistent runtime queue with three reliability controls.

## Dependencies

A job may declare `dependsOn` with one or more existing job IDs. It remains blocked until every prerequisite reaches `completed`. If a prerequisite fails or is cancelled, reconciliation moves the dependent job to the dead-letter queue with `JOB_DEPENDENCY_FAILED`.

## Idempotency

Pass `idempotencyKey` when enqueueing work that must not be created twice. Reusing the same key returns the original job with `deduplicated: true`.

## Dead-letter queue

Jobs that exhaust their attempts are stored in `dead_letters`. Operators can inspect them through `queue.deadLetters()` and replay each dead letter once with `queue.replayDeadLetter()`.

## Example

```js
const importJob = queue.enqueue('import-interview', payload, {
  idempotencyKey: `import:${payload.sourceHash}`
});

queue.enqueue('resolve-entities', { interviewId: payload.interviewId }, {
  dependsOn: [importJob.id]
});
```
