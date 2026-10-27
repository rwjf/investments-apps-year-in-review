import { describe, expect, it } from 'vitest';
import { PublicSnapshotSchema } from '../../src/data/schema';
import demo from '../../src/data/demo.json';

function validDemo() {
  const metric = { status: 'available', count: 1, breakdown: [{ label: 'General', count: 1 }] };
  return {
    schemaVersion: 1,
    mode: 'demo',
    year: 2026,
    timezone: 'America/New_York',
    periodStart: '2026-01-01T05:00:00Z',
    periodEndExclusive: '2027-01-01T05:00:00Z',
    cutoffExclusive: '2026-10-27T16:00:00Z',
    collectedAt: '2026-10-27T16:00:00Z',
    isYearToDate: true,
    metrics: {
      dependencyAlertsFixed: metric,
      productionDeployments: metric,
      workItemsClosed: metric,
    },
    coverage: { scope: 'verified-organization', notes: ['Illustrative example only'] },
  };
}

function withNestedExtraField(snapshot: ReturnType<typeof validDemo>, field: string) {
  return {
    ...snapshot,
    metrics: {
      ...snapshot.metrics,
      workItemsClosed: {
        ...snapshot.metrics.workItemsClosed,
        breakdown: [{ ...snapshot.metrics.workItemsClosed.breakdown[0], [field]: 'secret-value' }],
      },
    },
  };
}

describe('PublicSnapshotSchema', () => {
  it('accepts the explicitly illustrative unavailable demo snapshot', () => {
    expect(PublicSnapshotSchema.safeParse(demo).success).toBe(true);
  });

  it('rejects undeclared top-level fields that could expose source identifiers', () => {
    expect(PublicSnapshotSchema.safeParse({ ...validDemo(), repository: 'private-name' }).success).toBe(false);
  });

  it('rejects undeclared fields at any nested level', () => {
    expect(PublicSnapshotSchema.safeParse(withNestedExtraField(validDemo(), 'token')).success).toBe(false);
  });

  it.each([-1, 1.5])('rejects invalid counts: %s', (count) => {
    const snapshot = validDemo();
    snapshot.metrics.workItemsClosed = { status: 'available', count, breakdown: [] };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('rejects breakdowns that do not reconcile with the count', () => {
    const snapshot = validDemo();
    snapshot.metrics.workItemsClosed = {
      status: 'available',
      count: 2,
      breakdown: [{ label: 'General', count: 1 }],
    };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('rejects invalid timestamps', () => {
    expect(PublicSnapshotSchema.safeParse({ ...validDemo(), collectedAt: 'not-a-timestamp' }).success).toBe(false);
  });

  it('rejects unavailable metrics that carry a numeric zero', () => {
    const snapshot = validDemo();
    snapshot.metrics.workItemsClosed = { status: 'unavailable', count: 0, breakdown: [] };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });
});
