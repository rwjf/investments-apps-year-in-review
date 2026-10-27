import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { approveSnapshot } from '../../scripts/recap/approve';
import { digest, jsonText, readText } from '../../scripts/recap/artifacts';
import { loadBuildSnapshot } from '../../scripts/recap/build-input';
import type { collectMergedPullRequests } from '../../scripts/recap/github-prs';
import type { CoverageReport } from '../../scripts/recap/model';
import { ACCESSIBLE_SCOPE_NOTE, publicCoverage, ReviewReportSchema, validateReviewInputs } from '../../scripts/recap/policy';
import type { MergedPullRequestRecord } from '../../scripts/recap/pull-request-model';

const roots: string[] = [];
const cutoff = '2026-10-27T17:28:51.121Z';
const collectedAt = '2026-10-28T12:00:00.000Z';
const boundPaths = ['src/data/approved.json', '.recap-private/candidate.json',
  '.recap-private/coverage.json', '.recap-private/approval.json'];
const clean = (): CoverageReport => ({ complete: true, inventoryVerified: true, issues: [],
  sourceChecks: [{ source: 'private-source-marker', status: 'success' }] });
function records(): MergedPullRequestRecord[] {
  return [{ repositoryId: 'private-repository-marker', number: 7, mergedAt: '2026-07-01T12:00:00Z',
    authorType: 'Bot', reportedAdditions: 57060, reportedDeletions: 103, changedFiles: 2, filesComplete: true,
    files: [{ path: 'src/private-file-marker.ts', additions: 56960, deletions: 3 },
      { path: 'package-lock.json', additions: 100, deletions: 100 }] },
  { repositoryId: 'private-repository-marker', number: 8, mergedAt: '2026-08-01T12:00:00Z',
    authorType: 'User', reportedAdditions: 40, reportedDeletions: 2, changedFiles: 1, filesComplete: true,
    files: [{ path: 'src/another-private-file.ts', additions: 40, deletions: 2 }] }];
}
const source = (items = records(), coverage = clean()): typeof collectMergedPullRequests =>
  async (_config, _period, options) => {
    options?.onProgress?.({ phase: 'complete', repositoriesCompleted: 1, pullRequestsCompleted: items.length,
      filePagesCompleted: items.length, lastUpdateTime: collectedAt });
    return { records: items, coverage };
  };
async function setup(accessible = false) {
  const root = await mkdtemp(join(tmpdir(), 'playful-collection-'));
  roots.push(root);
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, '.recap-private'), { recursive: true });
  const snapshot = JSON.parse(await readFile(new URL('../fixtures/snapshot-v1.json', import.meta.url), 'utf8'));
  snapshot.mode = 'real';
  snapshot.cutoffExclusive = cutoff;
  snapshot.collectedAt = cutoff;
  snapshot.metrics.dependencyAlertsFixed = { status: 'available', count: 935, breakdown: [{ label: 'High', count: 935 }] };
  snapshot.metrics.productionDeployments.count = 67;
  snapshot.metrics.productionDeployments.breakdown = snapshot.metrics.productionDeployments.breakdown.map(
    (entry: { label: string }) => ({ label: entry.label, count: entry.label === '2026-08' ? 67 : 0 }));
  snapshot.metrics.workItemsClosed = { status: 'available', count: 515,
    breakdown: [{ label: 'Task', count: 306 }, { label: 'Bug', count: 209 }] };
  const coverage = clean();
  if (accessible) {
    coverage.complete = false;
    coverage.inventoryVerified = false;
    coverage.issues.push({ source: 'github-inventory', identifier: 'private-inventory', reason: 'inventory' });
  }
  const metrics = { dependencyAlertsFixed: coverage, productionDeployments: clean(), workItemsClosed: clean() };
  snapshot.coverage = publicCoverage(metrics);
  const text = jsonText(snapshot);
  await writeFile(join(root, '.recap-private/candidate.json'), text);
  await writeFile(join(root, '.recap-private/coverage.json'), jsonText({ schemaVersion: 1,
    candidateHash: digest(text), jiraExclusionsConfirmed: true, metrics }));
  await writeFile(join(root, 'recap.config.json'), jsonText({ organization: 'rwjf',
    projects: ['INSUP', 'RWJFINVEST'], year: 2026, timezone: 'America/New_York',
    productionEnvironments: ['Prod', 'Production'],
    jiraExclusions: { issueTypeIds: [], resolutionIds: [], confirmed: true }, inventoryPath: 'private-inventory.json' }));
  await approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: accessible });
  await mkdir(join(root, 'dist'));
  await writeFile(join(root, 'dist/index.html'), 'existing served static snapshot');
  return root;
}
async function collect(root: string, collector = source()) {
  const module = await import('../../scripts/recap/collect-playful');
  return module.collectPlayfulSnapshot({ root, collector, collectedAt });
}
async function bundle(root: string) {
  return Promise.all(boundPaths.map((path) => readText(root, path)));
}
async function latest(root: string) {
  return JSON.parse(await readText(root, '.recap-private/playful-latest.json')) as {
    backupPath: string; recordsPath: string; sourceCoveragePath: string; progressPath: string;
  };
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('fixture-backed playful augmentation', () => {
  it('exports the required augmentation entry point', async () => {
    await expect(import('../../scripts/recap/collect-playful')).resolves.toHaveProperty('collectPlayfulSnapshot', expect.any(Function));
  });

  it.each([false, true])('preserves reviewed core values, coverage and cutoff (accessible=%s)', async (accessible) => {
    const root = await setup(accessible);
    const base = await loadBuildSnapshot({ root, allowDemo: false });
    const oldReport = ReviewReportSchema.parse(JSON.parse(await readText(root, '.recap-private/coverage.json')));
    const collector = vi.fn(source());
    const snapshot = await collect(root, collector);
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.metrics).toEqual(base.metrics);
    expect(snapshot.metrics.dependencyAlertsFixed.count).toBe(935);
    expect(snapshot.metrics.productionDeployments.count).toBe(67);
    expect(snapshot.metrics.workItemsClosed.count).toBe(515);
    expect(snapshot.cutoffExclusive).toBe(cutoff);
    expect(snapshot.collectedAt).toBe(collectedAt);
    expect(collector).toHaveBeenCalledOnce();
    expect(collector.mock.calls[0]![0]).toMatchObject({ organization: 'rwjf', year: 2026,
      inventoryPath: join(root, 'private-inventory.json') });
    expect(collector.mock.calls[0]![1]).toEqual({ start: base.periodStart, endExclusive: base.periodEndExclusive,
      cutoffExclusive: cutoff, timezone: base.timezone });
    expect(snapshot.playful).toEqual({ methodologyVersion: 'known-generated-v1',
      mergedPullRequests: { status: 'available', count: 2 }, linesAdded: { status: 'available', count: 57000 },
      linesRemoved: { status: 'available', count: 5 }, botAuthoredPullRequests: { status: 'available', count: 1 },
      unknownAuthorPullRequests: 0 });
    const text = await readText(root, '.recap-private/candidate.json');
    expect(text).not.toMatch(/private-|repositoryId|authorType|filesComplete|reportedAdditions|package-lock/);
    const reportText = await readText(root, '.recap-private/coverage.json');
    const report = ReviewReportSchema.parse(JSON.parse(reportText));
    expect(report).toMatchObject({ schemaVersion: 2, candidateHash: digest(text), metrics: oldReport.metrics,
      playfulCoverage: clean() });
    expect(validateReviewInputs(text, reportText, accessible)).toEqual(snapshot);
    expect(snapshot.coverage.notes).toEqual(accessible ? [ACCESSIBLE_SCOPE_NOTE] : []);
    const paths = await latest(root);
    expect(JSON.parse(await readText(root, paths.recordsPath))).toEqual(records());
    expect(JSON.parse(await readText(root, paths.sourceCoveragePath))).toEqual(clean());
    expect(JSON.parse(await readText(root, paths.progressPath))).toMatchObject({ phase: 'complete', pullRequestsCompleted: 2 });
  });

  it('backs up all four exact bound inputs in a validated, restorable root before replacing either pending file', async () => {
    const root = await setup(true);
    const before = await bundle(root);
    const collector: typeof collectMergedPullRequests = async (...args) => {
      expect(await bundle(root)).toEqual(before);
      const runs = await readdir(join(root, '.recap-private/playful-runs'));
      expect(runs).toHaveLength(1);
      const backup = join(root, '.recap-private/playful-runs', runs[0]!, 'backup');
      expect(await bundle(backup)).toEqual(before);
      expect((await loadBuildSnapshot({ root: backup, allowDemo: false })).schemaVersion).toBe(1);
      return source()(...args);
    };
    await collect(root, collector);
    const after = await bundle(root);
    expect(after[0]).toBe(before[0]);
    expect(after[3]).toBe(before[3]);
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow('Build blocked');
    await expect(approveSnapshot({ root })).rejects.toThrow('Approval refused');
    const paths = await latest(root);
    for (const path of boundPaths) await cp(join(root, paths.backupPath, path), join(root, path));
    expect(await bundle(root)).toEqual(before);
    expect((await loadBuildSnapshot({ root, allowDemo: false })).schemaVersion).toBe(1);
    expect(await readText(root, 'dist/index.html')).toBe('existing served static snapshot');
  });

  it('requires fresh explicit approval for both v1 and repeated approved-v2 augmentation', async () => {
    const root = await setup();
    for (const added of [40, 80]) {
      const before = await bundle(root);
      const items = records().slice(1);
      items[0]!.reportedAdditions = added;
      items[0]!.files[0]!.additions = added;
      const snapshot = await collect(root, source(items));
      expect(await readText(root, 'src/data/approved.json')).toBe(before[0]);
      await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow('Build blocked');
      const paths = await latest(root);
      expect(await bundle(join(root, paths.backupPath))).toEqual(before);
      await approveSnapshot({ root, confirmReviewed: true });
      expect(await loadBuildSnapshot({ root, allowDemo: false })).toEqual(snapshot);
      expect(snapshot.playful.linesAdded.count).toBe(added);
    }
    expect(await readdir(join(root, '.recap-private/playful-runs'))).toHaveLength(2);
  });

  it.each(['unknown', 'incomplete', 'counters', 'pagination', 'graphql', 'throw', 'invalid-count', 'invalid-instant'] as const)(
    'records unavailable metrics and unwaivable coverage for %s without replacing approved JSON', async (failure) => {
      const root = await setup(true);
      const before = await bundle(root);
      const items = records();
      const coverage = clean();
      if (failure === 'unknown') items[0]!.authorType = null;
      if (failure === 'incomplete') items[0]!.filesComplete = false;
      if (failure === 'counters') items[0]!.reportedAdditions++;
      if (failure === 'invalid-count') items[0]!.files[0]!.additions = -1;
      if (failure === 'invalid-instant') items[0]!.mergedAt = '2026-07-01TFAKE_TOKEN_private-source+0000';
      if (failure === 'pagination' || failure === 'graphql') {
        coverage.complete = false;
        coverage.issues.push({ source: 'github-pr-files', identifier: 'private-source-marker',
          reason: failure === 'pagination' ? 'pagination' : 'failed' });
      }
      const collector = failure === 'throw' ? async () => { throw new Error('FAKE_TOKEN_private-source-marker'); } : source(items, coverage);
      const snapshot = await collect(root, collector);
      expect(Object.values(snapshot.playful)).toContainEqual({ status: 'unavailable', count: null });
      expect(await readText(root, 'src/data/approved.json')).toBe(before[0]);
      expect(await readText(root, '.recap-private/approval.json')).toBe(before[3]);
      const report = ReviewReportSchema.parse(JSON.parse(await readText(root, '.recap-private/coverage.json')));
      expect(report.schemaVersion).toBe(2);
      if (report.schemaVersion === 2) {
        expect(report.playfulCoverage.complete).toBe(false);
        expect(report.playfulCoverage.issues.some((issue) => issue.reason !== 'inventory')).toBe(true);
      }
      await expect(approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true })).rejects.toThrow('Approval refused');
      expect(await readText(root, '.recap-private/candidate.json')).not.toMatch(/private-|FAKE_TOKEN/);
      expect(await readText(root, '.recap-private/coverage.json')).not.toContain('FAKE_TOKEN');
      const paths = await latest(root);
      if (failure === 'invalid-instant') {
        expect(JSON.parse(await readText(root, paths.recordsPath))).toEqual([]);
        expect(await readText(root, paths.sourceCoveragePath)).not.toContain('FAKE_TOKEN');
      }
      expect(await bundle(join(root, paths.backupPath))).toEqual(before);
      expect(await readText(root, 'dist/index.html')).toBe('existing served static snapshot');
    });

  it('allows only independent inventory uncertainty and requires acknowledgment at explicit approval', async () => {
    const root = await setup();
    const coverage = clean();
    coverage.complete = false;
    coverage.inventoryVerified = false;
    coverage.issues.push({ source: 'github-inventory', identifier: 'private-inventory', reason: 'inventory' });
    const snapshot = await collect(root, source(records(), coverage));
    expect(snapshot.playful.linesAdded.count).toBe(57000);
    expect(snapshot.coverage.notes).toEqual([ACCESSIBLE_SCOPE_NOTE]);
    await expect(approveSnapshot({ root, confirmReviewed: true })).rejects.toThrow();
    await approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true });
    expect(await loadBuildSnapshot({ root, allowDemo: false })).toEqual(snapshot);
  });

  it.each(['approved', 'receipt', 'config', 'timestamp', 'backup'] as const)(
    'fails closed before collection or canonical writes for invalid %s, with generic errors', async (failure) => {
      const root = await setup();
      if (failure === 'approved') await writeFile(join(root, 'src/data/approved.json'), 'FAKE_TOKEN_private');
      if (failure === 'receipt') await writeFile(join(root, '.recap-private/approval.json'), '{}');
      if (failure === 'config') await writeFile(join(root, 'recap.config.json'), '{"organization":"FAKE_TOKEN_private"}');
      if (failure === 'backup') await writeFile(join(root, '.recap-private/playful-runs'), 'not a directory');
      const before = await bundle(root);
      const collector = vi.fn(source());
      const { collectPlayfulSnapshot } = await import('../../scripts/recap/collect-playful');
      await expect(collectPlayfulSnapshot({ root, collector, collectedAt: failure === 'timestamp' ? 'FAKE_TOKEN_private' : collectedAt }))
        .rejects.toThrow(/^Playful collection failed; check approved inputs, local configuration, and source access\. No approval was changed\.$/);
      expect(collector).not.toHaveBeenCalled();
      expect(await bundle(root)).toEqual(before);
    });

  it('preserves honest empty-source zeros without inventing bot share or book fields', async () => {
    const root = await setup();
    const snapshot = await collect(root, source([]));
    expect(snapshot.playful.mergedPullRequests.count).toBe(0);
    expect(snapshot.playful.botAuthoredPullRequests.count).toBe(0);
    expect(snapshot.playful.linesAdded.count).toBe(0);
    expect(snapshot.playful).not.toHaveProperty('botShare');
    expect(snapshot.playful).not.toHaveProperty('bookEquivalents');
  });

  it('recomputes aggregates from normalized records, ignoring supplied derived fields and private extras', async () => {
    const root = await setup();
    const items = records().map((record) => ({ ...record, login: 'FAKE_TOKEN_actor',
      files: record.files.map((file) => ({ ...file, patch: 'FAKE_TOKEN_patch' })) }));
    const snapshot = await collect(root, async () => ({ records: items, coverage: clean(),
      playful: { mergedPullRequests: { status: 'available', count: 100 }, bookEquivalents: 500 } }));
    expect(snapshot.playful.mergedPullRequests.count).toBe(2);
    expect(snapshot.playful.linesAdded.count).toBe(57000);
    expect(snapshot.playful.botAuthoredPullRequests.count).toBe(1);
    expect(await readText(root, '.recap-private/candidate.json')).not.toMatch(/FAKE_TOKEN|bookEquivalents|patch|login/);
    const paths = await latest(root);
    expect(await readText(root, paths.recordsPath)).not.toMatch(/FAKE_TOKEN|patch|login/);
  });

  it('applies the approved end-exclusive cutoff, not the later collection timestamp', async () => {
    const root = await setup();
    const items = records();
    items[1]!.mergedAt = cutoff;
    const snapshot = await collect(root, source(items));
    expect(snapshot.playful.mergedPullRequests.count).toBe(1);
    expect(snapshot.playful.linesAdded.count).toBe(56960);
    expect(snapshot.playful.linesRemoved.count).toBe(3);
  });

  it.each(['2026-07-01T12:00:00+0000', '2026-07-01T12:00:00+0530', '2026-07-01T12:00:00-0400'])(
    'accepts compact source offset %s, retains records, and permits fresh explicit approval', async (mergedAt) => {
      const root = await setup();
      const items = records();
      items[0]!.mergedAt = mergedAt;
      const snapshot = await collect(root, source(items));
      expect(snapshot.playful).toEqual({ methodologyVersion: 'known-generated-v1',
        mergedPullRequests: { status: 'available', count: 2 }, linesAdded: { status: 'available', count: 57000 },
        linesRemoved: { status: 'available', count: 5 }, botAuthoredPullRequests: { status: 'available', count: 1 },
        unknownAuthorPullRequests: 0 });
      const paths = await latest(root);
      expect(JSON.parse(await readText(root, paths.recordsPath))).toEqual(items);
      expect(JSON.parse(await readText(root, paths.sourceCoveragePath))).toEqual(clean());
      await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow('Build blocked');
      await expect(approveSnapshot({ root })).rejects.toThrow('Approval refused');
      await approveSnapshot({ root, confirmReviewed: true });
      expect(await loadBuildSnapshot({ root, allowDemo: false })).toEqual(snapshot);
    });

  it('refuses to overwrite a concurrently changed review bundle and keeps the original recoverable backup', async () => {
    const root = await setup();
    const before = await bundle(root);
    await expect(collect(root, async (...args) => {
      await writeFile(join(root, '.recap-private/candidate.json'), 'concurrent local review');
      return source()(...args);
    })).rejects.toThrow('Playful collection failed');
    expect(await readText(root, '.recap-private/candidate.json')).toBe('concurrent local review');
    expect(await readText(root, '.recap-private/coverage.json')).toBe(before[2]);
    const paths = await latest(root);
    expect(await bundle(join(root, paths.backupPath))).toEqual(before);
  });

  it('returns a nonzero generic CLI failure using only an isolated stub collector, never the real source', async () => {
    const root = await setup();
    await cp(new URL('../../scripts/recap/', import.meta.url), join(root, 'scripts/recap'), { recursive: true });
    for (const path of ['schema.ts', 'playful.ts']) {
      await cp(new URL(`../../src/data/${path}`, import.meta.url), join(root, 'src/data', path));
    }
    await writeFile(join(root, 'scripts/recap/github-prs.ts'),
      'export async function collectMergedPullRequests() { throw new Error("FAKE_TOKEN_private-source"); }');
    await symlink(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    const before = await bundle(root);
    try {
      await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
        join(root, 'scripts/recap/collect-playful.ts')], { cwd: tmpdir(), timeout: 30000 });
      throw new Error('CLI unexpectedly succeeded');
    } catch (error) {
      const result = error as { code: number; stdout: string; stderr: string };
      expect(result.code).toBe(1);
      expect(result.stdout + result.stderr).toMatch(/unavailable|blocked/i);
      expect(result.stdout + result.stderr).not.toMatch(/FAKE_TOKEN|private-source/);
    }
    expect(await readText(root, 'src/data/approved.json')).toBe(before[0]);
    await expect(approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true })).rejects.toThrow();
  }, 30000);
});
