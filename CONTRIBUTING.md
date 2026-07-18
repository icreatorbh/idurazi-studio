# Contributing to iDurazi Studio

## Branches

- `main`: stable, reviewed releases.
- `develop`: integration branch.
- `feature/<feature-id>-description`: feature work.
- `fix/<issue-id>-description`: fixes.
- `release/vX.Y.Z`: release preparation.

## Required workflow

1. Link work to a Feature ID.
2. State Stage, Engine, entities, dependencies, tests, and recovery behavior.
3. Add or update tests.
4. Run `npm run check` and `npm test`.
5. Update documentation and changelog.
6. Open a pull request; never push unfinished work directly to `main`.

## Commit style

```text
feat(EDT-014): add camera grouping contract
fix(CORE-004): rollback failed SQLite transaction
docs(ADR-002): clarify PostgreSQL boundary
```
