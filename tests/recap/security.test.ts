import { describe, expect, it } from 'vitest';
import { countDependencyFixes } from '../../scripts/recap/metrics';
import type { AlertRecord } from '../../scripts/recap/model';
import { makePeriod } from '../../scripts/recap/period';

const period = makePeriod(2026, '2026-10-27T16:00:00Z');

function alert(overrides: Partial<AlertRecord> = {}): AlertRecord {
  return {
    repositoryId: 'synthetic-repo', number: 1, state: 'fixed',
    fixedAt: '2026-04-01T12:00:00Z', severity: 'high', ...overrides,
  };
}

describe('fixed dependency alert metrics', () => {
  it('deduplicates by repository ID and numeric alert number, not either field alone', () => {
    expect(countDependencyFixes([
      alert(), alert(), alert({ repositoryId: 'second-repo' }), alert({ number: 2 }),
    ], period)).toEqual({ status: 'available', count: 3, breakdown: [{ label: 'High', count: 3 }] });
  });

  it.each([
    ['dismissed even with a fix timestamp', { state: 'dismissed' }],
    ['open even with a fix timestamp', { state: 'open' }],
    ['other nonfixed state', { state: 'auto_dismissed' }],
    ['missing fix timestamp', { fixedAt: null }],
    ['before New York year start', { fixedAt: '2026-01-01T04:59:59.999Z' }],
    ['at cutoff', { fixedAt: '2026-10-27T16:00:00Z' }],
    ['after cutoff', { fixedAt: '2026-12-01T12:00:00Z' }],
  ] satisfies [string, Partial<AlertRecord>][])('excludes %s', (_name, overrides) => {
    expect(countDependencyFixes([alert(), alert({ number: 2, ...overrides })], period).count).toBe(1);
  });

  it('includes the year start and the instant just before the cutoff', () => {
    expect(countDependencyFixes([
      alert({ fixedAt: '2026-01-01T00:00:00-05:00' }),
      alert({ number: 2, fixedAt: '2026-10-27T15:59:59.999Z' }),
    ], period).count).toBe(2);
  });

  it('excludes the next New York year start for a completed year', () => {
    const fullYear = makePeriod(2026, '2027-02-01T00:00:00Z');
    expect(countDependencyFixes([
      alert({ fixedAt: '2027-01-01T04:59:59.999Z' }),
      alert({ number: 2, fixedAt: '2027-01-01T00:00:00-05:00' }),
    ], fullYear).count).toBe(1);
  });

  it('emits only canonical severity labels and reconciles unknown severities', () => {
    const severities = ['critical', 'HIGH', 'Medium', 'low', 'private vulnerability detail', ''];
    const result = countDependencyFixes(severities.map((severity, index) => alert({
      number: index + 1, severity,
    })), period);
    expect(result).toEqual({
      status: 'available', count: 6,
      breakdown: [
        { label: 'Critical', count: 1 }, { label: 'High', count: 1 }, { label: 'Medium', count: 1 },
        { label: 'Low', count: 1 }, { label: 'Unknown', count: 2 },
      ],
    });
    expect(result.breakdown.reduce((sum, item) => sum + item.count, 0)).toBe(result.count);
  });

  it('returns an available zero for a trusted complete empty set', () => {
    expect(countDependencyFixes([], period)).toEqual({ status: 'available', count: 0, breakdown: [] });
  });

  it('does not mutate source records', () => {
    const records = [alert(), alert()];
    const before = structuredClone(records);
    countDependencyFixes(records, period);
    expect(records).toEqual(before);
  });
});
