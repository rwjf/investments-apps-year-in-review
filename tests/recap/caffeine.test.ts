import { describe, expect, it } from 'vitest';
import { estimateCaffeine } from '../../src/data/caffeine';

const timezone = 'America/New_York' as const;

describe('estimateCaffeine', () => {
  it('estimates the approved 300-calendar-day snapshot', () => {
    expect(estimateCaffeine({
      periodStart: '2026-01-01T05:00:00.000Z',
      cutoffExclusive: '2026-10-27T17:28:51.121Z',
      timezone,
    })).toEqual({
      calendarDays: 300,
      totalCaffeineMg: 180_000,
      totalCaffeineGrams: 180,
      coffeeLitres: 300,
      bathtubEquivalents: 1.5,
    });
  });

  it('counts an exact next-midnight cutoff without counting the following date', () => {
    expect(estimateCaffeine({
      periodStart: '2026-06-01T04:00:00.000Z',
      cutoffExclusive: '2026-06-02T04:00:00.000Z',
      timezone,
    })).toEqual({
      calendarDays: 1,
      totalCaffeineMg: 600,
      totalCaffeineGrams: 0.6,
      coffeeLitres: 1,
      bathtubEquivalents: 0.005,
    });
  });

  it('returns all zeroes for an empty interval', () => {
    expect(estimateCaffeine({
      periodStart: '2026-06-01T04:00:00.000Z',
      cutoffExclusive: '2026-06-01T04:00:00.000Z',
      timezone,
    })).toEqual({
      calendarDays: 0,
      totalCaffeineMg: 0,
      totalCaffeineGrams: 0,
      coffeeLitres: 0,
      bathtubEquivalents: 0,
    });
  });

  it('counts local calendar dates across the spring DST transition', () => {
    expect(estimateCaffeine({
      periodStart: '2026-03-07T18:00:00.000Z',
      cutoffExclusive: '2026-03-10T04:00:00.000Z',
      timezone,
    })).toMatchObject({
      calendarDays: 3,
      totalCaffeineMg: 1_800,
      totalCaffeineGrams: 1.8,
      coffeeLitres: 3,
    });
  });

  it('counts every date in a completed 2026 calendar year', () => {
    expect(estimateCaffeine({
      periodStart: '2026-01-01T05:00:00.000Z',
      cutoffExclusive: '2027-01-01T05:00:00.000Z',
      timezone,
    })).toEqual({
      calendarDays: 365,
      totalCaffeineMg: 219_000,
      totalCaffeineGrams: 219,
      coffeeLitres: 365,
      bathtubEquivalents: 1.825,
    });
  });

  it.each([
    ['invalid timestamp', 'not-a-date', '2026-06-02T04:00:00.000Z'],
    ['offsetless start', '2026-06-01T00:00:00', '2026-06-02T04:00:00.000Z'],
    ['offsetless cutoff', '2026-06-01T04:00:00.000Z', '2026-06-02T00:00:00'],
  ])('rejects an %s', (_description, periodStart, cutoffExclusive) => {
    expect(() => estimateCaffeine({ periodStart, cutoffExclusive, timezone })).toThrow();
  });

  it('rejects an inverted interval', () => {
    expect(() => estimateCaffeine({
      periodStart: '2026-06-02T04:00:00.000Z',
      cutoffExclusive: '2026-06-01T04:00:00.000Z',
      timezone,
    })).toThrow(/before|inverted/i);
  });
});
