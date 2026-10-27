import { DateTime } from 'luxon';
import type { Period } from './model';

const TIMEZONE = 'America/New_York' as const;
const EXPLICIT_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;

function parseInstant(instant: string): DateTime {
  if (!instant.includes('T') || !EXPLICIT_OFFSET.test(instant)) {
    throw new RangeError(`Timestamp must include an explicit timezone offset: ${instant}`);
  }

  const parsed = DateTime.fromISO(instant, { setZone: true });
  if (!parsed.isValid) {
    throw new RangeError(`Invalid timestamp: ${instant}`);
  }
  return parsed;
}

function toUtcIso(instant: DateTime): string {
  const iso = instant.toUTC().toISO();
  if (iso === null) {
    throw new RangeError('Timestamp cannot be represented as ISO');
  }
  return iso;
}

export function makePeriod(year: number, asOf: string): Period {
  if (!Number.isInteger(year) || year < 1 || year > 9999) {
    throw new RangeError('Year must be an integer between 1 and 9999');
  }

  const cutoff = parseInstant(asOf);
  const start = DateTime.fromObject({ year, month: 1, day: 1 }, { zone: TIMEZONE });
  const endExclusive = start.plus({ years: 1 });
  const effectiveCutoff = cutoff > endExclusive ? endExclusive : cutoff;

  return {
    start: toUtcIso(start),
    endExclusive: toUtcIso(endExclusive),
    cutoffExclusive: toUtcIso(effectiveCutoff),
    timezone: TIMEZONE,
  };
}

export function withinPeriod(instant: string, period: Period): boolean {
  const value = parseInstant(instant).toMillis();
  return value >= parseInstant(period.start).toMillis()
    && value < parseInstant(period.cutoffExclusive).toMillis();
}

export function monthKey(instant: string, period: Period): string {
  const month = parseInstant(instant).setZone(period.timezone);
  return month.toFormat('yyyy-MM');
}
