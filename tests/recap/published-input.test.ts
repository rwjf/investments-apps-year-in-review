import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as artifacts from '../../scripts/recap/artifacts';
import { approveSnapshot } from '../../scripts/recap/approve';
import { loadBuildSnapshot } from '../../scripts/recap/build-input';
import { ACCESSIBLE_SCOPE_NOTE } from '../../scripts/recap/policy';
import { v2Fixture } from '../fixtures/playful';

const roots: string[] = [];
const proofPaths = ['src/data/approved.json', '.recap-private/candidate.json',
  '.recap-private/coverage.json', '.recap-private/approval.json'];
const clean = () => ({ complete: true, inventoryVerified: true, issues: [],
  sourceChecks: [{ source: 'PRIVATE_SOURCE_NEVER_EXPORT', status: 'success' }] });
async function setup(version: 1 | 2 = 2, accessible = false) {
  const root = await mkdtemp(join(tmpdir(), 'recap published input '));
  roots.push(root);
  await mkdir(join(root, 'src/data'), { recursive: true });
  await mkdir(join(root, '.recap-private'));
  const snapshot = version === 2 ? v2Fixture()
    : JSON.parse(await readFile(new URL('../fixtures/snapshot-v1.json', import.meta.url), 'utf8'));
  snapshot.mode = 'real';
  snapshot.coverage = accessible ? { scope: 'accessible-repositories', notes: [ACCESSIBLE_SCOPE_NOTE] }
    : { scope: 'verified-organization', notes: [] };
  const coverage = accessible ? { ...clean(), complete: false, inventoryVerified: false,
    issues: [{ source: 'github-inventory', identifier: 'PRIVATE_IDENTITY', reason: 'inventory' }] } : clean();
  const text = artifacts.jsonText(snapshot);
  await writeFile(join(root, '.recap-private/candidate.json'), text);
  await writeFile(join(root, '.recap-private/coverage.json'), artifacts.jsonText({ schemaVersion: version,
    candidateHash: artifacts.digest(text), jiraExclusionsConfirmed: true,
    metrics: { dependencyAlertsFixed: coverage, productionDeployments: clean(), workItemsClosed: clean() },
    ...(version === 2 ? { playfulCoverage: clean() } : {}) }));
  await approveSnapshot({ root, confirmReviewed: true, acknowledgeAccessibleScope: accessible });
  const receiptPath = join(root, '.recap-private/approval.json');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  receipt.approvedAt = '2026-10-01T10:00:00.000Z';
  await writeFile(receiptPath, artifacts.jsonText(receipt));
  return root;
}
const bundle = (root: string) => Promise.all(proofPaths.map((path) => artifacts.readText(root, path)));
async function modules() {
  return { ...await import('../../scripts/recap/published-input'), ...await import('../../scripts/recap/export-approved') };
}
async function exported(version: 1 | 2 = 2, accessible = false) {
  const root = await setup(version, accessible);
  const api = await modules();
  await api.exportApprovedManifest({ root });
  return { root, ...api };
}
async function rewrite(root: string, mutate: (snapshot: any) => void) {
  const snapshot = JSON.parse(await artifacts.readText(root, 'src/data/approved.json'));
  mutate(snapshot);
  const text = artifacts.jsonText(snapshot);
  await writeFile(join(root, 'src/data/approved.json'), text);
  const manifest = JSON.parse(await artifacts.readText(root, 'src/data/approved.manifest.json'));
  manifest.snapshotSha256 = artifacts.digest(text);
  await writeFile(join(root, 'src/data/approved.manifest.json'), artifacts.jsonText(manifest));
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('published approval boundary', () => {
  it('routes explicit published input without falling back to private proof', async () => {
    const api = await import('../../scripts/recap/build-input');
    const root = await setup();
    await rm(join(root, '.recap-private'), { recursive: true });
    await expect(api.loadBuildSnapshot({ root, allowDemo: false, inputMode: 'published' }))
      .rejects.toThrow('Published input blocked');
  });

  it.each([1, 2] as const)('exports only six public fields without changing v%s proof or approval bytes', async (version) => {
    const root = await setup(version, true);
    const before = await bundle(root);
    const { exportApprovedManifest, PublishedApprovalSchema, loadPublishedSnapshot } = await modules();
    const manifest = await exportApprovedManifest({ root });
    expect(manifest).toEqual({ schemaVersion: 1, snapshotSchemaVersion: version,
      snapshotSha256: artifacts.digest(before[0]), approvedAt: '2026-10-01T10:00:00.000Z',
      coverageScope: 'accessible-repositories', acknowledgeAccessibleScope: true });
    expect(PublishedApprovalSchema.safeParse(manifest).success).toBe(true);
    expect(await bundle(root)).toEqual(before);
    const text = await artifacts.readText(root, 'src/data/approved.manifest.json');
    expect(text).not.toMatch(/PRIVATE_|candidateHash|coverageHash|approvedHash|sourceChecks/);
    await rm(join(root, '.recap-private'), { recursive: true });
    expect((await loadPublishedSnapshot({ root })).schemaVersion).toBe(version);
    expect((await loadBuildSnapshot({ root, allowDemo: false, inputMode: 'published' })).mode).toBe('real');
    await expect(loadBuildSnapshot({ root, allowDemo: false, inputMode: 'private' })).rejects.toThrow('Build blocked');
  });

  it.each(proofPaths)('refuses missing or changed %s generically and leaves manifest untouched', async (path) => {
    const { root, exportApprovedManifest } = await exported();
    const before = await artifacts.readText(root, 'src/data/approved.manifest.json');
    await writeFile(join(root, path), 'PRIVATE_SECRET_INVALID_JSON');
    await expect(exportApprovedManifest({ root })).rejects.toThrow('Export refused');
    await expect(exportApprovedManifest({ root })).rejects.not.toThrow('PRIVATE_SECRET');
    await rm(join(root, path));
    await expect(exportApprovedManifest({ root })).rejects.toThrow('Export refused');
    expect(await artifacts.readText(root, 'src/data/approved.manifest.json')).toBe(before);
  });

  it('refuses intervening proof changes rather than exporting a newly read unvalidated receipt', async () => {
    const { root, exportApprovedManifest } = await exported();
    const before = await artifacts.readText(root, 'src/data/approved.manifest.json');
    const original = artifacts.readText;
    let reads = 0;
    vi.spyOn(artifacts, 'readText').mockImplementation(async (base, path) => {
      const text = await original(base, path);
      if (path === '.recap-private/approval.json' && ++reads === 2) {
        return text.replace('2026-10-01', '2026-10-02');
      }
      return text;
    });
    await expect(exportApprovedManifest({ root })).rejects.toThrow('Export refused');
    expect(await artifacts.readText(root, 'src/data/approved.manifest.json')).toBe(before);
  });

  it.each(['source', 'demo', 'unavailable', 'unknown'] as const)('does not export invalid private %s even with rebound receipt hashes', async (field) => {
    const { root, exportApprovedManifest } = await exported();
    const before = await artifacts.readText(root, 'src/data/approved.manifest.json');
    const snapshot = JSON.parse(await artifacts.readText(root, '.recap-private/candidate.json'));
    const report = JSON.parse(await artifacts.readText(root, '.recap-private/coverage.json'));
    if (field === 'source') report.playfulCoverage.sourceChecks[0].status = 'failed';
    if (field === 'demo') { snapshot.mode = 'demo'; snapshot.coverage.notes = ['Illustrative example only; no source data was collected.']; }
    if (field === 'unavailable') snapshot.playful.mergedPullRequests = { status: 'unavailable', count: null };
    if (field === 'unknown') snapshot.playful.unknownAuthorPullRequests = 1;
    const candidate = artifacts.jsonText(snapshot);
    report.candidateHash = artifacts.digest(candidate);
    const coverage = artifacts.jsonText(report);
    const receipt = JSON.parse(await artifacts.readText(root, '.recap-private/approval.json'));
    receipt.candidateHash = artifacts.digest(candidate);
    receipt.approvedHash = artifacts.digest(candidate);
    receipt.coverageHash = artifacts.digest(coverage);
    await Promise.all([
      writeFile(join(root, '.recap-private/candidate.json'), candidate),
      writeFile(join(root, 'src/data/approved.json'), candidate),
      writeFile(join(root, '.recap-private/coverage.json'), coverage),
      writeFile(join(root, '.recap-private/approval.json'), artifacts.jsonText(receipt)),
    ]);
    await expect(exportApprovedManifest({ root })).rejects.toThrow('Export refused');
    expect(await artifacts.readText(root, 'src/data/approved.manifest.json')).toBe(before);
  });

  it('cleans up a failed atomic manifest replacement without modifying private proof', async () => {
    const { root, exportApprovedManifest } = await exported();
    const before = await bundle(root);
    const path = join(root, 'src/data/approved.manifest.json');
    await rm(path);
    await mkdir(path);
    await writeFile(join(path, 'prior'), 'untouched');
    await expect(exportApprovedManifest({ root })).rejects.toThrow('Export refused');
    expect(await readFile(join(path, 'prior'), 'utf8')).toBe('untouched');
    expect(await bundle(root)).toEqual(before);
    expect((await readdir(join(root, 'src/data'))).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it.each(['schemaVersion', 'snapshotSchemaVersion', 'snapshotSha256', 'approvedAt', 'coverageScope',
    'acknowledgeAccessibleScope', 'extra'] as const)('rejects invalid manifest %s', async (field) => {
    const { root, loadPublishedSnapshot } = await exported(2, true);
    const manifest = JSON.parse(await artifacts.readText(root, 'src/data/approved.manifest.json'));
    const invalid = { schemaVersion: 2, snapshotSchemaVersion: 1, snapshotSha256: 'A'.repeat(64),
      approvedAt: 'yesterday', coverageScope: 'verified-organization', acknowledgeAccessibleScope: false,
      extra: 'PRIVATE_SECRET' };
    manifest[field] = invalid[field];
    await writeFile(join(root, 'src/data/approved.manifest.json'), JSON.stringify(manifest));
    await expect(loadPublishedSnapshot({ root })).rejects.toThrow('Published input blocked');
    await expect(loadPublishedSnapshot({ root })).rejects.not.toThrow('PRIVATE_SECRET');
  });

  it('hashes raw UTF-8 bytes, not parsed or normalized JSON', async () => {
    const { root, loadPublishedSnapshot } = await exported();
    const path = join(root, 'src/data/approved.json');
    await writeFile(path, (await readFile(path, 'utf8')).replaceAll('\n', '\r\n'));
    await expect(loadPublishedSnapshot({ root })).rejects.toThrow('Published input blocked');
  });

  it.each(['demo', 'core', 'mergedPullRequests', 'linesAdded', 'linesRemoved', 'botAuthoredPullRequests',
    'unknown', 'extra', 'labels', 'notes'] as const)('rejects correctly rehashed but unpublishable %s', async (field) => {
    const { root, loadPublishedSnapshot } = await exported();
    await rewrite(root, (snapshot) => {
      if (field === 'demo') { snapshot.mode = 'demo'; snapshot.coverage.notes = ['Illustrative example only; no source data was collected.']; }
      else if (field === 'core') snapshot.metrics.workItemsClosed = { status: 'unavailable', count: null, breakdown: [] };
      else if (field === 'unknown') snapshot.playful.unknownAuthorPullRequests = 1;
      else if (field === 'extra') snapshot.extraSourceFields = { token: 'PRIVATE_SECRET' };
      else if (field === 'labels') snapshot.metrics.workItemsClosed.breakdown[0].label = 'PRIVATE_SECRET';
      else if (field === 'notes') snapshot.coverage.notes = ['PRIVATE_SECRET'];
      else snapshot.playful[field] = { status: 'unavailable', count: null };
    });
    await expect(loadPublishedSnapshot({ root })).rejects.toThrow('Published input blocked');
  });

  it('does not let CI or inherited public/demo selection bypass local export proof', async () => {
    const { root, exportApprovedManifest } = await exported();
    await rm(join(root, '.recap-private'), { recursive: true });
    vi.stubEnv('CI', 'true');
    vi.stubEnv('RECAP_BUILD_INPUT', 'published');
    vi.stubEnv('RECAP_ALLOW_DEMO', '1');
    await expect(exportApprovedManifest({ root })).rejects.toThrow('Export refused');
    await expect(loadBuildSnapshot({ root, allowDemo: false, inputMode: 'private' })).rejects.toThrow('Build blocked');
    const { collectPlayfulSnapshot } = await import('../../scripts/recap/collect-playful');
    const collector = vi.fn();
    await expect(collectPlayfulSnapshot({ root, collector })).rejects.toThrow('Playful collection failed');
    expect(collector).not.toHaveBeenCalled();
  });

  it('renders real published input in Astro from an unrelated cwd; CLI choices override inherited flags', async () => {
    const { root } = await exported();
    await cp(new URL('../../scripts/recap/', import.meta.url), join(root, 'scripts/recap'), { recursive: true });
    for (const path of ['schema.ts', 'playful.ts', 'demo.json']) {
      await cp(new URL(`../../src/data/${path}`, import.meta.url), join(root, 'src/data', path));
    }
    await symlink(fileURLToPath(new URL('../../node_modules', import.meta.url)), join(root, 'node_modules'), 'dir');
    await writeFile(join(root, 'package.json'), '{"type":"module"}');
    await mkdir(join(root, 'src/pages'));
    await writeFile(join(root, 'src/pages/index.astro'), `---
import { loadBuildSnapshot } from '../../scripts/recap/build-input';
const snapshot = await loadBuildSnapshot({ allowDemo: process.env.RECAP_ALLOW_DEMO === '1' });
---
<p>{snapshot.mode}:{snapshot.schemaVersion}</p>
`);
    const runner = fileURLToPath(new URL('../../node_modules/tsx/dist/cli.mjs', import.meta.url));
    const invoke = async (script: string, args: string[] = []) => {
      try {
        const output = await promisify(execFile)(process.execPath, [runner, join(root, 'scripts/recap', script), ...args], {
          cwd: tmpdir(), timeout: 30000,
          env: { ...process.env, CI: 'true', RECAP_ALLOW_DEMO: '1', RECAP_BUILD_INPUT: 'published', RECAP_BUILD_ROOT: tmpdir() },
        });
        return { code: 0, text: output.stdout + output.stderr };
      } catch (error) {
        const failure = error as { code: number; stdout: string; stderr: string };
        return { code: failure.code, text: failure.stdout + failure.stderr };
      }
    };
    const before = await bundle(root);
    const localExport = await invoke('export-approved.ts');
    expect(localExport, localExport.text).toMatchObject({ code: 0 });
    expect(await bundle(root)).toEqual(before);
    expect(JSON.parse(await artifacts.readText(root, 'src/data/approved.manifest.json')).approvedAt)
      .toBe('2026-10-01T10:00:00.000Z');
    await rm(join(root, '.recap-private'), { recursive: true });
    for (const args of [[], ['--demo', '--published'], ['--published', '--published'], ['--private']]) {
      const result = await invoke('build-input.ts', args);
      expect(result, result.text).toMatchObject({ code: 1 });
      expect(result.text).not.toContain('[build]');
    }
    expect((await invoke('export-approved.ts')).code).toBe(1);
    expect((await invoke('export-approved.ts', ['--published'])).code).toBe(1);
    const published = await invoke('build-input.ts', ['--published']);
    expect(published, published.text).toMatchObject({ code: 0 });
    expect(published.text).toMatch(/1 page\(s\) built/);
    expect(await artifacts.readText(root, 'dist/index.html')).toContain('<p>real:2</p>');
    const demo = await invoke('build-input.ts', ['--demo']);
    expect(demo, demo.text).toMatchObject({ code: 0 });
    expect(await artifacts.readText(root, 'dist/index.html')).toContain('<p>demo:2</p>');
    await writeFile(join(root, 'src/data/approved.manifest.json'), '{}');
    const refused = await invoke('build-input.ts', ['--published']);
    expect(refused.code).toBe(1);
    expect(refused.text).not.toContain('[build]');
  }, 60000);
});
