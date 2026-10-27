import { describe, expect, it } from 'vitest';
import { collectGithub } from '../../scripts/recap/github';
import { collectJira } from '../../scripts/recap/jira';
import { requestWithRetry } from '../../scripts/recap/http';
import { countWorkItems } from '../../scripts/recap/metrics';
import type { CollectorConfig, SourceRequest, SourceResponse } from '../../scripts/recap/model';
import { makePeriod } from '../../scripts/recap/period';

const period = makePeriod(2026, '2026-10-27T16:00:00Z');
const repo = (id: number) => ({ id, full_name: `rwjf/synthetic-${id}`, archived: true });
const alert = (id: number) => ({
  repository: { id }, number: id, state: 'fixed', fixed_at: '2026-02-01T12:00:00Z',
  created_at: '2020-01-01T00:00:00Z', security_vulnerability: { severity: 'high' },
});
const issue = (id: string) => ({ id, fields: {
  project: { key: 'INSUP' }, issuetype: { id: '1', name: 'Task' },
  status: { statusCategory: { key: 'done' } }, resolution: { id: '10' },
  resolutiondate: '2026-04-01T12:00:00.000+0000',
} });
const ok = (body: unknown, headers: Record<string, string> = {}): SourceResponse => ({ status: 200, body, headers });
const inventoryPath = new URL('../fixtures/source-inventory.json', import.meta.url).pathname;

function fixture(routes: Record<string, SourceResponse | SourceResponse[]>) {
  const calls: SourceRequest[] = [];
  const transport = async (request: SourceRequest) => {
    calls.push(request);
    const token = request.body?.nextPageToken;
    const key = request.path + (token ? `#${token}` : '');
    const response = routes[key];
    if (!response) throw new Error('Unexpected fixture request');
    return Array.isArray(response) ? response.length > 1 ? response.shift()! : response[0]! : response;
  };
  return { calls, transport };
}

function config(transport: CollectorConfig['transport']): CollectorConfig {
  return {
    organization: 'rwjf', projects: ['INSUP', 'RWJFINVEST'], year: 2026,
    timezone: 'America/New_York', productionEnvironments: ['Prod', 'Production'],
    jiraExclusions: { issueTypeIds: [], resolutionIds: [], confirmed: true },
    inventoryPath, transport, sleep: async () => {},
  };
}

function githubRoutes(): Record<string, SourceResponse | SourceResponse[]> {
  return {
    '/orgs/rwjf': ok({ id: 99, login: 'rwjf' }),
    '/orgs/rwjf/repos?type=all&per_page=100': ok([repo(1), repo(2)]),
    '/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100': ok([]),
    '/repos/rwjf/synthetic-1/deployments?per_page=100': ok([]),
    '/repos/rwjf/synthetic-2/deployments?per_page=100': ok([]),
  };
}

function jiraRoutes(): Record<string, SourceResponse | SourceResponse[]> {
  return {
    '/rest/api/3/project/INSUP/statuses': ok([{ id: '1', name: 'Task' }]),
    '/rest/api/3/project/RWJFINVEST/statuses': ok([{ id: '1', name: 'Task' }]),
    '/rest/api/3/resolution': ok([{ id: '10', name: 'Done' }]),
    '/rest/api/3/search/jql': ok({ issues: [], isLast: true }),
  };
}

describe('GitHub source collection', () => {
  it('follows verified canonical organization and repository links through every page and cursor', async () => {
    const routes = githubRoutes();
    const link = (path: string) => ({ link: `<https://api.github.com${path}>; rel="next"` });
    const inventoryNext = '/organizations/99/repos?type=all&per_page=100&page=2';
    routes['/orgs/rwjf/repos?type=all&per_page=100'] = ok([repo(1)], link(inventoryNext));
    routes[inventoryNext] = ok([repo(2)]);
    const alertsNext = '/organizations/99/dependabot/alerts?state=fixed&per_page=100&after=cursor%2B1';
    const alertsLast = '/organizations/99/dependabot/alerts?state=fixed&per_page=100&before=cursor%2F2';
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = ok([alert(1)], link(alertsNext));
    routes[alertsNext] = ok([{ ...alert(2), number: 3 }], link(alertsLast));
    routes[alertsLast] = ok([alert(2)]);
    const deploymentsNext = '/repositories/1/deployments?per_page=100&page=2';
    const deploymentsLast = '/repositories/1/deployments?per_page=100&page=3';
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([{ id: 21, environment: 'Prod' }], link(deploymentsNext));
    routes[deploymentsNext] = ok([{ id: 22, environment: 'Production' }], link(deploymentsLast));
    routes[deploymentsLast] = ok([{ id: 23, environment: 'Preview' }]);
    const statusesNext = '/repositories/1/deployments/21/statuses?per_page=100&page=2';
    routes['/repos/rwjf/synthetic-1/deployments/21/statuses?per_page=100'] = ok([
      { state: 'inactive', created_at: '2026-09-01T00:00:00Z' },
    ], link(statusesNext));
    routes[statusesNext] = ok([{ state: 'success', created_at: '2026-02-01T00:00:00Z' }]);
    routes['/repos/rwjf/synthetic-1/deployments/22/statuses?per_page=100'] = ok([]);
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.alerts.records.map((a) => a.number)).toEqual([1, 3, 2]);
    expect(result.deployments.records.map((d) => d.id)).toEqual(['21', '22']);
    expect(result.deployments.records[0]?.statuses.map((s) => s.state)).toEqual(['inactive', 'success']);
    expect(result.alerts.coverage.complete).toBe(true);
    expect(result.deployments.coverage.complete).toBe(true);
    for (const path of [inventoryNext, alertsNext, alertsLast, deploymentsNext, deploymentsLast, statusesNext]) {
      expect(f.calls.filter((call) => call.path === path)).toHaveLength(1);
    }
  });

  it.each([
    'https://api.github.com/organizations/98/dependabot/alerts?state=fixed&per_page=100&after=next',
    'https://api.github.com/organizations/99/repos?state=fixed&per_page=100&after=next',
    'https://foreign.invalid/organizations/99/dependabot/alerts?state=fixed&per_page=100&after=next',
    'https://user:password@api.github.com/organizations/99/dependabot/alerts?state=fixed&per_page=100&after=next',
    'https://api.github.com/organizations/99/dependabot/alerts?state=fixed&per_page=100&after=next#fragment',
    'https://api.github.com/organizations/99/dependabot/alerts?state=open&per_page=100&after=next',
    'https://api.github.com/organizations/99/dependabot/alerts?per_page=100&after=next',
    'https://api.github.com/orgs/rwjf/dependabot/alerts?state=open&per_page=100&page=2',
    'https://api.github.com/organizations/99/dependabot/alerts?state=fixed&state=open&per_page=100&after=next',
    'https://api.github.com/organizations/99/dependabot/alerts?state=fixed&per_page=100&severity=critical&after=next',
  ])('rejects organization pagination outside verified resource and filter scope (%s)', async (target) => {
    const routes = githubRoutes();
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = ok([alert(1)], {
      link: `<${target}>; rel="next"`,
    });
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.alerts.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
    expect(f.calls.filter((c) => c.path.includes('dependabot/alerts'))).toHaveLength(1);
  });

  it.each([
    '/repositories/2/deployments?per_page=100&page=2',
    '/repositories/1/issues?per_page=100&page=2',
    '/repositories/1/deployments?per_page=100&environment=Prod&page=2',
  ])('rejects repository pagination outside the verified repository or resource (%s)', async (target) => {
    const routes = githubRoutes();
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([], {
      link: `<https://api.github.com${target}>; rel="next"`,
    });
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.deployments.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
    expect(f.calls.some((c) => c.path === target)).toBe(false);
  });

  it.each([
    '/repositories/2/deployments/21/statuses?per_page=100&page=2',
    '/repositories/1/deployments/22/statuses?per_page=100&page=2',
    '/repositories/1/deployments?per_page=100&page=2',
  ])('rejects status pagination for a different repository, deployment, or resource (%s)', async (target) => {
    const routes = githubRoutes();
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([{ id: 21, environment: 'Prod' }]);
    routes['/repos/rwjf/synthetic-1/deployments/21/statuses?per_page=100'] = ok([], {
      link: `<https://api.github.com${target}>; rel="next"`,
    });
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.deployments.records).toEqual([]);
    expect(result.deployments.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
    expect(f.calls.some((c) => c.path === target)).toBe(false);
  });

  it.each([ok({ id: 99, login: 'another-org' }), { status: 403, body: {}, headers: {} }])(
    'does not trust canonical organization aliases without successful matching metadata', async (metadata) => {
      const routes = githubRoutes();
      routes['/orgs/rwjf'] = metadata;
      routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = ok([alert(1)], {
        link: '<https://api.github.com/organizations/99/dependabot/alerts?state=fixed&per_page=100&page=2>; rel="next"',
      });
      const f = fixture(routes);
      const result = await collectGithub(config(f.transport), period);
      expect(result.alerts.coverage.complete).toBe(false);
      expect(result.alerts.coverage.issues.some((i) => i.reason === 'failed' || i.reason === 'denied')).toBe(true);
      expect(f.calls.some((c) => c.path.startsWith('/organizations/'))).toBe(false);
    },
  );

  it('followsAllPages', async () => {
    const routes = githubRoutes();
    routes['/orgs/rwjf/repos?type=all&per_page=100'] = ok([repo(1)], {
      link: '<https://api.github.com/orgs/rwjf/repos?type=all&per_page=100&page=2>; rel="next"',
    });
    routes['/orgs/rwjf/repos?type=all&per_page=100&page=2'] = ok([repo(2)]);
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = ok([alert(1)], {
      link: '<https://api.github.com/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100&page=2>; rel="next"',
    });
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100&page=2'] = ok([alert(2)]);
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.alerts.records.map((a) => a.number)).toEqual([1, 2]);
    expect(result.alerts.coverage.complete).toBe(true);
    expect(f.calls.some((c) => c.path.includes('synthetic-2/deployments'))).toBe(true);
  });

  it('rejectsRepeatedCursor', async () => {
    const routes = githubRoutes();
    const path = '/orgs/rwjf/repos?type=all&per_page=100';
    routes[path] = ok([repo(1)], { link: `<https://api.github.com${path}>; rel="next"` });
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.deployments.coverage.complete).toBe(false);
    expect(result.deployments.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
    expect(f.calls.filter((c) => c.path === path)).toHaveLength(1);
  });

  it('deniedIsNotEmpty', async () => {
    const routes = githubRoutes();
    const path = '/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100';
    routes[path] = { status: 403, headers: {}, body: { message: 'denied' } };
    const f = fixture(routes);
    const denied = await collectGithub(config(f.transport), period);
    expect(denied.alerts.coverage.complete).toBe(false);
    expect(denied.alerts.coverage.sourceChecks).toContainEqual({ source: path, status: 'denied' });
    expect(f.calls.filter((c) => c.path === path)).toHaveLength(1);
    routes[path] = ok([]);
    const empty = await collectGithub(config(fixture(routes).transport), period);
    expect(empty.alerts.coverage.complete).toBe(true);
    expect(empty.alerts.coverage.sourceChecks).toContainEqual({ source: path, status: 'empty' });
  });

  it('incompleteInventoryIsExplicit', async () => {
    const routes = githubRoutes();
    routes['/orgs/rwjf/repos?type=all&per_page=100'] = ok([repo(1)]);
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.deployments.coverage.inventoryVerified).toBe(false);
    expect(result.alerts.coverage.complete).toBe(false);
    expect(result.deployments.coverage.issues.some((i) => i.reason === 'inventory')).toBe(true);
  });

  it('does not equate an accessible inventory with a verified historical organization inventory', async () => {
    const c = config(fixture(githubRoutes()).transport);
    delete c.inventoryPath;
    const result = await collectGithub(c, period);
    expect(result.alerts.coverage.inventoryVerified).toBe(false);
    expect(result.deployments.coverage.complete).toBe(false);
  });

  it('readsEveryDeploymentStatusPage', async () => {
    const routes = githubRoutes();
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([
      { id: 21, environment: ' pRoD ', production_environment: false },
      { id: 22, environment: 'Preview', production_environment: true },
    ], { link: '<https://api.github.com/repos/rwjf/synthetic-1/deployments?per_page=100&page=2>; rel="next"' });
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100&page=2'] = ok([{ id: 23, environment: 'Production' }]);
    const path = '/repos/rwjf/synthetic-1/deployments/21/statuses?per_page=100';
    routes[path] = ok([{ state: 'inactive', created_at: '2026-09-01T00:00:00Z' }], {
      link: `<https://api.github.com${path}&page=2>; rel="next"`,
    });
    routes[`${path}&page=2`] = ok([{ state: 'success', created_at: '2026-01-01T06:00:00Z' }]);
    routes['/repos/rwjf/synthetic-1/deployments/23/statuses?per_page=100'] = ok([]);
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.deployments.records.map((d) => d.id)).toEqual(['21', '23']);
    expect(result.deployments.records[0]?.statuses.map((s) => s.state)).toEqual(['inactive', 'success']);
    expect(result.deployments.coverage.complete).toBe(true);
    expect(f.calls.some((c) => c.path.includes('/22/statuses'))).toBe(false);
  });

  it.each([401, 403, 404, 410, 500])('marks inaccessible or failed status history incomplete (%i)', async (status) => {
    const routes = githubRoutes();
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([{ id: 21, environment: 'Prod' }]);
    routes['/repos/rwjf/synthetic-1/deployments/21/statuses?per_page=100'] = { status, body: {}, headers: {} };
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.deployments.coverage.complete).toBe(false);
    expect(result.deployments.records).toEqual([]);
    expect(result.alerts.coverage.complete).toBe(true);
  });

  it('retains waiting and earlier success across status pages without false incomplete coverage', async () => {
    const routes = githubRoutes();
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([{ id: 21, environment: 'Prod' }]);
    const path = '/repos/rwjf/synthetic-1/deployments/21/statuses?per_page=100';
    routes[path] = ok([{ state: 'waiting', created_at: '2026-09-01T00:00:00Z' }], {
      link: `<https://api.github.com${path}&page=2>; rel="next"`,
    });
    routes[`${path}&page=2`] = ok([{ state: 'success', created_at: '2026-01-01T06:00:00Z' }]);
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.deployments.records[0]?.statuses).toEqual([
      { state: 'waiting', createdAt: '2026-09-01T00:00:00Z' },
      { state: 'success', createdAt: '2026-01-01T06:00:00Z' },
    ]);
    expect(result.deployments.coverage.complete).toBe(true);
    expect(result.deployments.coverage.issues).toEqual([]);
  });

  it('still rejects unknown deployment states as malformed histories', async () => {
    const routes = githubRoutes();
    routes['/repos/rwjf/synthetic-1/deployments?per_page=100'] = ok([{ id: 21, environment: 'Prod' }]);
    const path = '/repos/rwjf/synthetic-1/deployments/21/statuses?per_page=100';
    routes[path] = ok([{ state: 'unknown-synthetic-state', created_at: '2026-09-01T00:00:00Z' }]);
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.deployments.records).toEqual([]);
    expect(result.deployments.coverage.complete).toBe(false);
    expect(result.deployments.coverage.sourceChecks).toContainEqual({ source: path, status: 'failed' });
  });

  it('validates payloads and refuses foreign pagination links', async () => {
    const routes = githubRoutes();
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = ok([{ ...alert(1), fixed_at: 'bad' }]);
    routes['/orgs/rwjf/repos?type=all&per_page=100'] = ok([repo(1)], {
      link: '<https://untrusted.invalid/next>; rel="next"',
    });
    const f = fixture(routes);
    const result = await collectGithub(config(f.transport), period);
    expect(result.alerts.coverage.complete).toBe(false);
    expect(result.alerts.records).toEqual([]);
    expect(f.calls.every((c) => !c.path.includes('untrusted'))).toBe(true);
  });

  it('distinguishes an explicitly disabled feature from successful empty', async () => {
    const routes = githubRoutes();
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = {
      status: 403, headers: {}, body: { message: 'Dependabot alerts are disabled for this repository.' },
    };
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.alerts.coverage.sourceChecks.some((s) => s.status === 'disabled')).toBe(true);
    expect(result.alerts.coverage.complete).toBe(false);
  });

  it('rejects malformed links and repeated records even when page URLs differ', async () => {
    for (const link of ['not-a-link', '<https://api.github.com/orgs/rwjf/repos?page=2>; rel="next"']) {
      const routes = githubRoutes();
      routes['/orgs/rwjf/repos?type=all&per_page=100'] = ok([repo(1), repo(2)], { link });
      routes['/orgs/rwjf/repos?page=2'] = ok([repo(1)]);
      const result = await collectGithub(config(fixture(routes).transport), period);
      expect(result.alerts.coverage.complete).toBe(false);
    }
    const routes = githubRoutes();
    const path = '/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100';
    routes[path] = ok([alert(1)], { link: `<https://api.github.com${path}&page=2>; rel="next"` });
    routes[`${path}&page=2`] = ok([alert(1)]);
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.alerts.coverage.complete).toBe(false);
  });
});

describe('bounded read transport', () => {
  it('rateLimitRetryIsBounded', async () => {
    let attempts = 0;
    const waits: number[] = [];
    const c = config(async () => { attempts++; return { status: 429, headers: { 'retry-after': '99999' }, body: {} }; });
    c.sleep = async (ms) => { waits.push(ms); };
    const response = await requestWithRetry(c, { source: 'github', method: 'GET', path: '/test' });
    expect(response.status).toBe(429);
    expect(attempts).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits.every((ms) => ms <= 5000)).toBe(true);
    const routes = githubRoutes();
    routes['/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100'] = response;
    const result = await collectGithub(config(fixture(routes).transport), period);
    expect(result.alerts.coverage.complete).toBe(false);
  });

  it('recovers transient reads and honors a sane Retry-After', async () => {
    const waits: number[] = [];
    let attempts = 0;
    const c = config(async () => ++attempts === 1
      ? { status: 503, body: {}, headers: { 'Retry-After': '2' } } : ok([]));
    c.sleep = async (ms) => { waits.push(ms); };
    expect((await requestWithRetry(c, { source: 'github', method: 'GET', path: '/test' })).status).toBe(200);
    expect(waits).toEqual([2000]);
  });

  it('bounds network failures and retries rate-limited 403 responses only', async () => {
    let attempts = 0;
    const c = config(async () => { attempts++; throw new Error('private payload never propagated'); });
    expect((await requestWithRetry(c, { source: 'jira', method: 'GET', path: '/test' })).status).toBe(0);
    expect(attempts).toBe(3);
    attempts = 0;
    c.transport = async () => {
      attempts++;
      return { status: 403, body: {}, headers: { 'x-ratelimit-remaining': '0' } };
    };
    expect((await requestWithRetry(c, { source: 'github', method: 'GET', path: '/test' })).status).toBe(403);
    expect(attempts).toBe(3);
  });
});

describe('Jira source collection', () => {
  it('counts REST compact-offset resolution dates across the adapter-to-reducer handoff', async () => {
    const routes = jiraRoutes();
    const issues = [
      '2026-01-01T04:59:59.999+0000',
      '2026-01-01T05:00:00.000+0000',
      issue('ordinary').fields.resolutiondate,
      '2026-10-27T15:59:59.999+0000',
      '2026-10-27T16:00:00.000+0000',
    ].map((resolutiondate, index) => {
      const record = issue(String(index));
      record.fields.resolutiondate = resolutiondate;
      return record;
    });
    routes['/rest/api/3/search/jql'] = ok({ issues, isLast: true });
    const c = config(fixture(routes).transport);
    const result = await collectJira(c, period);
    expect(result.coverage.complete).toBe(true);
    expect(result.records).toHaveLength(5);
    expect(countWorkItems(result.records, period, c.jiraExclusions)).toEqual({
      status: 'available', count: 3, breakdown: [{ label: 'Task', count: 3 }],
    });
    expect(result.records.map((record) => countWorkItems([record], period, c.jiraExclusions).count))
      .toEqual([0, 1, 1, 1, 0]);
  });

  it('readsResolutionDateFromRest', async () => {
    const routes = jiraRoutes();
    routes['/rest/api/3/search/jql'] = ok({ issues: [issue('a')], isLast: true });
    const f = fixture(routes);
    const result = await collectJira(config(f.transport), period);
    expect(result.records[0]).toEqual({
      id: 'a', project: 'INSUP', issueTypeId: '1', issueTypeName: 'Task', statusCategory: 'done',
      resolutionId: '10', resolvedAt: '2026-04-01T12:00:00.000+0000',
    });
    expect(result.coverage.complete).toBe(true);
    const request = f.calls.find((c) => c.path === '/rest/api/3/search/jql')!;
    expect(request.method).toBe('POST');
    expect(request.body?.fields).toEqual(['project', 'issuetype', 'status', 'resolution', 'resolutiondate']);
    expect(request.body?.jql).toContain('project in ("INSUP", "RWJFINVEST")');
    expect(request.body?.jql).toContain('resolutiondate >=');
    expect(JSON.stringify(request)).not.toMatch(/summary|description/);
  });

  it.each(['2026-04-01', '2026-04-01T12:00:00.000', 'not-a-timestamp', '2026-04-01T12:00:00.000+2500'])(
    'rejects a resolution date without a valid explicit instant (%s)', async (resolutiondate) => {
      const routes = jiraRoutes();
      const record = issue('invalid');
      record.fields.resolutiondate = resolutiondate;
      routes['/rest/api/3/search/jql'] = ok({ issues: [record], isLast: true });
      const result = await collectJira(config(fixture(routes).transport), period);
      expect(result.records).toEqual([]);
      expect(result.coverage.complete).toBe(false);
      expect(result.coverage.sourceChecks).toContainEqual({ source: '/rest/api/3/search/jql', status: 'failed' });
    },
  );

  it('follows all enhanced search pages', async () => {
    const routes = jiraRoutes();
    routes['/rest/api/3/search/jql'] = ok({ issues: [issue('a')], nextPageToken: 'next', isLast: false });
    routes['/rest/api/3/search/jql#next'] = ok({ issues: [issue('b')], isLast: true });
    const result = await collectJira(config(fixture(routes).transport), period);
    expect(result.records.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.coverage.complete).toBe(true);
  });

  it('rejects repeated Jira tokens and missing continuation tokens', async () => {
    for (const second of [{ issues: [], nextPageToken: 'next', isLast: false }, { issues: [], isLast: false }]) {
      const routes = jiraRoutes();
      routes['/rest/api/3/search/jql'] = ok({ issues: [issue('a')], nextPageToken: 'next', isLast: false });
      routes['/rest/api/3/search/jql#next'] = ok(second);
      const f = fixture(routes);
      const result = await collectJira(config(f.transport), period);
      expect(result.coverage.complete).toBe(false);
      expect(result.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
      expect(f.calls.filter((c) => c.path === '/rest/api/3/search/jql')).toHaveLength(2);
    }
  });

  it('blocks unapproved or unmapped exclusions rather than guessing completion', async () => {
    for (const exclusions of [
      { issueTypeIds: [], resolutionIds: [], confirmed: false },
      { issueTypeIds: ['missing'], resolutionIds: [], confirmed: true },
      { issueTypeIds: [], resolutionIds: ['missing'], confirmed: true },
    ]) {
      const c = config(fixture(jiraRoutes()).transport);
      c.jiraExclusions = exclusions;
      const result = await collectJira(c, period);
      expect(result.coverage.complete).toBe(false);
      expect(result.coverage.issues.some((i) => i.reason === 'mapping')).toBe(true);
    }
  });

  it('does not silently accept failed discovery, malformed fields, or auth failures', async () => {
    for (const replacement of [
      { path: '/rest/api/3/resolution', response: { status: 403, body: {}, headers: {} } },
      { path: '/rest/api/3/search/jql', response: ok({ issues: [{ id: 'x', fields: {} }], isLast: true }) },
      { path: '/rest/api/3/search/jql', response: { status: 401, body: {}, headers: {} } },
    ]) {
      const routes = jiraRoutes();
      routes[replacement.path] = replacement.response;
      const result = await collectJira(config(fixture(routes).transport), period);
      expect(result.coverage.complete).toBe(false);
    }
  });

  it('keeps successful empty distinct from denied search and rejects unknown mappings', async () => {
    const empty = await collectJira(config(fixture(jiraRoutes()).transport), period);
    expect(empty.coverage.sourceChecks).toContainEqual({ source: '/rest/api/3/search/jql', status: 'empty' });
    const routes = jiraRoutes();
    const unmapped = issue('a');
    unmapped.fields.resolution.id = '999';
    routes['/rest/api/3/search/jql'] = ok({ issues: [unmapped], isLast: true });
    const result = await collectJira(config(fixture(routes).transport), period);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.issues.some((i) => i.reason === 'mapping')).toBe(true);
  });

  it('does not claim full Jira visibility solely because search returned successfully', async () => {
    const c = config(fixture(jiraRoutes()).transport);
    delete c.inventoryPath;
    const result = await collectJira(c, period);
    expect(result.coverage.inventoryVerified).toBe(false);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.sourceChecks).toContainEqual({ source: '/rest/api/3/search/jql', status: 'empty' });
    expect(result.coverage.issues.some((i) => i.reason === 'inventory')).toBe(true);
  });
});
