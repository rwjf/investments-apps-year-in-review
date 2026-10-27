import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { CollectionResult, CollectorConfig, IssueRecord, Period } from './model';
import { checkResponse, incomplete, newCoverage, requestWithRetry, sourceInstant } from './http';

const namedIdSchema = z.object({ id: z.string().min(1), name: z.string().min(1) });
const issueSchema = z.object({
  id: z.string().min(1),
  fields: z.object({
    project: z.object({ key: z.enum(['INSUP', 'RWJFINVEST']) }),
    issuetype: namedIdSchema,
    status: z.object({ statusCategory: z.object({ key: z.enum(['new', 'indeterminate', 'done']) }) }),
    resolution: z.object({ id: z.string().min(1) }).nullable(),
    resolutiondate: sourceInstant.nullable(),
  }),
});
const pageSchema = z.object({
  issues: z.array(issueSchema), isLast: z.boolean().optional(), nextPageToken: z.string().min(1).optional(),
});

export async function collectJira(config: CollectorConfig, period: Period): Promise<CollectionResult<IssueRecord>> {
  if (JSON.stringify(config.projects) !== JSON.stringify(['INSUP', 'RWJFINVEST'])) {
    throw new Error('Unsupported Jira project scope');
  }
  const result: CollectionResult<IssueRecord> = { records: [], coverage: newCoverage() };
  // Jira search can silently omit issues protected by issue-level security. A successful
  // response alone cannot establish complete project visibility, including for zero results.
  try {
    if (!config.inventoryPath) throw new Error('No independent visibility review');
    const inventory = z.object({
      jiraProjects: z.tuple([z.literal('INSUP'), z.literal('RWJFINVEST')]),
      jiraVisibilityConfirmed: z.literal(true),
    }).parse(JSON.parse(await readFile(config.inventoryPath, 'utf8')));
    result.coverage.inventoryVerified = inventory.jiraVisibilityConfirmed;
  } catch {
    incomplete(result.coverage, 'jira-project-visibility', 'inventory');
  }
  const discoveredTypes = new Set<string>();
  const discoveredResolutions = new Set<string>();
  for (const path of ['/rest/api/3/project/INSUP/statuses', '/rest/api/3/project/RWJFINVEST/statuses', '/rest/api/3/resolution']) {
    const response = await requestWithRetry(config, { source: 'jira', method: 'GET', path });
    if (!checkResponse(response, result.coverage, path)) continue;
    const parsed = z.array(namedIdSchema).safeParse(response.body);
    if (!parsed.success) {
      result.coverage.sourceChecks.push({ source: path, status: 'failed' });
      incomplete(result.coverage, path, 'failed');
      continue;
    }
    result.coverage.sourceChecks.push({ source: path, status: parsed.data.length ? 'success' : 'empty' });
    const target = path.endsWith('/resolution') ? discoveredResolutions : discoveredTypes;
    for (const entry of parsed.data) target.add(entry.id);
  }
  const exclusions = config.jiraExclusions;
  if (!exclusions.confirmed) incomplete(result.coverage, 'jira-exclusions', 'mapping', 'approval-required');
  for (const id of exclusions.issueTypeIds) {
    if (!discoveredTypes.has(id)) incomplete(result.coverage, 'jira-issue-types', 'mapping', id);
  }
  for (const id of exclusions.resolutionIds) {
    if (!discoveredResolutions.has(id)) incomplete(result.coverage, 'jira-resolutions', 'mapping', id);
  }

  // JQL date literals use the Jira account timezone. Broaden the server-side window,
  // then leave exact instant/cutoff and business exclusions to the pure reducer.
  const date = (instant: string, days: number) => new Date(Date.parse(instant) + days * 86400000).toISOString().slice(0, 10);
  const jql = `project in ("INSUP", "RWJFINVEST") AND resolutiondate >= "${date(period.start, -1)}" AND resolutiondate < "${date(period.cutoffExclusive, 2)}" ORDER BY id ASC`;
  const path = '/rest/api/3/search/jql';
  const seenTokens = new Set<string>();
  const seenIds = new Set<string>();
  let token: string | undefined;
  while (true) {
    const response = await requestWithRetry(config, { source: 'jira', method: 'POST', path, body: {
      jql, maxResults: 100, fields: ['project', 'issuetype', 'status', 'resolution', 'resolutiondate'],
      includeArchivedProjects: true, ...(token ? { nextPageToken: token } : {}),
    } });
    if (!checkResponse(response, result.coverage, path)) break;
    const parsed = pageSchema.safeParse(response.body);
    if (!parsed.success) {
      result.coverage.sourceChecks.push({ source: path, status: 'failed' });
      incomplete(result.coverage, path, 'failed');
      break;
    }
    result.coverage.sourceChecks.push({ source: path, status: parsed.data.issues.length ? 'success' : 'empty' });
    for (const issue of parsed.data.issues) {
      if (seenIds.has(issue.id)) { incomplete(result.coverage, path, 'pagination', issue.id); continue; }
      seenIds.add(issue.id);
      const fields = issue.fields;
      if (!discoveredTypes.has(fields.issuetype.id)
        || (fields.resolution && !discoveredResolutions.has(fields.resolution.id))) {
        incomplete(result.coverage, 'jira-mapping', 'mapping', issue.id);
      }
      result.records.push({ id: issue.id, project: fields.project.key,
        issueTypeId: fields.issuetype.id, issueTypeName: fields.issuetype.name,
        statusCategory: fields.status.statusCategory.key, resolutionId: fields.resolution?.id ?? null,
        resolvedAt: fields.resolutiondate });
    }
    const next = parsed.data.nextPageToken;
    if (parsed.data.isLast === true) {
      if (next) incomplete(result.coverage, path, 'pagination');
      break;
    }
    if (!next) {
      // The API also supports a terminal page with no token and no isLast flag.
      if (parsed.data.isLast === false) incomplete(result.coverage, path, 'pagination');
      break;
    }
    if (seenTokens.has(next)) { incomplete(result.coverage, path, 'pagination'); break; }
    seenTokens.add(next);
    token = next;
  }
  return result;
}
