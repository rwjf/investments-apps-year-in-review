import { describe, expect, it, vi } from 'vitest';
import { collectMergedPullRequests, type GithubGraphqlTransport, type PullRequestProgress } from '../../scripts/recap/github-prs';
import type { CollectorConfig } from '../../scripts/recap/model';
import { makePeriod } from '../../scripts/recap/period';

const { gh } = vi.hoisted(() => ({ gh: vi.fn() }));
vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(), execFile: gh,
}));

const period = makePeriod(2026, '2026-10-27T17:28:51.121Z');
const owner = { id: 'ORG', login: 'rwjf', __typename: 'Organization' };
const repo = (id = 1) => ({ id: `REPO${id}`, databaseId: id, nameWithOwner: `rwjf/pr-source-${id}`, isArchived: true, owner });
const pr = (number = 1, overrides = {}) => ({ number, mergedAt: '2026-02-01T12:00:00Z',
  additions: 3, deletions: 1, changedFiles: 2, author: { __typename: 'User' }, ...overrides });
const file = (path: string, additions = 1, deletions = 0) => ({ path, additions, deletions });
const connection = (nodes: unknown[], totalCount = nodes.length, next: string | null = null) => ({
  nodes, totalCount, pageInfo: { hasNextPage: next !== null, endCursor: next },
});

describe('local query-only GraphQL transport', () => {
  function localResponse(status: number, body: unknown, headers = '', error: Error | null = null) {
    const calls: { command: string; args: string[]; input: string }[] = [];
    gh.mockImplementation((command: string, args: string[], _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void) => ({ stdin: {
      on: () => {}, end: (input: string) => {
        calls.push({ command, args, input });
        callback(error, `HTTP/2.0 ${status} Synthetic\r\n${headers}\r\n\r\n${JSON.stringify(body)}`, 'private stderr');
      },
    } }));
    return calls;
  }

  it('sends fixed metadata-only query text with JSON variables through stdin, not a shell or REST mutation', async () => {
    const calls = localResponse(200, inventory([]));
    const c = config();
    delete c.inventoryPath;
    const result = await collectMergedPullRequests(c, period);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('gh');
    expect(calls[0]?.args).toEqual(['api', '--hostname', 'github.com', 'graphql', '--include', '--method', 'POST', '--input', '-']);
    const input = JSON.parse(calls[0]!.input);
    expect(input.query).toContain('query PrSourceInventory');
    expect(input.query).not.toContain('mutation');
    expect(input.variables).toEqual({ after: null });
    expect(result.coverage.issues).toEqual([{ source: 'github-inventory', identifier: 'github-inventory', reason: 'inventory' }]);
  });

  it.each([401, 403, 404])('fails closed without retry or private stderr on HTTP %i', async (status) => {
    const calls = localResponse(status, { message: 'private secret' }, '', new Error('private command'));
    const result = await collectMergedPullRequests(config(), period);
    expect(calls).toHaveLength(1);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.issues.some((i) => i.reason === (status === 404 ? 'failed' : 'denied'))).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private|secret/);
  });

  it.each([
    [429, 'Retry-After: 99999'], [403, 'X-RateLimit-Remaining: 0'], [503, ''],
  ])('bounds HTTP %i retry exhaustion', async (status, headers) => {
    const calls = localResponse(status, {}, headers, new Error('private command'));
    const waits: number[] = [];
    const c = config();
    c.sleep = async (ms) => { waits.push(ms); };
    const result = await collectMergedPullRequests(c, period);
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
    expect(result.coverage.complete).toBe(false);
  });

  it.each(['RATE_LIMITED', 'FORBIDDEN'])('reads GraphQL %s errors even when gh exits nonzero with HTTP 200', async (type) => {
    const calls = localResponse(200, { errors: [{ type, message: 'private secret' }] }, '', new Error('gh failed'));
    const result = await collectMergedPullRequests(config(), period);
    expect(calls).toHaveLength(type === 'RATE_LIMITED' ? 3 : 1);
    expect(result.coverage.issues.some((i) => i.reason === (type === 'FORBIDDEN' ? 'denied' : 'failed'))).toBe(true);
    expect(result.coverage.complete).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/private|secret/);
  });
});
const inventory = (nodes = [repo(), repo(2)], total = nodes.length, next: string | null = null) => ({
  data: { organization: { ...owner, databaseId: 99, repositories: connection(nodes, total, next) } },
});
const prs = (nodes = [pr()], total = nodes.length, next: string | null = null, repository = repo()) => ({
  data: { node: { ...repository, pullRequests: connection(nodes, total, next) } },
});
const files = (nodes = [file('src/pr-source-a.ts', 2, 1), file('src/pr-source-b.ts')],
  next: string | null = null, overrides = {}) => ({ data: { node: { ...repo(), pullRequest: {
    ...pr(), ...overrides, files: connection(nodes, 2, next),
  } } } });

function fixture(replacements: Record<string, unknown> = {}) {
  const calls: { query: string; variables: Record<string, string | number | null> }[] = [];
  const routes: Record<string, unknown> = { inventory: inventory(), 'prs:REPO1': prs(),
    'prs:REPO2': prs([], 0, null, repo(2)), 'files:REPO1:1': files(), ...replacements };
  const transport: GithubGraphqlTransport = async (query, variables) => {
    calls.push({ query, variables });
    const kind = query.includes('PrSourceInventory') ? 'inventory' : query.includes('PrSourceFiles') ? 'files' : 'prs';
    const key = kind + (kind === 'inventory' ? '' : `:${variables.repositoryId}`)
      + (kind === 'files' ? `:${variables.number}` : '') + (variables.after ? `:${variables.after}` : '');
    const response = routes[key];
    if (response instanceof Error) throw response;
    if (response === undefined) throw new Error('Unexpected synthetic fixture request');
    return structuredClone(response);
  };
  return { calls, transport };
}
function config(): CollectorConfig {
  return { organization: 'rwjf', projects: ['INSUP', 'RWJFINVEST'], year: 2026, timezone: 'America/New_York',
    productionEnvironments: ['Prod', 'Production'], jiraExclusions: { issueTypeIds: [], resolutionIds: [], confirmed: true },
    inventoryPath: new URL('../fixtures/pr-source-inventory.json', import.meta.url).pathname, sleep: async () => {} };
}
async function collect(replacements: Record<string, unknown> = {}) {
  const f = fixture(replacements);
  return { ...f, result: await collectMergedPullRequests(config(), period, { transport: f.transport }) };
}

describe('merged pull-request source', () => {
  it('fully paginates archived repositories, merged PRs and files; emits only normalized DTOs and anonymous progress', async () => {
    const f = fixture({ inventory: inventory([repo()], 2, 'repos-next'),
      'inventory:repos-next': inventory([repo(2)], 2),
      'prs:REPO1': prs([pr()], 2, 'prs-next'),
      'prs:REPO1:prs-next': prs([pr(2, { author: { __typename: 'Bot' } })], 2),
      'files:REPO1:1': files([file('src/pr-source-a.ts', 2, 1)], 'files-next'),
      'files:REPO1:1:files-next': files([file('src/pr-source-b.ts')]),
      'files:REPO1:2': files(undefined, null, { number: 2, author: { __typename: 'Bot' } }),
    });
    const progress: PullRequestProgress[] = [];
    const result = await collectMergedPullRequests(config(), period, { transport: f.transport, onProgress: (p) => progress.push(p) });
    expect(result.coverage).toMatchObject({ complete: true, inventoryVerified: true, issues: [] });
    expect(result.records).toHaveLength(2);
    expect(result.records[0]).toEqual({ repositoryId: '1', number: 1, mergedAt: '2026-02-01T12:00:00Z',
      authorType: 'User', reportedAdditions: 3, reportedDeletions: 1, changedFiles: 2, filesComplete: true,
      files: [file('src/pr-source-a.ts', 2, 1), file('src/pr-source-b.ts')] });
    expect(result.records[1]?.authorType).toBe('Bot');
    expect(f.calls).toHaveLength(8);
    expect(progress.at(-1)).toMatchObject({ phase: 'complete', repositoriesCompleted: 2, pullRequestsCompleted: 2, filePagesCompleted: 3 });
    expect(progress.every((p) => Number.isFinite(Date.parse(p.lastUpdateTime)))).toBe(true);
    expect(JSON.stringify(progress)).not.toMatch(/rwjf|pr-source|REPO/);
    expect(f.calls.map((c) => c.query).join(' ')).not.toMatch(/\b(mutation|search|title|body|patch|reviews|createdAt|updatedAt|name)\b/);
    expect(f.calls.map((c) => c.query).join(' ')).not.toMatch(/author\s*\{[^}]*login/);
  });

  it('uses mergedAt only, including old-created and post-cutoff-updated PRs, and excludes cutoff/endpoints', async () => {
    const nodes = [pr(1, { createdAt: '2020-01-01T00:00:00Z' }),
      pr(2, { updatedAt: '2027-01-01T00:00:00Z' }), pr(3, { mergedAt: period.cutoffExclusive }),
      pr(4, { mergedAt: '2026-01-01T04:59:59Z' }), pr(5, { mergedAt: period.start })];
    const { result, calls } = await collect({ 'prs:REPO1': prs(nodes),
      'files:REPO1:2': files(undefined, null, { number: 2 }),
      'files:REPO1:5': files(undefined, null, { number: 5, mergedAt: period.start }) });
    expect(result.coverage.complete).toBe(true);
    expect(result.records.map((r) => r.number)).toEqual([1, 2, 5]);
    expect(calls.filter((c) => c.query.includes('PrSourceFiles'))).toHaveLength(3);
  });

  it.each(['inventory', 'prs', 'files'])('rejects repeated and missing %s cursors', async (kind) => {
    for (const cursor of ['same', null]) {
      const filePage = (path: string) => ({ data: { node: { ...repo(), pullRequest: {
        ...pr(1, { changedFiles: 3 }), files: connection([file(path)], 3, 'same'),
      } } } });
      const first = kind === 'inventory' ? inventory([repo()], 3, 'same')
        : kind === 'prs' ? prs([pr()], 3, 'same') : filePage('src/pr-source-a.ts');
      const second = kind === 'inventory' ? inventory([repo(2)], 3, 'same')
        : kind === 'prs' ? prs([pr(2)], 3, 'same') : filePage('src/pr-source-b.ts');
      const data = 'organization' in second.data ? second.data.organization.repositories
        : 'pullRequests' in second.data.node ? second.data.node.pullRequests : second.data.node.pullRequest.files;
      data.pageInfo.endCursor = cursor;
      const key = kind === 'inventory' ? 'inventory' : kind === 'prs' ? 'prs:REPO1' : 'files:REPO1:1';
      const { result, calls } = await collect({ ...(kind === 'files' ? { 'prs:REPO1': prs([pr(1, { changedFiles: 3 })]) } : {}),
        [key]: first, [`${key}:same`]: second });
      expect(result.coverage.complete).toBe(false);
      expect(result.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
      expect(calls.length).toBeLessThan(9);
    }
  });

  it.each(['inventory', 'prs:REPO1', 'files:REPO1:1'])('blocks partial GraphQL errors at %s without consuming partial data', async (key) => {
    const partial = key === 'inventory' ? inventory() : key.startsWith('prs') ? prs() : files();
    const { result } = await collect({ [key]: { ...partial, errors: [{ type: 'FORBIDDEN', message: 'private secret' }] } });
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.issues.some((i) => i.reason === 'denied')).toBe(true);
    expect(result.records.every((r) => !r.filesComplete)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private secret');
  });

  it.each([null, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('rejects malformed or null counters (%s)', async (value) => {
    for (const field of ['additions', 'deletions', 'changedFiles']) {
      const { result } = await collect({ 'prs:REPO1': prs([pr(1, { [field]: value })]) });
      expect(result.coverage.complete).toBe(false);
      expect(result.records).toEqual([]);
    }
  });

  it.each([
    files([file('src/pr-source-a.ts', 3, 1)]),
    files([file('src/pr-source-a.ts', 2, 1), file('src/pr-source-a.ts')]),
    files(undefined, null, { additions: 4 }),
    files(undefined, null, { changedFiles: 3001 }),
    files(undefined, null, { deletions: null }),
    files([file('src/pr-source-a.ts', 9, 1), file('src/pr-source-b.ts')]),
  ])('blocks missing/repeated/capped files and mismatched or malformed counters', async (response) => {
    const { result } = await collect({ 'files:REPO1:1': response });
    expect(result.coverage.complete).toBe(false);
    expect(result.records[0]?.filesComplete).toBe(false);
  });

  it.each(['additions', 'deletions', 'changedFiles'])('rejects changing %s across file continuation pages', async (field) => {
    const { result } = await collect({ 'files:REPO1:1': files([file('src/pr-source-a.ts', 2, 1)], 'next'),
      'files:REPO1:1:next': files([file('src/pr-source-b.ts')], null, { [field]: 4 }) });
    expect(result.coverage.complete).toBe(false);
    expect(result.records[0]?.filesComplete).toBe(false);
  });

  it.each([null, { __typename: 'Mannequin' }])('records unknown authors as mapping issues, never humans', async (author) => {
    const { result } = await collect({ 'prs:REPO1': prs([pr(1, { author })]), 'files:REPO1:1': files(undefined, null, { author }) });
    expect(result.records[0]?.authorType).toBe(author?.__typename ?? null);
    expect(result.coverage.issues.some((i) => i.reason === 'mapping')).toBe(true);
  });

  it.each(['inventory', 'prs:REPO1', 'files:REPO1:1'])('rejects foreign owner scope at %s', async (key) => {
    const foreign = { ...repo(), owner: { ...owner, login: 'foreign' } };
    const response = key === 'inventory' ? inventory([foreign, repo(2)])
      : key.startsWith('prs') ? prs([pr()], 1, null, foreign)
        : { data: { node: { ...foreign, pullRequest: { ...pr(), files: connection([]) } } } };
    const { result } = await collect({ [key]: response });
    expect(result.coverage.complete).toBe(false);
    expect(result.records.every((r) => !r.filesComplete)).toBe(true);
  });

  it('retains independent inventory uncertainty as the narrowly scoped inventory issue', async () => {
    const c = config();
    delete c.inventoryPath;
    const result = await collectMergedPullRequests(c, period, { transport: fixture().transport });
    expect(result.coverage).toMatchObject({ complete: false, inventoryVerified: false,
      issues: [{ source: 'github-inventory', identifier: 'github-inventory', reason: 'inventory' }] });
    expect(result.records[0]?.filesComplete).toBe(true);
  });

  it.each(['RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'network'])('bounds transient/rate-limit exhaustion and sanitizes %s failures', async (type) => {
    let attempts = 0;
    const waits: number[] = [];
    const c = config();
    c.sleep = async (ms) => { waits.push(ms); };
    const transport: GithubGraphqlTransport = async () => {
      attempts++;
      if (type === 'network') throw new Error('private secret');
      return { errors: [{ type, message: 'private secret' }] };
    };
    const result = await collectMergedPullRequests(c, period, { transport });
    expect(attempts).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits.every((ms) => ms <= 5000)).toBe(true);
    expect(result.coverage.complete).toBe(false);
    expect(JSON.stringify(result)).not.toContain('private secret');
  });

  it('does not retry permission failures or report them as empty', async () => {
    const { result, calls } = await collect({ inventory: { errors: [{ type: 'FORBIDDEN', message: 'secret' }] } });
    expect(calls).toHaveLength(1);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.sourceChecks).toContainEqual({ source: 'github-pr-repositories', status: 'denied' });
  });

  it('recovers transient reads and keeps a genuine empty PR connection available', async () => {
    const f = fixture({ 'prs:REPO1': prs([]) });
    let attempts = 0;
    const result = await collectMergedPullRequests(config(), period, { transport: async (q, v) => {
      if (attempts++ === 0) return { errors: [{ type: 'SERVICE_UNAVAILABLE' }] };
      return f.transport(q, v);
    } });
    expect(result.coverage.complete).toBe(true);
    expect(result.records).toEqual([]);
    expect(result.coverage.sourceChecks).toContainEqual({ source: 'github-merged-prs', status: 'empty' });
  });

  it('refuses the known file ceiling before requesting an unprovable file set', async () => {
    const { result, calls } = await collect({ 'prs:REPO1': prs([pr(1, { changedFiles: 3001 })]) });
    expect(result.coverage.complete).toBe(false);
    expect(result.records[0]?.filesComplete).toBe(false);
    expect(calls.some((c) => c.query.includes('PrSourceFiles'))).toBe(false);
  });

  it('accepts a genuinely empty diff only when all file counters agree', async () => {
    const empty = pr(1, { changedFiles: 0, additions: 0, deletions: 0 });
    const { result } = await collect({ 'prs:REPO1': prs([empty]), 'files:REPO1:1': {
      data: { node: { ...repo(), pullRequest: { ...empty, files: connection([]) } } },
    } });
    expect(result.coverage.complete).toBe(true);
    expect(result.records[0]).toMatchObject({ filesComplete: true, files: [], changedFiles: 0 });
  });

  it.each(['inventory', 'prs:REPO1', 'files:REPO1:1'])('fails closed on null/missing %s connection data', async (key) => {
    for (const response of [{ data: null }, { data: {} }, { data: { organization: null, node: null } },
      { errors: 'malformed' }, { data: {}, errors: [null] }]) {
      const { result } = await collect({ [key]: response });
      expect(result.coverage.complete).toBe(false);
      expect(result.records.every((r) => !r.filesComplete)).toBe(true);
    }
  });

  it.each([null, -1, 1.5, '1'])('rejects malformed per-file counters (%s)', async (value) => {
    for (const field of ['additions', 'deletions']) {
      const response = files([{ ...file('src/pr-source-a.ts', 2, 1), [field]: value }, file('src/pr-source-b.ts')]);
      const { result } = await collect({ 'files:REPO1:1': response });
      expect(result.coverage.complete).toBe(false);
      expect(result.records[0]?.filesComplete).toBe(false);
    }
  });

  it('does not retry transient-typed errors with partial data', async () => {
    const { result, calls } = await collect({ inventory: { ...inventory(), errors: [{ type: 'SERVICE_UNAVAILABLE' }] } });
    expect(calls).toHaveLength(1);
    expect(result.coverage.complete).toBe(false);
    expect(result.records).toEqual([]);
  });

  it.each([
    { inventory: inventory([repo(), repo()]) },
    { inventory: inventory([repo()], 2) },
    { inventory: inventory([repo()], 2, 'next'), 'inventory:next': inventory([repo(2)], 3) },
    { 'prs:REPO1': prs([pr(), pr()]) },
    { 'prs:REPO1': prs([pr()], 2) },
    { 'prs:REPO1': prs([pr()], 2, 'next'), 'prs:REPO1:next': prs([pr(2)], 3) },
  ])('rejects duplicate identities, hidden truncation, and changing connection totals', async (replacements) => {
    const { result } = await collect(replacements);
    expect(result.coverage.complete).toBe(false);
    expect(result.coverage.issues.some((i) => i.reason === 'pagination')).toBe(true);
  });

  it.each([
    { ...repo(), id: 'OTHER' }, { ...repo(), databaseId: 99 },
    { ...repo(), nameWithOwner: 'rwjf/pr-source-renamed' },
    { ...repo(), owner: { ...owner, id: 'OTHER' } },
  ])('binds continuation reads to verified repository identities', async (repository) => {
    const { result } = await collect({ 'prs:REPO1': prs([pr()], 1, null, repository) });
    expect(result.coverage.complete).toBe(false);
    expect(result.records).toEqual([]);
  });

  it('does not accept an arbitrary organization alias', async () => {
    const c = { ...config(), organization: 'foreign' } as unknown as CollectorConfig;
    const f = fixture();
    await expect(collectMergedPullRequests(c, period, { transport: f.transport })).rejects.toThrow('Unsupported organization scope');
    expect(f.calls).toEqual([]);
  });

  it('sanitizes malformed merge instants rather than exposing source timestamps in a thrown error', async () => {
    const { result } = await collect({ 'prs:REPO1': prs([pr(1, { mergedAt: '2026-02-30T12:00:00Z' })]) });
    expect(result.coverage.complete).toBe(false);
    expect(result.records).toEqual([]);
    expect(JSON.stringify(result.coverage)).not.toContain('2026-02-30');
  });
});
