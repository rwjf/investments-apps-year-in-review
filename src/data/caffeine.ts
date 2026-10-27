import { DateTime } from 'luxon';

export const DEVELOPER_COUNT = 4;
export const CAFFEINE_MG_PER_DEVELOPER_PER_DAY = 150;
export const CAFFEINE_MG_PER_COFFEE = 150;
export const COFFEE_ML_PER_CUP = 250;
export const BATHTUB_LITRES = 200;

export interface CaffeineEstimateInput {
  periodStart: string;
  cutoffExclusive: string;
  timezone: 'America/New_York';
}

export interface CaffeineEstimate {
  calendarDays: number;
  totalCaffeineMg: number;
  totalCaffeineGrams: number;
  coffeeLitres: number;
  bathtubEquivalents: number;
}

const hasExplicitOffset = (value: string) => /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);

const parseTimestamp = (value: string, field: string, timezone: string) => {
  if (!hasExplicitOffset(value)) {
    throw new RangeError(`${field} must include an explicit UTC offset.`);
  }

  const parsed = DateTime.fromISO(value, { setZone: true });
  if (!parsed.isValid) {
    throw new RangeError(`${field} must be a valid ISO timestamp.`);
  }

  return parsed.setZone(timezone);
};

export function estimateCaffeine({ periodStart, cutoffExclusive, timezone }: CaffeineEstimateInput): CaffeineEstimate {
  const start = parseTimestamp(periodStart, 'periodStart', timezone);
  const cutoff = parseTimestamp(cutoffExclusive, 'cutoffExclusive', timezone);

  if (cutoff.toMillis() < start.toMillis()) {
    throw new RangeError('cutoffExclusive cannot be before periodStart.');
  }

  let calendarDays = 0;
  if (cutoff.toMillis() > start.toMillis()) {
    const dateDistance = cutoff.startOf('day').diff(start.startOf('day'), 'days').days;
    const cutoffIsMidnight = cutoff.toMillis() === cutoff.startOf('day').toMillis();
    calendarDays = dateDistance + (cutoffIsMidnight ? 0 : 1);
  }

  const totalCaffeineMg = calendarDays * DEVELOPER_COUNT * CAFFEINE_MG_PER_DEVELOPER_PER_DAY;
  const coffeeLitres = (totalCaffeineMg / CAFFEINE_MG_PER_COFFEE) * (COFFEE_ML_PER_CUP / 1000);

  return {
    calendarDays,
    totalCaffeineMg,
    totalCaffeineGrams: totalCaffeineMg / 1000,
    coffeeLitres,
    bathtubEquivalents: coffeeLitres / BATHTUB_LITRES,
  };
}
