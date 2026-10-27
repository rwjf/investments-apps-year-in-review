import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { collectSnapshot } from '../../scripts/recap/collect';
import { approveSnapshot } from '../../scripts/recap/approve';
import { loadBuildSnapshot } from '../../scripts/recap/build-input';
import type { CoverageIssueReason, CoverageReport } from '../../scripts/recap/model';

const roots: string[] = [];
const clean = (): CoverageReport => ({ complete: true, inventoryVerified: true, issues: [], sourceChecks: [{ source: 'private', status: 'empty' }] });
async function setup(reason?: CoverageIssueReason, confirmed = true) {
  const root = await mkdtemp(join(tmpdir(), 'recap approval '));
  roots.push(root);
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/demo.json'), await readFile(new URL('../../src/data/demo.json', import.meta.url)));
  await writeFile(join(root, 'recap.config.json'), JSON.stringify({ organization: 'rwjf', projects: ['INSUP', 'RWJFINVEST'], year: 2026,
    timezone: 'America/New_York', productionEnvironments: ['Prod', 'Production'],
    jiraExclusions: { issueTypeIds: [], resolutionIds: [], confirmed } }));
  const coverage = clean();
  if (reason) {
    coverage.complete = false;
    coverage.inventoryVerified = false;
    coverage.issues.push({ source: 'github-inventory', identifier: 'private', reason });
  }
  await collectSnapshot({ root, asOf: '2026-10-27T16:00:00Z', collectors: {
    github: async () => ({ alerts: { records: [], coverage }, deployments: { records: [], coverage: clean() } }),
    jira: async () => ({ records: [], coverage: clean() }),
  } });
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('explicit approval and static build gate', () => {
  it('requires explicit review and does not replace previous approved input on refusal', async () => {
    const root = await setup();
    await writeFile(join(root, 'src/data/approved.json'), 'prior');
    await expect(approveSnapshot({ root })).rejects.toThrow();
    expect(await readFile(join(root, 'src/data/approved.json'), 'utf8')).toBe('prior');
  });

  it('requires acknowledgment of independent inventory uncertainty and shows a canonical caveat', async () => {
    const root = await setup('inventory');
    await expect(approveSnapshot({ root, confirmReviewed: true })).rejects.toThrow();
    await approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true });
    const snapshot = await loadBuildSnapshot({ root, allowDemo: false });
    expect(snapshot.mode).toBe('real');
    expect(snapshot.metrics.dependencyAlertsFixed.count).toBe(0);
    expect(snapshot.coverage.scope).toBe('accessible-repositories');
    expect(snapshot.coverage.notes.join(' ')).toMatch(/accessible.*independent.*not verified/i);
  });

  it.each(['denied', 'failed', 'inaccessible', 'pagination', 'mapping'] as const)('never waives %s into valid approval', async (reason) => {
    const root = await setup(reason);
    const candidate = JSON.parse(await readFile(join(root, '.recap-private/candidate.json'), 'utf8'));
    expect(candidate.metrics.dependencyAlertsFixed.count).toBeNull();
    await expect(approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true })).rejects.toThrow();
  });

  it('blocks unconfirmed Jira mappings at approval', async () => {
    const root = await setup(undefined, false);
    await expect(approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true })).rejects.toThrow();
  });

  it('does not waive repository mapping/inventory mismatches as independent inventory uncertainty', async () => {
    const root = await setup('inventory');
    const path = join(root, '.recap-private/coverage.json');
    const report = JSON.parse(await readFile(path, 'utf8'));
    report.metrics.dependencyAlertsFixed.issues[0].source = 'github-alerts';
    await writeFile(path, JSON.stringify(report));
    await expect(approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true })).rejects.toThrow();
  });

  it.each(['denied', 'failed', 'disabled'] as const)('does not waive an inventory gap with a %s source check', async (status) => {
    const root = await setup('inventory');
    const path = join(root, '.recap-private/coverage.json');
    const report = JSON.parse(await readFile(path, 'utf8'));
    report.metrics.dependencyAlertsFixed.sourceChecks[0].status = status;
    await writeFile(path, JSON.stringify(report));
    await expect(approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: true })).rejects.toThrow();
  });

  it('loads real data only with a receipt matching candidate, private report, and approved input', async () => {
    const root = await setup();
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow();
    await approveSnapshot({ root, confirmReviewed: true });
    expect((await loadBuildSnapshot({ root, allowDemo: false })).coverage.scope).toBe('verified-organization');
  });

  it.each(['candidate.json', 'coverage.json', 'approval.json'] as const)('rejects changed or missing %s', async (file) => {
    const root = await setup();
    await approveSnapshot({ root, confirmReviewed: true });
    const path = join(root, '.recap-private', file);
    await writeFile(path, `${await readFile(path, 'utf8')}\n`);
    // Receipt whitespace is harmless; changing its reviewed field is not.
    if (file === 'approval.json') {
      const receipt = JSON.parse(await readFile(path, 'utf8'));
      receipt.confirmReviewed = false;
      await writeFile(path, JSON.stringify(receipt));
    }
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow();
    await unlink(path);
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow();
  });

  it('rejects a changed approved snapshot', async () => {
    const root = await setup();
    await approveSnapshot({ root, confirmReviewed: true });
    await writeFile(join(root, 'src/data/approved.json'), '{}');
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow();
  });

  it.each(['mode', 'note', 'label', 'extra'] as const)('rejects candidate %s tampering without disclosing fake credentials', async (field) => {
    const root = await setup();
    const path = join(root, '.recap-private/candidate.json');
    const candidate = JSON.parse(await readFile(path, 'utf8'));
    const secret = 'FAKE_CREDENTIAL_do_not_echo';
    if (field === 'mode') candidate.mode = 'demo';
    if (field === 'note') candidate.coverage.notes = [secret];
    if (field === 'label') candidate.metrics.workItemsClosed.breakdown = [{ label: secret, count: 0 }];
    if (field === 'extra') candidate.private = { token: secret };
    await writeFile(path, JSON.stringify(candidate));
    await expect(approveSnapshot({ root, confirmReviewed: true })).rejects.toThrow();
    await expect(approveSnapshot({ root, confirmReviewed: true })).rejects.not.toThrow(secret);
  });

  it.each(['label', 'note', 'demo'] as const)('rejects noncanonical %s even when report hash is updated', async (field) => {
    const root = await setup();
    const { createHash } = await import('node:crypto');
    const candidatePath = join(root, '.recap-private/candidate.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    if (field === 'label') candidate.metrics.workItemsClosed.breakdown = [{ label: 'FAKE_CREDENTIAL_raw_label', count: 1 }];
    if (field === 'label') candidate.metrics.workItemsClosed.count = 1;
    if (field === 'note') candidate.coverage.notes = ['FAKE_CREDENTIAL_raw_note'];
    if (field === 'demo') {
      candidate.mode = 'demo';
      candidate.coverage.notes = ['Illustrative example only; no source data was collected.'];
    }
    const text = JSON.stringify(candidate);
    await writeFile(candidatePath, text);
    const reportPath = join(root, '.recap-private/coverage.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.candidateHash = createHash('sha256').update(text).digest('hex');
    await writeFile(reportPath, JSON.stringify(report));
    await expect(approveSnapshot({ root, confirmReviewed: true })).rejects.toThrow();
  });

  it('uses only the bundled demo with an unmistakable warning, never default real input', async () => {
    const root = await setup();
    const demo = await loadBuildSnapshot({ root, allowDemo: true });
    expect(demo.mode).toBe('demo');
    expect(demo.coverage.notes.join(' ')).toMatch(/illustrative.*no source data/i);
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow();
    await approveSnapshot({ root, confirmReviewed: true });
    expect((await loadBuildSnapshot({ root, allowDemo: true })).mode).toBe('demo');
  });

  it('gates the CLI before Astro, ignores inherited demo flags, and builds explicit demo without pages', async () => {
    const root = await setup();
    await cp(new URL('../../scripts/recap/', import.meta.url), join(root, 'scripts/recap'), { recursive: true });
    await cp(new URL('../../src/data/schema.ts', import.meta.url), join(root, 'src/data/schema.ts'));
    await symlink(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    const run = promisify(execFile);
    const runner = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const invoke = async (script: string, args: string[] = []) => {
      try {
        const output = await run(process.execPath, [runner, join(root, 'scripts/recap', script), ...args], {
          cwd: tmpdir(), env: { ...process.env, RECAP_ALLOW_DEMO: '1' }, timeout: 30000,
        });
        return { code: 0, text: output.stdout + output.stderr };
      } catch (error) {
        const failure = error as { code: number; stdout: string; stderr: string };
        return { code: failure.code, text: failure.stdout + failure.stderr };
      }
    };
    const refused = await invoke('build-input.ts');
    expect(refused, refused.text).toMatchObject({ code: 1 });
    expect(refused.text).toContain('Build blocked');
    expect(refused.text).not.toContain('[build]');
    expect((await invoke('approve.ts')).code).toBe(1);
    expect((await invoke('collect.ts', ['--year', 'invalid'])).code).toBe(1);
    const demo = await invoke('build-input.ts', ['--demo']);
    expect(demo.code).toBe(0);
    expect(demo.text).toMatch(/DEMO BUILD.*ILLUSTRATIVE ONLY/);
    expect(demo.text).toMatch(/0 page\(s\) built/);
    await expect(readFile(join(root, 'src/data/approved.json'))).rejects.toThrow();
    const approved = await invoke('approve.ts', ['--confirm-reviewed']);
    expect(approved.code).toBe(0);
    const real = await invoke('build-input.ts');
    expect(real.code).toBe(0);
    expect(real.text).not.toContain('DEMO BUILD');
  }, 30000);
});
