import { PlayfulMetricsSchema, type PlayfulMetrics, type ScalarMetric } from '../../src/data/playful';
import { CODE_POLICY_VERSION, isExcludedCodePath } from './code-policy';
import type { Period } from './model';
import { withinPeriod } from './period';
import type { MergedPullRequestRecord } from './pull-request-model';

function dataQualityError(): Error {
  return new Error('Pull-request data quality error');
}

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function fingerprint(record: MergedPullRequestRecord): string {
  // Explicit fields avoid object-property ordering differences between source pages.
  return JSON.stringify([record.repositoryId, record.number, record.mergedAt, record.authorType,
    record.reportedAdditions, record.reportedDeletions, record.changedFiles, record.filesComplete,
    record.files.map((file) => [file.path, file.additions, file.deletions])]);
}

export function countPullRequestActivity(records: MergedPullRequestRecord[], period: Period): PlayfulMetrics {
  const seen = new Map<string, string>();
  let merged = 0;
  let added = 0;
  let removed = 0;
  let bots = 0;
  let unknown = 0;
  let filesComplete = true;

  for (const record of records) {
    if (!record.repositoryId || !validCount(record.number) || record.number === 0
      || ![record.reportedAdditions, record.reportedDeletions, record.changedFiles].every(validCount)
      || record.files.some((file) => !file.path || !validCount(file.additions) || !validCount(file.deletions))) {
      throw dataQualityError();
    }
    const key = JSON.stringify([record.repositoryId, record.number]);
    const value = fingerprint(record);
    const previous = seen.get(key);
    if (previous !== undefined) {
      if (previous !== value) throw dataQualityError();
      continue;
    }
    seen.set(key, value);

    let inPeriod: boolean;
    try {
      inPeriod = withinPeriod(record.mergedAt, period);
    } catch {
      // Source timestamps and identifiers must not leak into public-facing errors.
      throw dataQualityError();
    }
    if (!inPeriod) continue;
    merged++;
    if (record.authorType === 'Bot') bots++;
    else if (record.authorType !== 'User') unknown++;

    const additions = record.files.reduce((total, file) => total + file.additions, 0);
    const deletions = record.files.reduce((total, file) => total + file.deletions, 0);
    if (!record.filesComplete || record.changedFiles !== record.files.length
      || new Set(record.files.map((file) => file.path)).size !== record.files.length
      || additions !== record.reportedAdditions || deletions !== record.reportedDeletions) {
      filesComplete = false;
    }
    for (const file of record.files) {
      if (isExcludedCodePath(file.path)) continue;
      added += file.additions;
      removed += file.deletions;
    }
  }

  const available = (count: number): ScalarMetric => ({ status: 'available', count });
  const unavailable: ScalarMetric = { status: 'unavailable', count: null };
  // No filtered/unfiltered fallback: one incomplete intended file set blocks both line totals.
  const result = {
    methodologyVersion: CODE_POLICY_VERSION,
    mergedPullRequests: available(merged),
    linesAdded: filesComplete ? available(added) : unavailable,
    linesRemoved: filesComplete ? available(removed) : unavailable,
    botAuthoredPullRequests: unknown === 0 ? available(bots) : unavailable,
    unknownAuthorPullRequests: unknown,
  };
  if (!PlayfulMetricsSchema.safeParse(result).success) throw dataQualityError();
  return result;
}
