# Task 3 implementation report

## Scope and baseline

- Status: DONE.
- Working directory: `/Users/angelomarano/code/rwjf/year-in-review`.
- Branch verified: `feat/team-recap`; starting HEAD: `207b71c`.
- Read `task-3-brief.md` and `contracts.md` before inspecting implementation files.
- Implemented only the two pure Jira/Dependabot reducers and their focused synthetic tests. No deployment reducer, API reads, orchestration, UI, CLI, configuration, dependency, or shared-contract changes.

## Files

- `scripts/recap/metrics.ts`: exports the exact `countWorkItems` and `countDependencyFixes` interfaces using existing normalized records, `Period`, `PublicSnapshot` metric types, and `withinPeriod`.
- `tests/recap/work-items.test.ts`: 17 tests, including table-driven exclusion cases.
- `tests/recap/security.test.ts`: 13 tests, including table-driven nonfixed/out-of-period cases.
- `.superpowers/sdd/2026-10-27-team-recap/task-3-report.md`: this implementation evidence and handoff.
- Synthetic fixture builders live inside the two test files; no external source records or live-derived dates were used.

## Verification plan and ownership

The focused tests exercise the real pure reducers with literal expected counts and breakdowns. Important failure modes are duplicate entities, wrong identity keys, reopened/nonfixed states, incorrectly guessed exclusions, leaked labels, dropped subtasks, and inclusive/exclusive instant mistakes. Boundary fixtures cover the New York year start, exclusive cutoff, and completed-year exclusive end, including explicit offset equivalence.

Task 3 owns this deterministic reducer evidence. The parent owns the full suite, review, and later integration checks. Completeness, resolution-mapping acceptance, publication gates, and actual organization coverage cannot be established by these reducers or synthetic tests and remain outside this task.

## RED evidence

Tests were written before reducer implementation.

Command (used unchanged for all RED/GREEN runs):

```sh
npx vitest run tests/recap/work-items.test.ts tests/recap/security.test.ts
```

1. Initial run with no `metrics.ts`: exit 1, `Test Files 2 failed (2)`, `Tests no tests`. Both suites reported `Cannot find module '../../scripts/recap/metrics'`. This established the absent module but was not counted as assertion-level RED.
2. Added only type-correct zero-return reducer stubs and reran: exit 1, `Test Files 2 failed (2)`, `Tests 25 failed | 5 passed (30)`.
   - Work items: 14 assertion failures / 17 tests.
   - Security: 11 assertion failures / 13 tests.
   - Representative assertions: unique issue IDs expected count 2 but received 0; repository-ID/alert-number identity expected count 3 but received 0; work-type/severity canonical breakdowns expected populated aggregates but received empty arrays.
   - Empty-input, mutation, and explicit-subtask-exclusion checks passed against stubs; meaningful positive/control fixtures made all 25 counting assertions fail before implementation.

## GREEN evidence

After implementing the reducers, the identical command exited 0:

```text
Test Files  2 passed (2)
     Tests  30 passed (30)
  Duration  194ms
```

Also ran `git diff --check`: exit 0, no whitespace diagnostics. Full-suite/build checks were intentionally not run because the delegation assigns them to the parent.

## Behavior and self-review

- Work items require normalized `statusCategory === 'done'`, a non-null resolution ID, a non-null in-period resolution timestamp, and IDs absent from the explicit exclusion sets. Type names never determine exclusion.
- Unique issue IDs count once even if repeated records identify different projects.
- Canonical labels are emitted in stable order: Task, Story, Bug, Subtask, Other. Case-insensitive known names are mapped explicitly; both `Sub-task` and `Subtask` map to Subtask. All other source type names, including a nonexcluded type named Epic, map to Other rather than becoming arbitrary public labels.
- Subtasks contribute unless their actual type ID is explicitly excluded.
- Dependency fixes require `state === 'fixed'` and a non-null in-period `fixedAt`. Dismissed, open, and other nonfixed states never count even with a timestamp.
- Alert identity is a serialized `[repositoryId, number]` tuple, avoiding collisions from ambiguous delimiter concatenation and keeping equal alert numbers in different repositories separate.
- Canonical severity labels are Critical, High, Medium, Low, Unknown; unexpected/empty severities map to Unknown, never raw source text.
- Only aggregate `{ status, count, breakdown }` objects are returned. Counts are derived from emitted buckets, so breakdowns reconcile by construction; tests independently assert exact expected distributions and sums.
- Zero-count buckets are omitted; a trusted complete empty input yields available zero with an empty breakdown. No reducer makes coverage claims or converts failures into zero. Existing shared timestamp parsing errors propagate rather than being swallowed.
- No mutation of records, exclusions, or period; test assertions cover record/exclusion preservation.
- No dependencies or architecture changes; existing import/formatting conventions retained. No push, publication, subagents, or remote integrations performed.

## Concerns / handoff

- No task-blocking concerns identified.
- Caller must supply the trusted complete normalized set and gate unknown resolution mappings outside these reducers, as delegated. Duplicate eligible identities contribute only once; reducers do not attempt to reconstruct history from conflicting source snapshots.
- Task 4 may extend `scripts/recap/metrics.ts` with deployment counting; no deployment reducer or placeholder was introduced here.
- `.superpowers` is ignored in this repository; this specific requested report is force-added explicitly, not the directory or unrelated artifacts.
