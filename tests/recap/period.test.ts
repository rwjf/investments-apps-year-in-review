import { describe, expect, it } from 'vitest';
import { makePeriod, monthKey, withinPeriod } from '../../scripts/recap/period';

function fullYear() {
  return makePeriod(2026, '2027-01-01T05:00:00Z');
}

describe('reporting period', () => {
  it('uses the inclusive New York year start and exclusive end', () => {
    expect(withinPeriod('2026-01-01T04:59:59Z', fullYear())).toBe(false);
    expect(withinPeriod('2026-01-01T05:00:00Z', fullYear())).toBe(true);
    expect(withinPeriod('2027-01-01T05:00:00Z', fullYear())).toBe(false);
  });

  it('excludes the collection cutoff instant', () => {
    expect(withinPeriod('2026-10-27T16:00:00Z', makePeriod(2026, '2026-10-27T16:00:00Z'))).toBe(false);
  });

  it('assigns instants to months in the reporting timezone', () => {
    expect(monthKey('2026-07-01T03:30:00Z', fullYear())).toBe('2026-06');
  });

  it('rejects invalid years, cutoffs, and instants', () => {
    expect(() => makePeriod(2026.5, '2026-10-27T16:00:00Z')).toThrow();
    expect(() => makePeriod(2026, 'not-a-timestamp')).toThrow();
    expect(() => monthKey('not-a-timestamp', fullYear())).toThrow();
  });

  it('rejects date-only and offset-less values anywhere an instant is required', () => {
    expect(() => makePeriod(2026, '2026-10-27')).toThrow();
    expect(() => makePeriod(2026, '2026-10-27T16:00:00')).toThrow();
    expect(() => withinPeriod('2026-01-01T05:00:00', fullYear())).toThrow();
    expect(() => monthKey('2026-07-01T03:30:00', fullYear())).toThrow();
  });
});
