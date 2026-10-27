import { z } from 'zod';
import { PublicSnapshotSchema, type PublicSnapshot } from '../../src/data/schema';
import type { CoverageReport } from './model';
import { digest } from './artifacts';

export const ACCESSIBLE_SCOPE_NOTE = 'Limited to accessible sources; independent organization inventory or project visibility was not verified.';
export const DEMO_NOTE = 'Illustrative example only; no source data was collected.';
export const METRIC_KEYS = ['dependencyAlertsFixed', 'productionDeployments', 'workItemsClosed'] as const;

const coverageSchema = z.object({
  complete: z.boolean(), inventoryVerified: z.boolean(),
  issues: z.array(z.object({ source: z.string(), identifier: z.string(),
    reason: z.enum(['denied', 'failed', 'inaccessible', 'pagination', 'inventory', 'mapping']) }).strict()),
  sourceChecks: z.array(z.object({ source: z.string(),
    status: z.enum(['success', 'empty', 'disabled', 'denied', 'failed']) }).strict()),
}).strict();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const ReviewReportV1Schema = z.object({
  schemaVersion: z.literal(1), candidateHash: hashSchema, jiraExclusionsConfirmed: z.boolean(),
  metrics: z.object({ dependencyAlertsFixed: coverageSchema, productionDeployments: coverageSchema,
    workItemsClosed: coverageSchema }).strict(),
}).strict();
export const ReviewReportV2Schema = ReviewReportV1Schema.extend({
  schemaVersion: z.literal(2), playfulCoverage: coverageSchema,
}).strict();
export const ReviewReportSchema = z.union([ReviewReportV1Schema, ReviewReportV2Schema]);
export type ReviewReport = z.infer<typeof ReviewReportSchema>;
export type VersionedReviewReport = ReviewReport;

export const ReceiptSchema = z.object({
  schemaVersion: z.literal(1), confirmReviewed: z.literal(true), acknowledgeAccessibleScope: z.boolean(),
  approvedAt: z.iso.datetime(), candidateHash: hashSchema, coverageHash: hashSchema, approvedHash: hashSchema,
}).strict();

/** Only independent inventory/visibility uncertainty is waivable; never a failed read. */
export function readableCoverage(coverage: CoverageReport): boolean {
  return coverage.sourceChecks.length > 0
    && coverage.sourceChecks.every((check) => check.status === 'success' || check.status === 'empty')
    && coverage.issues.every((issue) => issue.reason === 'inventory'
      && (issue.source === 'github-inventory' || issue.source === 'jira-project-visibility'))
    && (coverage.complete || coverage.issues.length > 0);
}

export function publicCoverage(metrics: ReviewReport['metrics'], playfulCoverage?: CoverageReport): PublicSnapshot['coverage'] {
  const coverage = [...METRIC_KEYS.map((key) => metrics[key]), ...(playfulCoverage ? [playfulCoverage] : [])];
  const verified = coverage.every((entry) => entry.complete && entry.inventoryVerified && entry.issues.length === 0);
  return verified ? { scope: 'verified-organization', notes: [] }
    : { scope: 'accessible-repositories', notes: [ACCESSIBLE_SCOPE_NOTE] };
}

export function parseCuratedSnapshot(value: unknown): PublicSnapshot {
  const snapshot = PublicSnapshotSchema.parse(value);
  if (snapshot.year !== 2026) throw new Error('Unsupported reporting year');
  const labels = {
    dependencyAlertsFixed: ['Critical', 'High', 'Medium', 'Low', 'Unknown'],
    productionDeployments: Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`),
    workItemsClosed: ['Task', 'Story', 'Bug', 'Subtask', 'Other'],
  };
  for (const key of METRIC_KEYS) {
    const metric = snapshot.metrics[key];
    let previous = -1;
    for (const item of metric.breakdown) {
      const position = labels[key].indexOf(item.label);
      if (position <= previous || (key !== 'productionDeployments' && item.count === 0)) {
        throw new Error('Noncanonical aggregate labels');
      }
      previous = position;
    }
    if (key === 'productionDeployments' && metric.status === 'available' && metric.breakdown.length !== 12) {
      throw new Error('Incomplete month breakdown');
    }
  }
  const notes = snapshot.coverage.notes;
  const expected = snapshot.mode === 'demo' ? [DEMO_NOTE]
    : snapshot.coverage.scope === 'accessible-repositories' ? [ACCESSIBLE_SCOPE_NOTE] : [];
  if (JSON.stringify(notes) !== JSON.stringify(expected)) throw new Error('Noncanonical coverage notes');
  return snapshot;
}

/** Public-data readiness only; this does not verify private source reads or inventory. */
export function validatePublicReadiness(snapshot: PublicSnapshot, acknowledge: boolean): void {
  if (snapshot.mode !== 'real' || METRIC_KEYS.some((key) => snapshot.metrics[key].status !== 'available')) {
    throw new Error('Required source is unavailable');
  }
  if (snapshot.schemaVersion === 2
    && (snapshot.playful.mergedPullRequests.status !== 'available'
      || snapshot.playful.linesAdded.status !== 'available'
      || snapshot.playful.linesRemoved.status !== 'available'
      || snapshot.playful.botAuthoredPullRequests.status !== 'available'
      || snapshot.playful.unknownAuthorPullRequests !== 0)) {
    throw new Error('Required source is unavailable');
  }
  if (snapshot.coverage.scope !== 'verified-organization' && !acknowledge) {
    throw new Error('Accessible scope acknowledgment required');
  }
}

export function validateReviewInputs(candidateText: string, coverageText: string, acknowledge: boolean): PublicSnapshot {
  const snapshot = parseCuratedSnapshot(JSON.parse(candidateText));
  const report = ReviewReportSchema.parse(JSON.parse(coverageText));
  if (snapshot.mode !== 'real' || snapshot.schemaVersion !== report.schemaVersion || report.candidateHash !== digest(candidateText)
    || !report.jiraExclusionsConfirmed) throw new Error('Invalid review inputs');
  if (JSON.stringify(snapshot.coverage) !== JSON.stringify(publicCoverage(report.metrics,
    report.schemaVersion === 2 ? report.playfulCoverage : undefined))) {
    throw new Error('Coverage mismatch');
  }
  for (const key of METRIC_KEYS) {
    if (!readableCoverage(report.metrics[key])) {
      throw new Error('Required source is unavailable');
    }
  }
  if (snapshot.schemaVersion === 2 && report.schemaVersion === 2) {
    if (!readableCoverage(report.playfulCoverage)) {
      throw new Error('Required source is unavailable');
    }
  }
  validatePublicReadiness(snapshot, acknowledge);
  return snapshot;
}
