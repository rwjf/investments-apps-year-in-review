import { z } from 'zod';

export const LINES_PER_PAGE = 40;
export const BOOK_PAGES = 1424;

const countSchema = z.number().int().nonnegative();

export const ScalarMetricSchema = z.union([
  z.object({ status: z.literal('available'), count: countSchema }).strict(),
  z.object({ status: z.literal('unavailable'), count: z.null() }).strict(),
]);
export type ScalarMetric = z.infer<typeof ScalarMetricSchema>;

export const PlayfulMetricsSchema = z.object({
  methodologyVersion: z.literal('known-generated-v1'),
  mergedPullRequests: ScalarMetricSchema,
  linesAdded: ScalarMetricSchema,
  linesRemoved: ScalarMetricSchema,
  botAuthoredPullRequests: ScalarMetricSchema,
  unknownAuthorPullRequests: countSchema,
}).strict().superRefine((metrics, context) => {
  if (metrics.linesAdded.status !== metrics.linesRemoved.status) {
    context.addIssue({ code: 'custom', path: ['linesRemoved'], message: 'Added and removed line availability must match' });
  }
  const merged = metrics.mergedPullRequests;
  const bots = metrics.botAuthoredPullRequests;
  if (merged.status === 'available') {
    if (metrics.unknownAuthorPullRequests > merged.count) {
      context.addIssue({ code: 'custom', path: ['unknownAuthorPullRequests'], message: 'Unknown-author PR count cannot exceed merged PR count' });
    }
    if (bots.status === 'available' && bots.count > merged.count) {
      context.addIssue({ code: 'custom', path: ['botAuthoredPullRequests'], message: 'Bot-authored PR count cannot exceed merged PR count' });
    }
  }
  if (bots.status === 'available' && metrics.unknownAuthorPullRequests > 0) {
    context.addIssue({ code: 'custom', path: ['botAuthoredPullRequests'], message: 'Exact bot count requires known authors for every PR' });
  }
});
export type PlayfulMetrics = z.infer<typeof PlayfulMetricsSchema>;

export function bookEquivalents(addedLines: number): number {
  return addedLines / LINES_PER_PAGE / BOOK_PAGES;
}

export function botShare(botCount: number, mergedCount: number): number | null {
  return mergedCount === 0 ? null : botCount / mergedCount;
}
