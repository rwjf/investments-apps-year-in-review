import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { incomplete, newCoverage, sourceInstant } from './http';
import type { CollectionResult, CollectorConfig, Period } from './model';
import { withinPeriod } from './period';
import type { MergedPullRequestRecord } from './pull-request-model';

export type GithubGraphqlTransport = (query: string, variables: Record<string, string | number | null>) => Promise<unknown>;
/** Private traversal tallies; "complete" means traversal ended, not that coverage passed. */
export interface PullRequestProgress {
  phase: 'repositories' | 'pull-requests' | 'files' | 'complete';
  repositoriesCompleted: number;
  pullRequestsCompleted: number;
  filePagesCompleted: number;
  lastUpdateTime: string;
}

const repositoryFields = 'id databaseId nameWithOwner isArchived owner { id login __typename }';
const pullRequestFields = 'number mergedAt additions deletions changedFiles author { __typename }';
const pageFields = 'totalCount pageInfo { hasNextPage endCursor }';
const inventoryQuery = `query PrSourceInventory($after: String) {
  organization(login: "rwjf") { id databaseId login
    repositories(first: 100, after: $after) { ${pageFields} nodes { ${repositoryFields} } }
  }
}`;
const pullRequestsQuery = `query PrSourcePullRequests($repositoryId: ID!, $after: String) {
  node(id: $repositoryId) { ... on Repository { ${repositoryFields}
    pullRequests(first: 100, after: $after, states: [MERGED]) { ${pageFields} nodes { ${pullRequestFields} } }
  } }
}`;
const filesQuery = `query PrSourceFiles($repositoryId: ID!, $number: Int!, $after: String) {
  node(id: $repositoryId) { ... on Repository { ${repositoryFields}
    pullRequest(number: $number) { ${pullRequestFields}
      files(first: 100, after: $after) { ${pageFields} nodes { path additions deletions } }
    }
  } }
}`;
const queries = new Set([inventoryQuery, pullRequestsQuery, filesQuery]);
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const databaseId = count.positive();
const repositorySchema = z.object({
  id: z.string().min(1), databaseId, nameWithOwner: z.string().regex(/^rwjf\/[A-Za-z0-9_.-]+$/),
  isArchived: z.boolean(), owner: z.object({ id: z.string().min(1), login: z.literal('rwjf'), __typename: z.literal('Organization') }),
});
const pullRequestSchema = z.object({
  number: databaseId, mergedAt: sourceInstant, additions: count, deletions: count, changedFiles: count,
  author: z.object({ __typename: z.string().min(1) }).nullable(),
});
const fileSchema = z.object({ path: z.string().min(1), additions: count, deletions: count });
const inventorySchema = z.object({
  repositoryIds: z.array(z.string().min(1)), historicalCoverageConfirmed: z.literal(true),
  jiraProjects: z.array(z.string()).optional(), jiraVisibilityConfirmed: z.boolean().optional(),
}).strict();
const envelopeSchema = z.object({ data: z.unknown().optional(), errors: z.array(z.object({
  type: z.string().optional(), extensions: z.object({ code: z.string().optional() }).optional(),
})).optional() });
function connectionSchema<T>(node: z.ZodType<T>) {
  return z.object({ nodes: z.array(node), totalCount: count,
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().min(1).nullable() }) });
}
class ReadError extends Error {
  constructor(readonly denied: boolean, readonly retryable: boolean) { super('GitHub GraphQL read failed'); }
}

// Only these fixed queries can reach gh; variable values are JSON stdin, never shell text.
const localTransport: GithubGraphqlTransport = async (query, variables) => {
  if (!queries.has(query)) throw new ReadError(false, false);
  return new Promise((resolve, reject) => {
    const child = execFile('gh', ['api', '--hostname', 'github.com', 'graphql', '--include', '--method', 'POST', '--input', '-'],
      { timeout: 30000, maxBuffer: 32 * 1024 * 1024 }, (_error, stdout) => {
        const match = /^HTTP\/\S+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(stdout);
        if (!match) { reject(new ReadError(false, true)); return; }
        const status = Number(match[1]);
        const rateLimited = status === 429 || (status === 403
          && /^(?:x-ratelimit-remaining:\s*0|retry-after:)/im.test(match[2]!));
        // gh also exits nonzero for GraphQL errors inside HTTP 200; parse those below.
        if (status < 200 || status >= 300) {
          reject(new ReadError((status === 401 || status === 403) && !rateLimited,
            rateLimited || status === 408 || status >= 500));
          return;
        }
        try { resolve(JSON.parse(match[3]!)); } catch { reject(new ReadError(false, false)); }
      });
    child.stdin?.on('error', () => { /* The callback handles process/pipe failure without exposing stderr. */ });
    child.stdin?.end(JSON.stringify({ query, variables }));
  });
};

export async function collectMergedPullRequests(
  config: CollectorConfig, period: Period,
  options?: { transport?: GithubGraphqlTransport; onProgress?: (progress: PullRequestProgress) => void },
): Promise<CollectionResult<MergedPullRequestRecord>> {
  if (config.organization !== 'rwjf') throw new Error('Unsupported organization scope');
  const coverage = newCoverage();
  const records: MergedPullRequestRecord[] = [];
  const transport = options?.transport ?? localTransport;
  const sleep = config.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const progress: PullRequestProgress = { phase: 'repositories', repositoriesCompleted: 0,
    pullRequestsCompleted: 0, filePagesCompleted: 0, lastUpdateTime: new Date().toISOString() };
  function update(phase: PullRequestProgress['phase']) {
    progress.phase = phase;
    progress.lastUpdateTime = new Date().toISOString();
    options?.onProgress?.({ ...progress });
  }
  function failed(source: string, reason: 'failed' | 'denied' | 'pagination' = 'failed') {
    coverage.sourceChecks.push({ source, status: reason === 'denied' ? 'denied' : 'failed' });
    incomplete(coverage, source, reason);
  }
  async function request(query: string, variables: Record<string, string | number | null>, source: string): Promise<unknown> {
    for (let attempt = 0; attempt < 3; attempt++) {
      let denied = false;
      let retryable = false;
      try {
        const parsed = envelopeSchema.safeParse(await transport(query, variables));
        if (!parsed.success) { failed(source); return undefined; }
        const errors = parsed.data.errors ?? [];
        if (!errors.length && parsed.data.data != null) return parsed.data.data;
        const types = errors.map((e) => e.type ?? e.extensions?.code);
        denied = types.some((type) => type === 'FORBIDDEN' || type === 'UNAUTHORIZED');
        // Partial data is never consumed or retried into an apparently complete page.
        retryable = parsed.data.data == null && errors.length > 0 && types.every((type) =>
          ['RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'INTERNAL', 'INTERNAL_SERVER_ERROR'].includes(type ?? ''));
      } catch (error) {
        denied = error instanceof ReadError && error.denied;
        retryable = !(error instanceof ReadError) || error.retryable;
      }
      if (!retryable || attempt === 2) { failed(source, denied ? 'denied' : 'failed'); return undefined; }
      await sleep(Math.min(1000 * 2 ** attempt, 5000));
    }
    return undefined;
  }
  async function pages<T>(
    query: string, variables: Record<string, string | number | null>, source: string,
    schema: z.ZodType<T>, extract: (data: unknown) => unknown, key: (node: T) => string,
    onPage?: () => void,
  ): Promise<T[]> {
    const nodes: T[] = [];
    const cursors = new Set<string>();
    const identities = new Set<string>();
    let after: string | null = null;
    let total: number | undefined;
    while (true) {
      const data = await request(query, { ...variables, after }, source);
      if (data === undefined) break;
      let page: z.infer<ReturnType<typeof connectionSchema<T>>>;
      try { page = connectionSchema(schema).parse(extract(data)); }
      catch { failed(source); break; }
      coverage.sourceChecks.push({ source, status: page.nodes.length ? 'success' : 'empty' });
      if (total !== undefined && total !== page.totalCount) { failed(source, 'pagination'); break; }
      total = page.totalCount;
      if (page.nodes.some((node) => identities.has(key(node)))
        || new Set(page.nodes.map(key)).size !== page.nodes.length) { failed(source, 'pagination'); break; }
      for (const node of page.nodes) { identities.add(key(node)); nodes.push(node); }
      onPage?.();
      if (nodes.length > total) { failed(source, 'pagination'); break; }
      const { hasNextPage, endCursor } = page.pageInfo;
      if (!hasNextPage) {
        if (nodes.length !== total) failed(source, 'pagination');
        break;
      }
      if (!endCursor || cursors.has(endCursor) || !page.nodes.length || nodes.length >= total) {
        failed(source, 'pagination'); break;
      }
      cursors.add(endCursor);
      after = endCursor;
    }
    return nodes;
  }

  update('repositories');
  let organizationId: string | undefined;
  let organizationDatabaseId: number | undefined;
  const repositories = await pages(inventoryQuery, {}, 'github-pr-repositories', repositorySchema, (data) => {
    const organization = z.object({ organization: z.object({ id: z.string().min(1), databaseId,
      login: z.literal('rwjf'), repositories: z.unknown() }) }).parse(data).organization;
    if (organizationId !== undefined && (organizationId !== organization.id || organizationDatabaseId !== organization.databaseId)) {
      throw new Error('Organization scope changed');
    }
    organizationId = organization.id;
    organizationDatabaseId = organization.databaseId;
    const connection = connectionSchema(repositorySchema).parse(organization.repositories);
    if (connection.nodes.some((r) => r.owner.id !== organizationId)) throw new Error('Repository scope mismatch');
    return connection;
  }, (r) => r.id, () => update('repositories'));
  const inventoryReadComplete = coverage.complete;
  const ids = new Set(repositories.map((r) => String(r.databaseId)));
  if (ids.size !== repositories.length) failed('github-pr-repositories', 'pagination');
  try {
    if (!config.inventoryPath) throw new Error('Independent inventory unavailable');
    const inventory = inventorySchema.parse(JSON.parse(await readFile(config.inventoryPath, 'utf8')));
    const expected = new Set(inventory.repositoryIds);
    if (expected.size !== inventory.repositoryIds.length || expected.size !== ids.size
      || [...expected].some((id) => !ids.has(id))) throw new Error('Independent inventory mismatch');
    coverage.inventoryVerified = coverage.complete;
  } catch { incomplete(coverage, 'github-inventory', 'inventory'); }
  if (!inventoryReadComplete || ids.size !== repositories.length) {
    update('complete');
    return { records, coverage };
  }

  for (const repository of repositories) {
    function repositoryNode(data: unknown): Record<string, unknown> {
      const node = z.object({ node: repositorySchema.passthrough() }).parse(data).node;
      if (node.id !== repository.id || node.databaseId !== repository.databaseId
        || node.nameWithOwner !== repository.nameWithOwner || node.owner.id !== organizationId) {
        throw new Error('Repository scope changed');
      }
      return node;
    }
    update('pull-requests');
    // Enumerate the MERGED connection in full: neither creation nor update time bounds mergedAt.
    const pullRequests = await pages(pullRequestsQuery, { repositoryId: repository.id }, 'github-merged-prs',
      pullRequestSchema, (data) => repositoryNode(data).pullRequests, (p) => String(p.number), () => update('pull-requests'));
    for (const pr of pullRequests) {
      try { if (!withinPeriod(pr.mergedAt, period)) continue; }
      catch { failed('github-merged-prs'); continue; }
      const authorType = pr.author?.__typename ?? null;
      if (authorType !== 'Bot' && authorType !== 'User') incomplete(coverage, 'github-pr-authors', 'mapping');
      const record: MergedPullRequestRecord = { repositoryId: String(repository.databaseId), number: pr.number,
        mergedAt: pr.mergedAt, authorType, reportedAdditions: pr.additions, reportedDeletions: pr.deletions,
        changedFiles: pr.changedFiles, filesComplete: false, files: [] };
      const before = coverage.issues.length;
      update('files');
      // GitHub file connections cannot prove completeness above the documented 3,000-file ceiling.
      if (pr.changedFiles > 3000) failed('github-pr-files', 'pagination');
      else record.files = await pages(filesQuery, { repositoryId: repository.id, number: pr.number }, 'github-pr-files',
        fileSchema, (data) => {
          const current = pullRequestSchema.extend({ files: z.unknown() }).parse(repositoryNode(data).pullRequest);
          if (current.number !== pr.number || current.mergedAt !== pr.mergedAt || current.additions !== pr.additions
            || current.deletions !== pr.deletions || current.changedFiles !== pr.changedFiles
            || (current.author?.__typename ?? null) !== authorType) throw new Error('Pull-request counters changed');
          const connection = connectionSchema(fileSchema).parse(current.files);
          if (connection.totalCount !== pr.changedFiles) throw new Error('Changed-file count mismatch');
          return connection;
        }, (f) => f.path, () => { progress.filePagesCompleted++; update('files'); });
      if (record.files.length !== pr.changedFiles
        || record.files.reduce((sum, f) => sum + f.additions, 0) !== pr.additions
        || record.files.reduce((sum, f) => sum + f.deletions, 0) !== pr.deletions) {
        failed('github-pr-files', 'pagination');
      }
      record.filesComplete = before === coverage.issues.length;
      records.push(record);
      progress.pullRequestsCompleted++;
      update('pull-requests');
    }
    progress.repositoriesCompleted++;
    update('pull-requests');
  }
  update('complete');
  return { records, coverage };
}
