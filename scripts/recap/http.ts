import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { CollectorConfig, CoverageReport, SourceRequest, SourceResponse } from './model';

const execFileAsync = promisify(execFile);
const MAX_WAIT_MS = 5000;

export function newCoverage(): CoverageReport {
  return { complete: true, inventoryVerified: false, issues: [], sourceChecks: [] };
}

export function incomplete(
  coverage: CoverageReport,
  source: string,
  reason: CoverageReport['issues'][number]['reason'],
  identifier = source,
): void {
  coverage.complete = false;
  coverage.issues.push({ source, identifier, reason });
}

function normalizedHeaders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
}

/** gh emits the HTTP response on stdout even when an HTTP error sets a nonzero exit code. */
function parseGhResponse(stdout: string): SourceResponse {
  const match = /^HTTP\/\S+ (\d{3})[^\r\n]*\r?\n([\s\S]*?)\r?\n\r?\n([\s\S]*)$/.exec(stdout);
  if (!match) throw new Error('Invalid GitHub response');
  const headers: Record<string, string> = {};
  for (const line of match[2]!.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers[line.slice(0, colon).toLowerCase()] = line.slice(colon + 1).trim();
  }
  return { status: Number(match[1]), headers, body: JSON.parse(match[3]!) };
}

async function localTransport(config: CollectorConfig, request: SourceRequest): Promise<SourceResponse> {
  if (!request.path.startsWith('/') || request.path.startsWith('//') || /[\r\n\\]/.test(request.path)) {
    throw new Error('Invalid source path');
  }
  if (request.source === 'github') {
    if (request.method !== 'GET' || request.body) throw new Error('GitHub transport is read-only');
    const args = ['api', '--hostname', 'github.com', '--include', '--method', 'GET',
      '-H', 'Accept: application/vnd.github+json', '-H', 'X-GitHub-Api-Version: 2022-11-28', request.path];
    let stdout: string;
    try {
      ({ stdout } = await execFileAsync('gh', args, { timeout: 30000, maxBuffer: 32 * 1024 * 1024 }));
    } catch (error) {
      // Do not propagate subprocess stderr: it can contain private source details.
      const output = (error as { stdout?: unknown }).stdout;
      if (typeof output !== 'string' || !output.startsWith('HTTP/')) throw new Error('GitHub read failed');
      stdout = output;
    }
    return parseGhResponse(stdout);
  }

  if (request.method === 'POST' && request.path !== '/rest/api/3/search/jql') {
    throw new Error('Jira transport is read-only');
  }
  const base = new URL(config.jiraBaseUrl ?? process.env.JIRA_BASE_URL ?? '');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new Error('Invalid Jira base URL');
  }
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) throw new Error('Local Jira credentials unavailable');
  const response = await fetch(new URL(request.path, base), {
    method: request.method,
    headers: {
      Accept: 'application/json', 'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
    },
    body: request.body ? JSON.stringify(request.body) : undefined,
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.json() };
}

export async function requestWithRetry(config: CollectorConfig, request: SourceRequest): Promise<SourceResponse> {
  const transport = config.transport ?? ((input) => localTransport(config, input));
  const sleep = config.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 0; attempt < 3; attempt++) {
    let response: SourceResponse;
    try {
      response = await transport(request);
      response = { ...response, headers: normalizedHeaders(response.headers) };
    } catch {
      response = { status: 0, headers: {}, body: null };
    }
    const rateLimited = response.status === 429 || (response.status === 403
      && (response.headers['x-ratelimit-remaining'] === '0' || response.headers['retry-after'] !== undefined));
    if ((!rateLimited && response.status !== 0 && response.status !== 408 && response.status < 500) || attempt === 2) {
      return response;
    }
    const value = response.headers['retry-after'];
    const seconds = value && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : NaN;
    const dateWait = value ? Date.parse(value) - Date.now() : NaN;
    const requested = Number.isFinite(seconds) ? seconds : dateWait;
    await sleep(Number.isFinite(requested) && requested >= 0
      ? Math.min(requested, MAX_WAIT_MS) : Math.min(1000 * 2 ** attempt, MAX_WAIT_MS));
  }
  throw new Error('Unreachable retry state');
}

export function checkResponse(response: SourceResponse, coverage: CoverageReport, source: string): boolean {
  if (response.status >= 200 && response.status < 300) return true;
  const message = z.object({ message: z.string() }).safeParse(response.body);
  // Only an explicit feature-disabled response is disabled; ambiguous 404s remain inaccessible.
  const disabled = (response.status === 403 || response.status === 404) && message.success
    && /^Dependabot alerts (?:are disabled|are not enabled|have not been enabled)\b/i.test(message.data.message);
  const status = disabled ? 'disabled' : response.status === 401 || response.status === 403 ? 'denied' : 'failed';
  coverage.sourceChecks.push({ source, status });
  incomplete(coverage, source, status === 'denied' ? 'denied'
    : response.status === 404 || response.status === 410 ? 'inaccessible' : 'failed');
  return false;
}

export async function readGithubPages<T>(
  config: CollectorConfig, path: string, schema: z.ZodType<T>, coverage: CoverageReport,
  canonicalPath?: string,
): Promise<T[]> {
  const resource = new URL(path, 'https://api.github.com');
  const filterScope = (url: URL): string => {
    const filters = new URLSearchParams(url.searchParams);
    for (const cursor of ['page', 'before', 'after']) filters.delete(cursor);
    filters.sort();
    return filters.toString();
  };
  const records: T[] = [];
  const seen = new Set<string>();
  const seenPages = new Set<string>();
  let next: string | undefined = path;
  while (next) {
    const canonical = new URL(next, 'https://api.github.com');
    canonical.searchParams.sort();
    const cursor = canonical.pathname + canonical.search;
    if (seen.has(cursor)) { incomplete(coverage, path, 'pagination'); break; }
    seen.add(cursor);
    const response = await requestWithRetry(config, { source: 'github', method: 'GET', path: next });
    if (!checkResponse(response, coverage, next)) break;
    const parsed = z.array(schema).safeParse(response.body);
    if (!parsed.success) {
      coverage.sourceChecks.push({ source: next, status: 'failed' });
      incomplete(coverage, next, 'failed');
      break;
    }
    coverage.sourceChecks.push({ source: next, status: parsed.data.length ? 'success' : 'empty' });
    const pageKey = JSON.stringify(parsed.data);
    if (parsed.data.length && seenPages.has(pageKey)) { incomplete(coverage, path, 'pagination'); break; }
    seenPages.add(pageKey);
    records.push(...parsed.data);
    const link: string | undefined = response.headers.link;
    next = undefined;
    if (link) {
      const links = link.split(/,(?=\s*<)/);
      if (links.some((part) => !/^\s*<[^>]+>\s*;\s*rel="[a-z ]+"(?:\s*;[^,]+)?\s*$/.test(part))) {
        incomplete(coverage, path, 'pagination'); break;
      }
      const nextLinks = links.filter((part) => /;\s*rel="next"(?:\s*;|\s*$)/.test(part));
      if (nextLinks.length > 1) { incomplete(coverage, path, 'pagination'); break; }
      if (nextLinks.length === 1) {
        try {
          const target = /^\s*<([^>]+)>/.exec(nextLinks[0]!)?.[1];
          if (!target) throw new Error('Invalid Link');
          const url = new URL(target);
          // Only an alias bound to fetched entity metadata may change the resource pathname.
          // Pagination cursors may change, but filters (notably state=fixed) must not.
          if (url.origin !== 'https://api.github.com' || url.username || url.password || url.hash
            || (url.pathname !== resource.pathname && url.pathname !== canonicalPath)
            || filterScope(url) !== filterScope(resource)) throw new Error('Invalid Link');
          next = url.pathname + url.search;
        } catch { incomplete(coverage, path, 'pagination'); break; }
      }
    }
  }
  return records;
}

export const sourceId = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String);
export const sourceInstant = z.string().refine((value) => value.includes('T')
  && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) && Number.isFinite(Date.parse(value)));
