import { z } from 'zod';
import { DateTime } from 'luxon';
import { PlayfulMetricsSchema } from './playful';

const timestampSchema = z.iso.datetime({ offset: true }).refine(
  (value) => Number.isFinite(Date.parse(value)),
  'Expected a valid ISO timestamp',
);

const breakdownItemSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
}).strict();

const metricSchema = z.object({
  status: z.enum(['available', 'unavailable']),
  count: z.number().int().nonnegative().nullable(),
  breakdown: z.array(breakdownItemSchema),
}).strict().superRefine((metric, context) => {
  if (metric.status === 'unavailable') {
    if (metric.count !== null) {
      context.addIssue({ code: 'custom', path: ['count'], message: 'Unavailable counts must be null' });
    }
    if (metric.breakdown.length > 0) {
      context.addIssue({ code: 'custom', path: ['breakdown'], message: 'Unavailable metrics cannot include a breakdown' });
    }
    return;
  }

  if (metric.count === null) {
    context.addIssue({ code: 'custom', path: ['count'], message: 'Available counts cannot be null' });
    return;
  }

  const breakdownTotal = metric.breakdown.reduce((total, item) => total + item.count, 0);
  if (breakdownTotal !== metric.count) {
    context.addIssue({ code: 'custom', path: ['breakdown'], message: 'Breakdown counts must reconcile to the metric count' });
  }
});

const snapshotBaseSchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['demo', 'real']),
  year: z.number().int().min(1).max(9999),
  timezone: z.literal('America/New_York'),
  periodStart: timestampSchema,
  periodEndExclusive: timestampSchema,
  cutoffExclusive: timestampSchema,
  collectedAt: timestampSchema,
  isYearToDate: z.boolean(),
  metrics: z.object({
    dependencyAlertsFixed: metricSchema,
    productionDeployments: metricSchema,
    workItemsClosed: metricSchema,
  }).strict(),
  coverage: z.object({
    scope: z.enum(['verified-organization', 'accessible-repositories']),
    notes: z.array(z.string()),
  }).strict(),
}).strict();

function validatePeriod(snapshot: Omit<z.infer<typeof snapshotBaseSchema>, 'schemaVersion'>, context: z.RefinementCtx) {
  const start = Date.parse(snapshot.periodStart);
  const end = Date.parse(snapshot.periodEndExclusive);
  const cutoff = Date.parse(snapshot.cutoffExclusive);
  const expectedStart = DateTime.fromObject(
    { year: snapshot.year, month: 1, day: 1 },
    { zone: snapshot.timezone },
  ).toMillis();
  const expectedEnd = DateTime.fromObject(
    { year: snapshot.year + 1, month: 1, day: 1 },
    { zone: snapshot.timezone },
  ).toMillis();

  if (start !== expectedStart) {
    context.addIssue({ code: 'custom', path: ['periodStart'], message: 'Period start must be the declared year start in the reporting timezone' });
  }
  if (end !== expectedEnd) {
    context.addIssue({ code: 'custom', path: ['periodEndExclusive'], message: 'Period end must be the exclusive start of the following year in the reporting timezone' });
  }
  if (!(start < end && cutoff >= start && cutoff <= end)) {
    context.addIssue({ code: 'custom', path: ['cutoffExclusive'], message: 'Period boundaries must be ordered and cutoff must be within the period' });
  }
  if (snapshot.isYearToDate !== (cutoff < end)) {
    context.addIssue({ code: 'custom', path: ['isYearToDate'], message: 'Year-to-date flag must match the period cutoff' });
  }
}

export const PublicSnapshotV1Schema = snapshotBaseSchema.superRefine(validatePeriod);
export const PublicSnapshotV2Schema = snapshotBaseSchema.extend({
  schemaVersion: z.literal(2),
  playful: PlayfulMetricsSchema,
}).superRefine(validatePeriod);

export const PublicSnapshotSchema = z.union([PublicSnapshotV1Schema, PublicSnapshotV2Schema]);

export type PublicSnapshotV1 = z.infer<typeof PublicSnapshotV1Schema>;
export type PublicSnapshotV2 = z.infer<typeof PublicSnapshotV2Schema>;
export type PublicSnapshot = z.infer<typeof PublicSnapshotSchema>;
