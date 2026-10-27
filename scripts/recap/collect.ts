import { resolve } from 'node:path';
import { z } from 'zod';
import type { PublicSnapshot } from '../../src/data/schema';
import { collectGithub } from './github';
import { collectJira } from './jira';
import type { CollectorConfig, CoverageReport } from './model';
import { countDependencyFixes, countProductionDeployments, countWorkItems } from './metrics';
import { makePeriod } from './period';
import { atomicWrite, digest, isMain, jsonText, PROJECT_ROOT, readText } from './artifacts';
import { METRIC_KEYS, parseCuratedSnapshot, publicCoverage, readableCoverage, type ReviewReport } from './policy';

const configSchema = z.object({
  organization: z.literal('rwjf'), projects: z.tuple([z.literal('INSUP'), z.literal('RWJFINVEST')]),
  year: z.literal(2026), timezone: z.literal('America/New_York'),
  productionEnvironments: z.tuple([z.literal('Prod'), z.literal('Production')]),
  jiraExclusions: z.object({ issueTypeIds: z.array(z.string().min(1)), resolutionIds: z.array(z.string().min(1)),
    confirmed: z.boolean().default(false) }).strict(),
  inventoryPath: z.string().min(1).optional(), jiraBaseUrl: z.string().optional(),
}).strict();

interface CollectionOptions {
  root?: string;
  year?: number;
  asOf?: string;
  collectors?: { github: typeof collectGithub; jira: typeof collectJira };
}

function failedCoverage(source: string): CoverageReport {
  return { complete: false, inventoryVerified: false,
    issues: [{ source, identifier: source, reason: 'failed' }], sourceChecks: [{ source, status: 'failed' }] };
}

export async function collectSnapshot(options: CollectionOptions = {}): Promise<PublicSnapshot> {
  try {
    const root = options.root ?? PROJECT_ROOT;
    const config: CollectorConfig = configSchema.parse(JSON.parse(await readText(root, 'recap.config.json')));
    if (options.year !== undefined && options.year !== config.year) throw new Error('Unsupported year');
    if (config.inventoryPath) config.inventoryPath = resolve(root, config.inventoryPath);
    const collectedAt = new Date(options.asOf ?? Date.now()).toISOString();
    const period = makePeriod(config.year, collectedAt);
    const collectors = options.collectors ?? { github: collectGithub, jira: collectJira };
    // Catch at each source boundary, never serialize a source exception or its message.
    const [github, jira] = await Promise.all([
      collectors.github(config, period).catch(() => ({
        alerts: { records: [], coverage: failedCoverage('github') },
        deployments: { records: [], coverage: failedCoverage('github') },
      })),
      collectors.jira(config, period).catch(() => ({ records: [], coverage: failedCoverage('jira') })),
    ]);
    if (!config.jiraExclusions.confirmed) {
      jira.coverage.complete = false;
      jira.coverage.issues.push({ source: 'jira-exclusions', identifier: 'approval-required', reason: 'mapping' });
    }
    const reports = { dependencyAlertsFixed: github.alerts.coverage,
      productionDeployments: github.deployments.coverage, workItemsClosed: jira.coverage };
    const unavailable = (): PublicSnapshot['metrics']['workItemsClosed'] => ({ status: 'unavailable', count: null, breakdown: [] });
    const snapshot = parseCuratedSnapshot({ schemaVersion: 1, mode: 'real', year: config.year,
      timezone: period.timezone, periodStart: period.start, periodEndExclusive: period.endExclusive,
      cutoffExclusive: period.cutoffExclusive, collectedAt,
      isYearToDate: Date.parse(period.cutoffExclusive) < Date.parse(period.endExclusive),
      metrics: {
        dependencyAlertsFixed: readableCoverage(reports.dependencyAlertsFixed)
          ? countDependencyFixes(github.alerts.records, period) : unavailable(),
        productionDeployments: readableCoverage(reports.productionDeployments)
          ? countProductionDeployments(github.deployments.records, period, config.productionEnvironments) : unavailable(),
        workItemsClosed: readableCoverage(reports.workItemsClosed)
          ? countWorkItems(jira.records, period, config.jiraExclusions) : unavailable(),
      }, coverage: publicCoverage(reports),
    });
    const candidateText = jsonText(snapshot);
    const report: ReviewReport = { schemaVersion: 1, candidateHash: digest(candidateText),
      jiraExclusionsConfirmed: config.jiraExclusions.confirmed, metrics: reports };
    // Each rename is atomic. The report binds the pair, so an interrupted pair cannot be approved.
    await atomicWrite(root, '.recap-private/coverage.json', jsonText(report));
    await atomicWrite(root, '.recap-private/candidate.json', candidateText);
    return snapshot;
  } catch {
    throw new Error('Collection failed; check local configuration and source access. No approval was changed.');
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 2 || args[0] !== '--year' || args[1] !== '2026') throw new Error('Invalid arguments');
    const snapshot = await collectSnapshot({ year: Number(args[1]) });
    const unavailable = METRIC_KEYS.some((key) => snapshot.metrics[key].status === 'unavailable');
    console.log(unavailable ? 'Candidate saved with unavailable metrics; approval is blocked.'
      : 'Candidate and private coverage saved. Review both before approval.');
    if (unavailable) process.exitCode = 1;
  } catch {
    console.error('Collection failed. Usage: npm run collect -- --year 2026. Check local configuration and source access.');
    process.exitCode = 1;
  }
}
