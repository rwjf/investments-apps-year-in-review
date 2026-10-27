import { mkdir, mkdtemp } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { z } from 'zod';
import type { PlayfulMetrics } from '../../src/data/playful';
import { PublicSnapshotV2Schema, type PublicSnapshotV2 } from '../../src/data/schema';
import { atomicWrite, digest, isMain, jsonText, PROJECT_ROOT, readText } from './artifacts';
import { loadBuildSnapshot } from './build-input';
import { CODE_POLICY_VERSION } from './code-policy';
import { collectMergedPullRequests, type PullRequestProgress } from './github-prs';
import type { CoverageReport, Period } from './model';
import { publicCoverage, readableCoverage, ReviewReportSchema, ReviewReportV2Schema } from './policy';
import { countPullRequestActivity } from './pull-request-metrics';

const configSchema = z.object({
  organization: z.literal('rwjf'), projects: z.tuple([z.literal('INSUP'), z.literal('RWJFINVEST')]),
  year: z.literal(2026), timezone: z.literal('America/New_York'),
  productionEnvironments: z.tuple([z.literal('Prod'), z.literal('Production')]),
  jiraExclusions: z.object({ issueTypeIds: z.array(z.string().min(1)), resolutionIds: z.array(z.string().min(1)),
    confirmed: z.boolean().default(false) }).strict(),
  inventoryPath: z.string().min(1).optional(), jiraBaseUrl: z.string().optional(),
}).strict();
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
// Persist only the normalized private model, never extra transport fields or actor identities.
const recordSchema = z.object({
  repositoryId: z.string().min(1), number: count.positive(), mergedAt: z.iso.datetime({ offset: true }),
  authorType: z.string().nullable(), reportedAdditions: count, reportedDeletions: count,
  changedFiles: count, filesComplete: z.boolean(),
  files: z.array(z.object({ path: z.string().min(1), additions: count, deletions: count })),
});
const boundPaths = ['src/data/approved.json', '.recap-private/candidate.json',
  '.recap-private/coverage.json', '.recap-private/approval.json'] as const;

function failedCoverage(): CoverageReport {
  return { complete: false, inventoryVerified: false,
    issues: [{ source: 'github-prs', identifier: 'collection', reason: 'failed' }],
    sourceChecks: [{ source: 'github-prs', status: 'failed' }] };
}

function unavailableMetrics(): PlayfulMetrics {
  const unavailable = { status: 'unavailable', count: null } as const;
  return { methodologyVersion: CODE_POLICY_VERSION, mergedPullRequests: unavailable,
    linesAdded: unavailable, linesRemoved: unavailable, botAuthoredPullRequests: unavailable,
    unknownAuthorPullRequests: 0 };
}

export async function collectPlayfulSnapshot(options: {
  root?: string; collector?: typeof collectMergedPullRequests; collectedAt?: string;
} = {}): Promise<PublicSnapshotV2> {
  try {
    const root = options.root ?? PROJECT_ROOT;
    // The existing receipt is the authority for both the core data and reporting period.
    const base = await loadBuildSnapshot({ root, allowDemo: false });
    const inputs = await Promise.all(boundPaths.map((path) => readText(root, path)));
    const baseReport = ReviewReportSchema.parse(JSON.parse(inputs[2]!));
    const config = configSchema.parse(JSON.parse(await readText(root, 'recap.config.json')));
    if (config.inventoryPath) config.inventoryPath = resolve(root, config.inventoryPath);
    const collectedAt = z.iso.datetime().parse(options.collectedAt ?? new Date().toISOString());
    const period: Period = { start: base.periodStart, endExclusive: base.periodEndExclusive,
      cutoffExclusive: base.cutoffExclusive, timezone: base.timezone };

    const runParent = '.recap-private/playful-runs';
    await mkdir(resolve(root, runParent), { recursive: true, mode: 0o700 });
    const prefix = `${collectedAt.replace(/[:.]/g, '-')}-${digest(inputs[1]!).slice(0, 12)}-`;
    const runName = basename(await mkdtemp(resolve(root, runParent, prefix)));
    const runPath = `${runParent}/${runName}`;
    const paths = { backupPath: `${runPath}/backup`, recordsPath: `${runPath}/records.json`,
      sourceCoveragePath: `${runPath}/source-coverage.json`, progressPath: `${runPath}/progress.json` };
    const backupRoot = resolve(root, paths.backupPath);
    for (const [index, path] of boundPaths.entries()) await atomicWrite(backupRoot, path, inputs[index]!);
    // Verify byte fidelity AND that the whole copied proof bundle independently authorizes the base.
    const backupInputs = await Promise.all(boundPaths.map((path) => readText(backupRoot, path)));
    if (backupInputs.some((text, index) => text !== inputs[index])
      || JSON.stringify(await loadBuildSnapshot({ root: backupRoot, allowDemo: false })) !== JSON.stringify(base)) {
      throw new Error('Backup verification failed');
    }
    await atomicWrite(root, '.recap-private/playful-latest.json', jsonText(paths));

    let progress: PullRequestProgress | undefined;
    let lastProgressWrite = 0;
    let progressWriteFailed = false;
    let progressWrites = Promise.resolve();
    const onProgress = (update: PullRequestProgress) => {
      progress = { ...update };
      // Coalesce high-volume file traversal updates; completion is always persisted below.
      if (Date.now() - lastProgressWrite < 1000) return;
      lastProgressWrite = Date.now();
      const text = jsonText(progress);
      progressWrites = progressWrites.then(() => atomicWrite(root, paths.progressPath, text))
        .catch(() => { progressWriteFailed = true; });
    };
    await atomicWrite(root, paths.progressPath, jsonText({ phase: 'starting', lastUpdateTime: new Date().toISOString() }));
    let records: z.infer<typeof recordSchema>[] = [];
    let coverage: CoverageReport;
    let playful = unavailableMetrics();
    try {
      const result = await (options.collector ?? collectMergedPullRequests)(config, period, { onProgress });
      coverage = ReviewReportV2Schema.shape.playfulCoverage.parse(result.coverage);
      records = z.array(recordSchema).parse(result.records);
      playful = countPullRequestActivity(records, period);
      // Even if a collector incorrectly claims clean coverage, reducer quality failures cannot be waived.
      if (playful.unknownAuthorPullRequests > 0) {
        coverage.complete = false;
        coverage.issues.push({ source: 'github-pr-authors', identifier: 'classification', reason: 'mapping' });
      }
      if (playful.linesAdded.status === 'unavailable') {
        coverage.complete = false;
        coverage.issues.push({ source: 'github-pr-files', identifier: 'completeness', reason: 'pagination' });
      }
      if (!readableCoverage(coverage)) {
        playful = { ...unavailableMetrics(), unknownAuthorPullRequests: playful.unknownAuthorPullRequests };
      }
    } catch {
      // Never persist exception messages, partial GraphQL payloads, or plausible partial totals.
      coverage = failedCoverage();
      playful = unavailableMetrics();
    }
    await progressWrites;
    if (progressWriteFailed) throw new Error('Private progress write failed');
    await atomicWrite(root, paths.recordsPath, jsonText(records));
    await atomicWrite(root, paths.sourceCoveragePath, jsonText(coverage));
    await atomicWrite(root, paths.progressPath, jsonText({ ...progress, phase: 'complete',
      status: readableCoverage(coverage) ? 'complete' : 'blocked', lastUpdateTime: new Date().toISOString() }));

    const snapshot = PublicSnapshotV2Schema.parse({ ...base, schemaVersion: 2, collectedAt, playful,
      coverage: publicCoverage(baseReport.metrics, coverage) });
    const candidateText = jsonText(snapshot);
    const report = ReviewReportV2Schema.parse({ schemaVersion: 2, candidateHash: digest(candidateText),
      jiraExclusionsConfirmed: baseReport.jiraExclusionsConfirmed, metrics: baseReport.metrics, playfulCoverage: coverage });
    // Refuse to overwrite inputs changed by another local review while collection was running.
    const currentInputs = await Promise.all(boundPaths.map((path) => readText(root, path)));
    if (currentInputs.some((text, index) => text !== inputs[index])) throw new Error('Review inputs changed');
    // Atomic renames plus the report hash fail closed if interrupted between this pair.
    await atomicWrite(root, '.recap-private/coverage.json', jsonText(report));
    await atomicWrite(root, '.recap-private/candidate.json', candidateText);
    return snapshot;
  } catch {
    throw new Error('Playful collection failed; check approved inputs, local configuration, and source access. No approval was changed.');
  }
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Invalid arguments');
    const snapshot = await collectPlayfulSnapshot();
    const blocked = [snapshot.playful.mergedPullRequests, snapshot.playful.linesAdded,
      snapshot.playful.linesRemoved, snapshot.playful.botAuthoredPullRequests].some((metric) => metric.status === 'unavailable')
      || snapshot.playful.unknownAuthorPullRequests > 0;
    console.log(blocked ? 'Candidate saved with unavailable playful metrics; approval is blocked.'
      : 'Candidate and private coverage saved. Review both before explicit approval.');
    console.log('Private backup and source evidence paths: .recap-private/playful-latest.json');
    if (blocked) process.exitCode = 1;
  } catch {
    console.error('Playful collection failed. Usage: npm run collect:playful. Check approved inputs, local configuration, and source access. No approval was changed.');
    process.exitCode = 1;
  }
}
