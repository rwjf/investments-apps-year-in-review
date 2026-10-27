import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectSnapshot } from '../../scripts/recap/collect';
import type { CollectorConfig, CoverageReport } from '../../scripts/recap/model';

const roots: string[] = [];
const secret = 'FAKE_CREDENTIAL_never_public_123';
const clean = (): CoverageReport => ({ complete: true, inventoryVerified: true, issues: [],
  sourceChecks: [{ source: 'private-source', status: 'success' }] });
const config: CollectorConfig = { organization: 'rwjf', projects: ['INSUP', 'RWJFINVEST'], year: 2026,
  timezone: 'America/New_York', productionEnvironments: ['Prod', 'Production'],
  jiraExclusions: { issueTypeIds: [], resolutionIds: [], confirmed: true } };

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'recap-collection-'));
  roots.push(root);
  await writeFile(join(root, 'recap.config.json'), JSON.stringify(config));
  return root;
}

function collectors(coverage = clean()) {
  return {
    github: async () => ({ alerts: { records: [{ repositoryId: secret, number: 1, state: 'fixed',
      fixedAt: '2026-03-01T12:00:00Z', severity: secret }], coverage },
    deployments: { records: [], coverage: clean() } }),
    jira: async () => ({ records: [{ id: secret, project: 'INSUP', issueTypeId: '1', issueTypeName: secret,
      statusCategory: 'done', resolutionId: '1', resolvedAt: '2026-03-01T12:00:00Z' }], coverage: clean() }),
  };
}

afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('collection boundary', () => {
  it('persists only canonical public aggregates, not raw records or private coverage', async () => {
    const root = await setup();
    const coverage = clean();
    coverage.sourceChecks[0]!.source = secret;
    const result = await collectSnapshot({ root, year: 2026, asOf: '2026-10-27T16:00:00Z', collectors: collectors(coverage) });
    const candidate = await readFile(join(root, '.recap-private/candidate.json'), 'utf8');
    expect(candidate).not.toContain(secret);
    expect(candidate).not.toContain('sourceChecks');
    expect(await readFile(join(root, '.recap-private/coverage.json'), 'utf8')).toContain(secret);
    expect(result.metrics.dependencyAlertsFixed).toEqual({ status: 'available', count: 1, breakdown: [{ label: 'Unknown', count: 1 }] });
    expect(result.metrics.workItemsClosed.breakdown).toEqual([{ label: 'Other', count: 1 }]);
    expect(result.metrics.productionDeployments.count).toBe(0);
    expect(result.metrics.productionDeployments.breakdown).toHaveLength(12);
    expect(result.periodStart).toBe('2026-01-01T05:00:00.000Z');
    expect(result.isYearToDate).toBe(true);
  });

  it('turns a thrown source/network error into unavailable metrics without exposing its message', async () => {
    const root = await setup();
    const sources = collectors();
    sources.github = async () => { throw new Error(secret); };
    const result = await collectSnapshot({ root, asOf: '2026-10-27T16:00:00Z', collectors: sources });
    expect(result.metrics.dependencyAlertsFixed).toEqual({ status: 'unavailable', count: null, breakdown: [] });
    expect(result.metrics.productionDeployments.count).toBeNull();
    expect(result.metrics.workItemsClosed.count).toBe(1);
    expect(await readFile(join(root, '.recap-private/candidate.json'), 'utf8')).not.toContain(secret);
    expect(await readFile(join(root, '.recap-private/coverage.json'), 'utf8')).not.toContain(secret);
  });

  it('never promotes or overwrites approved input during collection', async () => {
    const root = await setup();
    await mkdir(join(root, 'src/data'), { recursive: true });
    await writeFile(join(root, 'src/data/approved.json'), 'prior-reviewed-input');
    await collectSnapshot({ root, asOf: '2026-10-27T16:00:00Z', collectors: collectors() });
    expect(await readFile(join(root, 'src/data/approved.json'), 'utf8')).toBe('prior-reviewed-input');
  });

  it('does not guess missing Jira exclusion confirmation even with a successful injected collector', async () => {
    const root = await setup();
    await writeFile(join(root, 'recap.config.json'), JSON.stringify({ ...config, jiraExclusions: { issueTypeIds: [], resolutionIds: [] } }));
    const result = await collectSnapshot({ root, asOf: '2026-10-27T16:00:00Z', collectors: collectors() });
    expect(result.metrics.workItemsClosed.count).toBeNull();
  });

  it('sanitizes validation errors and leaves existing files intact on invalid configuration', async () => {
    const root = await setup();
    await mkdir(join(root, '.recap-private'));
    await writeFile(join(root, '.recap-private/candidate.json'), 'prior-candidate');
    await writeFile(join(root, 'recap.config.json'), JSON.stringify({ ...config, organization: secret }));
    await expect(collectSnapshot({ root, collectors: collectors() })).rejects.toThrow('Collection failed');
    await expect(collectSnapshot({ root, collectors: collectors() })).rejects.not.toThrow(secret);
    expect(await readFile(join(root, '.recap-private/candidate.json'), 'utf8')).toBe('prior-candidate');
  });
});
