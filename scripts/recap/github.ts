import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { AlertRecord, CollectionResult, CollectorConfig, DeploymentRecord, Period } from './model';
import { incomplete, newCoverage, readGithubPages, sourceId, sourceInstant } from './http';

const repositorySchema = z.object({
  id: sourceId,
  full_name: z.string().regex(/^rwjf\/[A-Za-z0-9_.-]+$/),
  archived: z.boolean(),
});
const alertSchema = z.object({
  repository: z.object({ id: sourceId }), number: z.number().int().positive(), state: z.literal('fixed'),
  fixed_at: sourceInstant,
  security_vulnerability: z.object({ severity: z.enum(['low', 'medium', 'high', 'critical']) }),
});
const deploymentSchema = z.object({ id: sourceId, environment: z.string().min(1) });
// Live REST histories also return waiting, despite its omission from the published state enum.
const statusSchema = z.object({ state: z.enum(['error', 'failure', 'inactive', 'in_progress', 'queued', 'pending', 'success', 'waiting']), created_at: sourceInstant });
const inventorySchema = z.object({
  repositoryIds: z.array(z.string().min(1)), historicalCoverageConfirmed: z.literal(true),
  jiraProjects: z.array(z.string()).optional(), jiraVisibilityConfirmed: z.boolean().optional(),
}).strict();

export async function collectGithub(config: CollectorConfig, _period: Period): Promise<{
  alerts: CollectionResult<AlertRecord>;
  deployments: CollectionResult<DeploymentRecord>;
}> {
  if (config.organization !== 'rwjf') throw new Error('Unsupported organization scope');
  const inventoryCoverage = newCoverage();
  const repositories = await readGithubPages(config, '/orgs/rwjf/repos?type=all&per_page=100', repositorySchema, inventoryCoverage);
  const ids = new Set(repositories.map((repo) => repo.id));
  if (ids.size !== repositories.length) incomplete(inventoryCoverage, 'github-inventory', 'inventory');
  try {
    if (!config.inventoryPath) throw new Error('No independent inventory');
    const inventory = inventorySchema.parse(JSON.parse(await readFile(config.inventoryPath, 'utf8')));
    const expected = new Set(inventory.repositoryIds);
    if (expected.size !== inventory.repositoryIds.length || expected.size !== ids.size
      || [...expected].some((id) => !ids.has(id))) throw new Error('Inventory mismatch');
    inventoryCoverage.inventoryVerified = inventoryCoverage.complete;
  } catch {
    incomplete(inventoryCoverage, 'github-inventory', 'inventory');
  }
  const alerts: CollectionResult<AlertRecord> = { records: [], coverage: structuredClone(inventoryCoverage) };
  const deployments: CollectionResult<DeploymentRecord> = { records: [], coverage: structuredClone(inventoryCoverage) };

  // Creation dates never bound alert fixes: an old alert may be fixed in the reporting year.
  const fixedAlerts = await readGithubPages(config, '/orgs/rwjf/dependabot/alerts?state=fixed&per_page=100', alertSchema, alerts.coverage);
  const alertIds = new Set<string>();
  for (const alert of fixedAlerts) {
    const key = `${alert.repository.id}:${alert.number}`;
    if (alertIds.has(key)) { incomplete(alerts.coverage, 'github-alerts', 'pagination', key); continue; }
    alertIds.add(key);
    if (!ids.has(alert.repository.id)) incomplete(alerts.coverage, 'github-alerts', 'inventory', alert.repository.id);
    alerts.records.push({ repositoryId: alert.repository.id, number: alert.number, state: alert.state,
      fixedAt: alert.fixed_at, severity: alert.security_vulnerability.severity });
  }
  for (const repository of repositories) {
    const path = `/repos/${repository.full_name}/deployments?per_page=100`;
    // No proven-safe creation ordering: traverse every deployment page, including archived repositories.
    const records = await readGithubPages(config, path, deploymentSchema, deployments.coverage);
    const deploymentIds = new Set<string>();
    for (const deployment of records) {
      if (deploymentIds.has(deployment.id)) { incomplete(deployments.coverage, path, 'pagination', deployment.id); continue; }
      deploymentIds.add(deployment.id);
      if (!['prod', 'production'].includes(deployment.environment.trim().toLowerCase())) continue;
      const statusPath = `/repos/${repository.full_name}/deployments/${encodeURIComponent(deployment.id)}/statuses?per_page=100`;
      const priorIssues = deployments.coverage.issues.length;
      const statuses = await readGithubPages(config, statusPath, statusSchema, deployments.coverage);
      if (deployments.coverage.issues.length !== priorIssues) continue;
      deployments.records.push({ repositoryId: repository.id, id: deployment.id, environment: deployment.environment,
        statuses: statuses.map((status) => ({ state: status.state, createdAt: status.created_at })) });
    }
  }
  return { alerts, deployments };
}
