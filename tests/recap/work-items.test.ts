import { describe, expect, it } from 'vitest';
import { countWorkItems } from '../../scripts/recap/metrics';
import type { IssueRecord } from '../../scripts/recap/model';
import { makePeriod } from '../../scripts/recap/period';

const period = makePeriod(2026, '2026-10-27T16:00:00Z');
const exclusions = { issueTypeIds: ['epic-id'], resolutionIds: ['canceled-id', 'duplicate-id'] };

function issue(overrides: Partial<IssueRecord> = {}): IssueRecord {
  return {
    id: 'synthetic-issue', project: 'INSUP', issueTypeId: 'task-id', issueTypeName: 'Task',
    statusCategory: 'done', resolutionId: 'done-id', resolvedAt: '2026-04-01T12:00:00Z',
    ...overrides,
  };
}

describe('closed work item metrics', () => {
  it('counts unique issue IDs rather than projects or repeated records', () => {
    const records = [issue(), issue(), issue({ project: 'RWJFINVEST' }), issue({ id: 'second' })];
    expect(countWorkItems(records, period, exclusions)).toEqual({
      status: 'available', count: 2, breakdown: [{ label: 'Task', count: 2 }],
    });
  });

  it.each([
    ['reopened', { statusCategory: 'indeterminate' }],
    ['not done', { statusCategory: 'new' }],
    ['excluded epic ID with a non-epic name', { issueTypeId: 'epic-id', issueTypeName: 'Task' }],
    ['canceled resolution', { resolutionId: 'canceled-id' }],
    ['duplicate resolution', { resolutionId: 'duplicate-id' }],
    ['missing resolution', { resolutionId: null }],
    ['missing resolution timestamp', { resolvedAt: null }],
    ['before New York year start', { resolvedAt: '2026-01-01T04:59:59.999Z' }],
    ['at cutoff', { resolvedAt: '2026-10-27T16:00:00Z' }],
    ['after cutoff', { resolvedAt: '2026-11-01T12:00:00Z' }],
  ] satisfies [string, Partial<IssueRecord>][])('excludes %s', (_name, overrides) => {
    expect(countWorkItems([issue(), issue({ id: 'excluded', ...overrides })], period, exclusions).count).toBe(1);
  });

  it('includes the year start and the instant just before the cutoff', () => {
    expect(countWorkItems([
      issue({ id: 'start', resolvedAt: '2026-01-01T00:00:00-05:00' }),
      issue({ id: 'last', resolvedAt: '2026-10-27T15:59:59.999Z' }),
    ], period, exclusions).count).toBe(2);
  });

  it('excludes the next New York year start for a completed year', () => {
    const fullYear = makePeriod(2026, '2027-02-01T00:00:00Z');
    expect(countWorkItems([
      issue({ id: 'last', resolvedAt: '2027-01-01T04:59:59.999Z' }),
      issue({ id: 'next', resolvedAt: '2027-01-01T00:00:00-05:00' }),
    ], fullYear, exclusions).count).toBe(1);
  });

  it('maps types to canonical labels, includes subtasks, and reconciles the aggregate', () => {
    const names = ['Task', 'story', 'BUG', 'Sub-task', 'Subtask', 'Private custom type', 'Epic'];
    const result = countWorkItems(names.map((issueTypeName, index) => issue({
      id: `synthetic-${index}`, issueTypeId: `type-${index}`, issueTypeName,
    })), period, exclusions);
    expect(result).toEqual({
      status: 'available', count: 7,
      breakdown: [
        { label: 'Task', count: 1 }, { label: 'Story', count: 1 }, { label: 'Bug', count: 1 },
        { label: 'Subtask', count: 2 }, { label: 'Other', count: 2 },
      ],
    });
    expect(result.breakdown.reduce((sum, item) => sum + item.count, 0)).toBe(result.count);
  });

  it('excludes subtasks only when their type ID is explicitly excluded', () => {
    expect(countWorkItems([issue({ issueTypeId: 'subtask-id', issueTypeName: 'Sub-task' })], period, {
      issueTypeIds: ['subtask-id'], resolutionIds: [],
    })).toEqual({ status: 'available', count: 0, breakdown: [] });
  });

  it('returns an available zero for a trusted complete empty set', () => {
    expect(countWorkItems([], period, exclusions)).toEqual({ status: 'available', count: 0, breakdown: [] });
  });

  it('does not mutate source records or exclusions', () => {
    const records = [issue(), issue()];
    const before = structuredClone({ records, exclusions });
    countWorkItems(records, period, exclusions);
    expect({ records, exclusions }).toEqual(before);
  });
});
