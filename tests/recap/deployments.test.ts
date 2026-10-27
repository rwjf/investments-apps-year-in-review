import { describe, expect, it } from 'vitest';
import { countProductionDeployments } from '../../scripts/recap/metrics';
import type { DeploymentRecord } from '../../scripts/recap/model';
import { makePeriod } from '../../scripts/recap/period';

const period = makePeriod(2026, '2026-10-27T16:00:00Z');
const environments = ['Prod', 'Production'];

function deployment(overrides: Partial<DeploymentRecord> = {}): DeploymentRecord {
  return {
    repositoryId: 'synthetic-repository', id: '101', environment: 'Prod',
    statuses: [{ state: 'success', createdAt: '2026-04-01T12:00:00Z' }],
    ...overrides,
  };
}

describe('production deployment metrics', () => {
  it('counts an earlier success even when the latest status is inactive', () => {
    expect(countProductionDeployments).toBeTypeOf('function');
    const result = countProductionDeployments([deployment({ statuses: [
      { state: 'inactive', createdAt: '2026-05-01T12:00:00Z' },
      { state: 'success', createdAt: '2026-04-01T12:00:00Z' },
    ] })], period, environments);
    expect(result.count).toBe(1);
    expect(result.breakdown.find((item) => item.label === '2026-04')?.count).toBe(1);
  });

  it.each(['waiting', 'failure', 'error', 'pending', 'queued', 'in_progress', 'inactive'])(
    'does not count a deployment with only %s status', (state) => {
      expect(countProductionDeployments([deployment({ statuses: [
        { state, createdAt: '2026-04-01T12:00:00Z' },
      ] })], period, environments).count).toBe(0);
    },
  );

  it('does not count missing or mixed unsuccessful histories', () => {
    expect(countProductionDeployments([
      deployment({ statuses: [] }),
      deployment({ id: '102', statuses: [
        { state: 'waiting', createdAt: '2026-04-01T12:00:00Z' },
        { state: 'failure', createdAt: '2026-04-02T12:00:00Z' },
      ] }),
    ], period, environments).count).toBe(0);
  });

  it.each([
    [' prod ', 1], ['PRODUCTION', 1], ['Production', 1],
    ['staging', 0], ['preproduction', 0], ['production-us', 0], ['', 0],
  ])('matches only normalized exact environment names: %s', (environment, count) => {
    expect(countProductionDeployments([deployment({ environment })], period, environments).count).toBe(count);
  });

  it('normalizes the configured environment names too', () => {
    expect(countProductionDeployments([deployment()], period, [' PROD ']).count).toBe(1);
    expect(countProductionDeployments([deployment()], period, []).count).toBe(0);
  });

  it('deduplicates within a repository but counts distinct repositories and new deployment IDs', () => {
    expect(countProductionDeployments([
      deployment(), deployment(), deployment({ repositoryId: 'another-repository' }),
      deployment({ id: '102' }),
    ], period, environments).count).toBe(3);
  });

  it('uses the earliest success instant in an unordered history, not lexical timestamp order', () => {
    const result = countProductionDeployments([deployment({ statuses: [
      { state: 'success', createdAt: '2026-07-01T12:00:00Z' },
      { state: 'success', createdAt: '2026-03-01T00:15:00-05:00' },
      { state: 'success', createdAt: '2026-03-01T04:30:00Z' },
      { state: 'success', createdAt: '2026-03-01T04:30:00Z' },
    ] })], period, environments);
    expect(result.count).toBe(1);
    expect(result.breakdown.find((item) => item.label === '2026-02')?.count).toBe(1);
    expect(result.breakdown.find((item) => item.label === '2026-03')?.count).toBe(0);
  });

  it('merges duplicate histories before selecting the global first success regardless of input order', () => {
    const records = [
      deployment({ statuses: [{ state: 'success', createdAt: '2026-07-01T12:00:00Z' }] }),
      deployment({ statuses: [{ state: 'success', createdAt: '2026-02-01T12:00:00Z' }] }),
      deployment({ statuses: [{ state: 'inactive', createdAt: '2026-09-01T12:00:00Z' }] }),
    ];
    const result = countProductionDeployments(records, period, environments);
    expect(result.count).toBe(1);
    expect(result.breakdown.find((item) => item.label === '2026-02')?.count).toBe(1);
    expect(countProductionDeployments([...records].reverse(), period, environments)).toEqual(result);
    expect(countProductionDeployments([records[2]!, records[0]!, records[1]!], period, environments)).toEqual(result);
  });

  it('does not recount a prior-year deployment when duplicate histories contain a later success', () => {
    const records = [
      deployment(),
      deployment({ statuses: [{ state: 'success', createdAt: '2026-01-01T04:59:59.999Z' }] }),
      deployment({ id: '102' }),
    ];
    expect(countProductionDeployments(records, period, environments).count).toBe(1);
    expect(countProductionDeployments([...records].reverse(), period, environments).count).toBe(1);
  });

  it('does not recount a prior-year success from the same history', () => {
    expect(countProductionDeployments([deployment({ statuses: [
      { state: 'success', createdAt: '2026-04-01T12:00:00Z' },
      { state: 'success', createdAt: '2025-12-01T12:00:00Z' },
    ] })], period, environments).count).toBe(0);
  });

  it.each([
    ['2026-01-01T04:59:59.999Z', 0], ['2026-01-01T00:00:00-05:00', 1],
    ['2026-10-27T15:59:59.999Z', 1], ['2026-10-27T16:00:00Z', 0],
    ['2026-11-01T12:00:00Z', 0],
  ])('applies inclusive year start and exclusive cutoff to %s', (createdAt, count) => {
    expect(countProductionDeployments([deployment({ statuses: [
      { state: 'success', createdAt },
    ] })], period, environments).count).toBe(count);
  });

  it('uses Eastern month and year boundaries with all 12 canonical buckets that reconcile', () => {
    const fullYear = makePeriod(2026, '2027-02-01T00:00:00Z');
    const instants = [
      '2026-01-01T05:00:00Z', '2026-03-01T04:59:59.999Z', '2026-03-01T05:00:00Z',
      '2026-07-01T03:59:59.999Z', '2026-07-01T04:00:00Z',
      '2027-01-01T04:59:59.999Z', '2027-01-01T05:00:00Z',
    ];
    const result = countProductionDeployments(instants.map((createdAt, index) => deployment({
      id: String(index), statuses: [{ state: 'success', createdAt }],
    })), fullYear, environments);
    expect(result).toEqual({
      status: 'available', count: 6,
      breakdown: [
        { label: '2026-01', count: 1 }, { label: '2026-02', count: 1 },
        { label: '2026-03', count: 1 }, { label: '2026-04', count: 0 },
        { label: '2026-05', count: 0 }, { label: '2026-06', count: 1 },
        { label: '2026-07', count: 1 }, { label: '2026-08', count: 0 },
        { label: '2026-09', count: 0 }, { label: '2026-10', count: 0 },
        { label: '2026-11', count: 0 }, { label: '2026-12', count: 1 },
      ],
    });
    expect(result.breakdown.reduce((sum, item) => sum + item.count, 0)).toBe(result.count);
  });

  it('returns an available zero with all months for a trusted complete empty set', () => {
    const result = countProductionDeployments([], period, environments);
    expect(result.status).toBe('available');
    expect(result.count).toBe(0);
    expect(result.breakdown).toHaveLength(12);
    expect(result.breakdown.every((item) => item.count === 0)).toBe(true);
    expect(result.breakdown[0]?.label).toBe('2026-01');
    expect(result.breakdown[11]?.label).toBe('2026-12');
  });

  it('does not mutate source records, period, or configured environments', () => {
    const records = [deployment({ statuses: [
      { state: 'success', createdAt: '2026-07-01T12:00:00Z' },
      { state: 'success', createdAt: '2026-02-01T12:00:00Z' },
    ] }), deployment()];
    const before = structuredClone({ records, period, environments });
    countProductionDeployments(records, period, environments);
    expect({ records, period, environments }).toEqual(before);
  });
});
