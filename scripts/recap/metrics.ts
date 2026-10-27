import type { PublicSnapshot } from '../../src/data/schema';
import type { AlertRecord, IssueRecord, Period } from './model';
import { withinPeriod } from './period';

const WORK_TYPES = ['Task', 'Story', 'Bug', 'Subtask', 'Other'] as const;
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Unknown'] as const;

function workTypeLabel(name: string): typeof WORK_TYPES[number] {
  switch (name.toLowerCase()) {
    case 'task': return 'Task';
    case 'story': return 'Story';
    case 'bug': return 'Bug';
    case 'sub-task':
    case 'subtask': return 'Subtask';
    default: return 'Other';
  }
}

function severityLabel(severity: string): typeof SEVERITIES[number] {
  switch (severity.toLowerCase()) {
    case 'critical': return 'Critical';
    case 'high': return 'High';
    case 'medium': return 'Medium';
    case 'low': return 'Low';
    default: return 'Unknown';
  }
}

function aggregate(
  counts: Map<string, number>,
  labels: readonly string[],
): PublicSnapshot['metrics']['workItemsClosed'] {
  const breakdown = labels.map((label) => ({ label, count: counts.get(label) ?? 0 }))
    .filter((item) => item.count > 0);
  return {
    status: 'available',
    count: breakdown.reduce((total, item) => total + item.count, 0),
    breakdown,
  };
}

export function countWorkItems(
  records: IssueRecord[],
  period: Period,
  exclusions: { issueTypeIds: string[]; resolutionIds: string[] },
): PublicSnapshot['metrics']['workItemsClosed'] {
  const excludedTypes = new Set(exclusions.issueTypeIds);
  const excludedResolutions = new Set(exclusions.resolutionIds);
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  // Coverage and resolution/type mapping acceptance belong to collection orchestration.
  for (const record of records) {
    if (record.statusCategory !== 'done'
      || record.resolutionId === null
      || excludedTypes.has(record.issueTypeId)
      || excludedResolutions.has(record.resolutionId)
      || record.resolvedAt === null
      || !withinPeriod(record.resolvedAt, period)
      || seen.has(record.id)) {
      continue;
    }

    seen.add(record.id);
    const label = workTypeLabel(record.issueTypeName);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return aggregate(counts, WORK_TYPES);
}

export function countDependencyFixes(
  records: AlertRecord[],
  period: Period,
): PublicSnapshot['metrics']['dependencyAlertsFixed'] {
  const seen = new Set<string>();
  const counts = new Map<string, number>();

  for (const record of records) {
    if (record.state !== 'fixed'
      || record.fixedAt === null
      || !withinPeriod(record.fixedAt, period)) {
      continue;
    }

    const key = JSON.stringify([record.repositoryId, record.number]);
    if (seen.has(key)) continue;
    seen.add(key);
    const label = severityLabel(record.severity);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return aggregate(counts, SEVERITIES);
}
