import { execFile } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { collectSnapshot } from '../../scripts/recap/collect';
import { approveSnapshot } from '../../scripts/recap/approve';
import { loadBuildSnapshot } from '../../scripts/recap/build-input';
import type { CoverageIssueReason, CoverageReport } from '../../scripts/recap/model';
import { digest } from '../../scripts/recap/artifacts';
import { publicCoverage, ReviewReportSchema, validateReviewInputs } from '../../scripts/recap/policy';
import { v2Fixture } from '../fixtures/playful';

const roots: string[] = [];
const clean = (): CoverageReport => ({ complete: true, inventoryVerified: true, issues: [], sourceChecks: [{ source: 'private', status: 'empty' }] });
async function setup(reason?: CoverageIssueReason, confirmed = true) {
  const root = await mkdtemp(join(tmpdir(), 'recap approval '));
  roots.push(root);
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/demo.json'), await readFile(new URL('../fixtures/snapshot-v1.json', import.meta.url)));
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
  it('requires a v2 report for v2 candidate bytes even with fully rebound v1 receipt hashes', async () => {
    const root = await setup();
    await approveSnapshot({ root, confirmReviewed: true });
    const candidatePath = join(root, '.recap-private/candidate.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    candidate.schemaVersion = 2;
    candidate.playful = v2Fixture().playful;
    const text = JSON.stringify(candidate);
    await writeFile(candidatePath, text);
    await writeFile(join(root, 'src/data/approved.json'), text);
    const reportPath = join(root, '.recap-private/coverage.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.candidateHash = digest(text);
    const reportText = JSON.stringify(report);
    await writeFile(reportPath, reportText);
    const receiptPath = join(root, '.recap-private/approval.json');
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    await writeFile(receiptPath, JSON.stringify({ ...receipt, candidateHash: digest(text),
      approvedHash: digest(text), coverageHash: digest(reportText) }));
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow('Build blocked');
    expect(() => validateReviewInputs(text, reportText, false)).toThrow('Invalid review inputs');
  });

  it('approves and loads v2 only with matching complete playful review coverage', async () => {
    const root = await setup();
    const candidatePath = join(root, '.recap-private/candidate.json');
    const candidate = JSON.parse(await readFile(candidatePath, 'utf8'));
    candidate.schemaVersion = 2;
    candidate.playful = v2Fixture().playful;
    const text = JSON.stringify(candidate);
    await writeFile(candidatePath, text);
    const reportPath = join(root, '.recap-private/coverage.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const v2Report = { ...report, schemaVersion: 2, candidateHash: digest(text), playfulCoverage: clean() };
    expect(ReviewReportSchema.safeParse(v2Report).success).toBe(true);
    await writeFile(reportPath, JSON.stringify(v2Report));
    await approveSnapshot({ root, confirmReviewed: true });
    expect(await loadBuildSnapshot({ root, allowDemo: false })).toEqual(candidate);
    candidate.playful.linesAdded.count++;
    await writeFile(join(root, 'src/data/approved.json'), JSON.stringify(candidate));
    await expect(loadBuildSnapshot({ root, allowDemo: false })).rejects.toThrow('Build blocked');
  });

  it('incorporates playful coverage without broadening the inventory waiver', () => {
    const metrics = { dependencyAlertsFixed: clean(), productionDeployments: clean(), workItemsClosed: clean() };
    const coverage = clean();
    coverage.inventoryVerified = false;
    coverage.complete = false;
    coverage.issues = [{ source: 'github-inventory', identifier: 'private', reason: 'inventory' }];
    expect(publicCoverage(metrics, coverage).scope).toBe('accessible-repositories');
    const snapshot = { ...v2Fixture(), mode: 'real', coverage: publicCoverage(metrics, coverage) };
    const text = JSON.stringify(snapshot);
    const report = { schemaVersion: 2, candidateHash: digest(text), jiraExclusionsConfirmed: true, metrics, playfulCoverage: coverage };
    expect(() => validateReviewInputs(text, JSON.stringify(report), true)).not.toThrow();
    expect(() => validateReviewInputs(text, JSON.stringify(report), false)).toThrow();
    for (const reason of ['denied', 'failed', 'inaccessible', 'pagination', 'mapping'] as const) {
      coverage.issues[0].reason = reason;
      expect(() => validateReviewInputs(text, JSON.stringify(report), true)).toThrow();
    }
    coverage.issues[0].reason = 'inventory';
    coverage.issues[0].source = 'github-prs';
    expect(() => validateReviewInputs(text, JSON.stringify(report), true)).toThrow();
  });

  it('never approves unavailable playful scalars, unknown authors, or mismatched report versions', () => {
    const snapshot = { ...v2Fixture(), mode: 'real', coverage: { scope: 'verified-organization', notes: [] } };
    const metrics = { dependencyAlertsFixed: clean(), productionDeployments: clean(), workItemsClosed: clean() };
    for (const field of ['mergedPullRequests', 'linesAdded', 'botAuthoredPullRequests'] as const) {
      const candidate = structuredClone(snapshot);
      candidate.playful[field] = { status: 'unavailable', count: null };
      if (field === 'linesAdded') candidate.playful.linesRemoved = { status: 'unavailable', count: null };
      if (field === 'botAuthoredPullRequests') candidate.playful.unknownAuthorPullRequests = 1;
      const text = JSON.stringify(candidate);
      const report = { schemaVersion: 2, candidateHash: digest(text), jiraExclusionsConfirmed: true, metrics, playfulCoverage: clean() };
      expect(() => validateReviewInputs(text, JSON.stringify(report), true)).toThrow();
    }
    const { playful, ...v1 } = snapshot;
    const text = JSON.stringify({ ...v1, schemaVersion: 1 });
    expect(() => validateReviewInputs(text, JSON.stringify({ schemaVersion: 2, candidateHash: digest(text),
      jiraExclusionsConfirmed: true, metrics, playfulCoverage: clean() }), true)).toThrow();
  });

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

  it.each(['demo', 'real'] as const)('gates the CLI and renders a bundled %s snapshot from an unrelated cwd', async (mode) => {
    const root = await setup();
    await cp(new URL('../../scripts/recap/', import.meta.url), join(root, 'scripts/recap'), { recursive: true });
    await cp(new URL('../../src/data/schema.ts', import.meta.url), join(root, 'src/data/schema.ts'));
    await cp(new URL('../../src/data/playful.ts', import.meta.url), join(root, 'src/data/playful.ts'));
    await symlink(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await mkdir(join(root, 'src/pages'));
    await writeFile(join(root, 'src/pages/index.astro'), `---
import { loadBuildSnapshot } from '../../scripts/recap/build-input';
const snapshot = await loadBuildSnapshot({ allowDemo: process.env.RECAP_ALLOW_DEMO === '1' });
---
<p>{snapshot.mode}</p>
`);
    const privateMarker = 'FAKE_CREDENTIAL_fixture_private_only';
    const coveragePath = join(root, '.recap-private/coverage.json');
    const report = JSON.parse(await readFile(coveragePath, 'utf8'));
    report.metrics.workItemsClosed.sourceChecks[0].source = privateMarker;
    await writeFile(coveragePath, JSON.stringify(report));
    const run = promisify(execFile);
    const runner = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const invoke = async (script: string, args: string[] = []) => {
      try {
        const output = await run(process.execPath, [runner, join(root, 'scripts/recap', script), ...args], {
          cwd: tmpdir(), env: { ...process.env, CI: 'true', RECAP_ALLOW_DEMO: '1',
            RECAP_BUILD_INPUT: 'published', RECAP_BUILD_ROOT: tmpdir() }, timeout: 30000,
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
    if (mode === 'real') {
      const approved = await invoke('approve.ts', ['--confirm-reviewed']);
      expect(approved.code).toBe(0);
    }
    const built = await invoke('build-input.ts', mode === 'demo' ? ['--demo'] : []);
    expect(built, built.text).toMatchObject({ code: 0 });
    expect(built.text).toMatch(/1 page\(s\) built/);
    expect(await readFile(join(root, 'dist/index.html'), 'utf8')).toContain(`<p>${mode}</p>`);
    if (mode === 'demo') {
      expect(built.text).toMatch(/DEMO BUILD.*ILLUSTRATIVE ONLY/);
      await expect(readFile(join(root, 'src/data/approved.json'))).rejects.toThrow();
    } else {
      expect(built.text).not.toContain('DEMO BUILD');
    }
    const output = await readdir(join(root, 'dist'), { recursive: true, withFileTypes: true });
    for (const entry of output) {
      expect(entry.name).not.toMatch(/\.recap-private|candidate\.json|coverage\.json|approval\.json/);
      if (entry.isFile()) {
        const content = await readFile(join(entry.parentPath, entry.name), 'utf8');
        expect(content).not.toContain(privateMarker);
        expect(content).not.toContain(root);
      }
    }
  }, 30000);
});
