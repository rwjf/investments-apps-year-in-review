import { describe, expect, it } from 'vitest';
import * as metrics from '../../scripts/recap/pull-request-metrics';
import type { MergedPullRequestRecord } from '../../scripts/recap/pull-request-model';
import { makePeriod } from '../../scripts/recap/period';

const period = makePeriod(2026, '2026-10-27T17:28:51.121Z');
function pr(overrides: Partial<MergedPullRequestRecord> = {}): MergedPullRequestRecord {
  return { repositoryId: 'private-repo', number: 1, mergedAt: '2026-01-01T05:00:00Z', authorType: 'User',
    reportedAdditions: 104, reportedDeletions: 22, changedFiles: 2, filesComplete: true,
    files: [{ path: 'src/main.ts', additions: 4, deletions: 2 }, { path: 'web/package-lock.json', additions: 100, deletions: 20 }],
    ...overrides };
}
function count(records: MergedPullRequestRecord[]) {
  expect(metrics.countPullRequestActivity).toBeTypeOf('function');
  return metrics.countPullRequestActivity(records, period);
}

describe('pure merged pull-request activity', () => {
  it('counts exact duplicates once per repo and number, retaining cross-repository identities', () => {
    const record = pr();
    const records = [record, structuredClone(record), pr({ repositoryId: 'other', authorType: 'Bot' })];
    const before = structuredClone(records);
    const result = count(records);
    expect(result).toEqual({ methodologyVersion: 'known-generated-v1', mergedPullRequests: { status: 'available', count: 2 },
      linesAdded: { status: 'available', count: 8 }, linesRemoved: { status: 'available', count: 4 },
      botAuthoredPullRequests: { status: 'available', count: 1 }, unknownAuthorPullRequests: 0 });
    expect(records).toEqual(before);
  });

  it.each(['authorType', 'mergedAt', 'reportedAdditions', 'reportedDeletions', 'changedFiles', 'filesComplete', 'files'] as const)('rejects conflicting duplicate %s without echoing private data', (field) => {
    const record = pr();
    const conflict = { ...record, [field]: { authorType: 'Bot', mergedAt: '2026-01-02T05:00:00Z',
      reportedAdditions: 105, reportedDeletions: 23, changedFiles: 3, filesComplete: false, files: [] }[field] };
    expect(metrics.countPullRequestActivity).toBeTypeOf('function');
    expect(() => metrics.countPullRequestActivity([record, conflict], period)).toThrow(/data quality/i);
    expect(() => metrics.countPullRequestActivity([record, conflict], period)).not.toThrow('private-repo');
  });

  it('counts the Eastern start but excludes before-start and exact cutoff merges', () => {
    const result = count([
      pr({ number: 1, mergedAt: '2026-01-01T04:59:59.999Z' }),
      pr({ number: 2, mergedAt: '2026-01-01T00:00:00-05:00' }),
      pr({ number: 3, mergedAt: '2026-10-27T13:28:51.120-04:00' }),
      pr({ number: 4, mergedAt: '2026-10-27T13:28:51.121-04:00' }),
      pr({ number: 5, mergedAt: '2027-01-01T05:00:00Z' }),
    ]);
    expect(result.mergedPullRequests.count).toBe(2);
  });

  it('counts unknown PRs, never treats deleted or unexpected actors as humans', () => {
    const result = count([pr({ number: 1, authorType: null }), pr({ number: 2, authorType: null }),
      pr({ number: 3, authorType: 'Organization' }), pr({ number: 4, authorType: 'Bot' })]);
    expect(result.unknownAuthorPullRequests).toBe(3);
    expect(result.botAuthoredPullRequests).toEqual({ status: 'unavailable', count: null });
    expect(result.mergedPullRequests.count).toBe(4);
    expect(result.linesAdded.count).toBe(16);
  });

  it('includes human and bot docs/tests/config lines rather than net or unfiltered lines', () => {
    const files = [{ path: 'docs/guide.md', additions: 3, deletions: 9 },
      { path: 'tests/main.test.ts', additions: 2, deletions: 1 }, { path: '.github/config.yml', additions: 1, deletions: 1 }];
    const result = count([pr({ files, changedFiles: 3, reportedAdditions: 6, reportedDeletions: 11 }),
      pr({ number: 2, authorType: 'Bot' })]);
    expect(result.linesAdded.count).toBe(10);
    expect(result.linesRemoved.count).toBe(13);
  });

  it.each([
    { filesComplete: false }, { changedFiles: 3 }, { reportedAdditions: 999 }, { reportedDeletions: 999 },
  ])('makes both line totals unavailable for any incomplete intended files %j', (overrides) => {
    const result = count([pr(), pr({ number: 2, ...overrides })]);
    expect(result.mergedPullRequests.count).toBe(2);
    expect(result.linesAdded).toEqual({ status: 'unavailable', count: null });
    expect(result.linesRemoved).toEqual({ status: 'unavailable', count: null });
  });

  it('ignores incomplete out-of-window files and returns genuine zeroes for an empty period', () => {
    const result = count([pr({ mergedAt: period.cutoffExclusive, filesComplete: false })]);
    expect(result.mergedPullRequests).toEqual({ status: 'available', count: 0 });
    expect(result.linesAdded).toEqual({ status: 'available', count: 0 });
    expect(result.linesRemoved).toEqual({ status: 'available', count: 0 });
    expect(result.botAuthoredPullRequests).toEqual({ status: 'available', count: 0 });
    expect(result.unknownAuthorPullRequests).toBe(0);
  });

  it.each([-1, 0.5, Infinity, NaN])('rejects invalid private line counts %s', (additions) => {
    expect(metrics.countPullRequestActivity).toBeTypeOf('function');
    expect(() => metrics.countPullRequestActivity([pr({ files: [{ path: 'src/main.ts', additions, deletions: 0 }] })], period)).toThrow(/data quality/i);
  });
});
