import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';
import demo from './src/data/demo.json' with { type: 'json' };
import legacyV1 from './tests/fixtures/snapshot-v1.json' with { type: 'json' };
import type { PublicSnapshotV2 } from './src/data/schema';

const execFile = promisify(execFileCallback);
const repo = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), 'team-recap-browser-'));
const digest = (text: string) => createHash('sha256').update(text).digest('hex');

async function writeFixture(name: string, snapshot: unknown) {
  const root = join(scratch, name);
  await mkdir(join(root, 'src', 'data'), { recursive: true });
  await writeFile(join(root, 'src', 'data', 'demo.json'), `${JSON.stringify(snapshot, null, 2)}\n`);
  return root;
}

const unavailableSnapshot = structuredClone(demo) as unknown as PublicSnapshotV2;
for (const key of Object.keys(unavailableSnapshot.metrics) as (keyof PublicSnapshotV2['metrics'])[]) {
  unavailableSnapshot.metrics[key] = { status: 'unavailable', count: null, breakdown: [] };
}
unavailableSnapshot.playful.linesAdded = { status: 'unavailable', count: null };
unavailableSnapshot.playful.linesRemoved = { status: 'unavailable', count: null };
const unavailableRoot = await writeFixture('unavailable', unavailableSnapshot);

const halfSnapshot = structuredClone(demo) as unknown as PublicSnapshotV2;
halfSnapshot.playful.linesAdded = { status: 'available', count: 28_480 };
const halfRoot = await writeFixture('book-half', halfSnapshot);

const zeroSnapshot = structuredClone(demo) as unknown as PublicSnapshotV2;
zeroSnapshot.playful.linesAdded = { status: 'available', count: 0 };
const zeroRoot = await writeFixture('book-zero', zeroSnapshot);

const robotsZeroSnapshot = structuredClone(demo) as unknown as PublicSnapshotV2;
robotsZeroSnapshot.playful.mergedPullRequests = { status: 'available', count: 0 };
robotsZeroSnapshot.playful.botAuthoredPullRequests = { status: 'available', count: 0 };
const robotsZeroRoot = await writeFixture('robots-zero', robotsZeroSnapshot);

const completedSnapshot = structuredClone(demo);
completedSnapshot.cutoffExclusive = completedSnapshot.periodEndExclusive;
completedSnapshot.isYearToDate = false;
const completedRoot = await writeFixture('completed', completedSnapshot);

const limitedRoot = join(scratch, 'limited');
const limitedSnapshot = structuredClone(demo) as unknown as PublicSnapshotV2;
limitedSnapshot.mode = 'real';
limitedSnapshot.coverage = {
  scope: 'accessible-repositories',
  notes: ['Limited to accessible sources; independent organization inventory or project visibility was not verified.'],
};
const candidateText = `${JSON.stringify(limitedSnapshot, null, 2)}\n`;
const coverage = {
  schemaVersion: 2,
  candidateHash: digest(candidateText),
  jiraExclusionsConfirmed: true,
  metrics: {
    dependencyAlertsFixed: { complete: false, inventoryVerified: false, issues: [{ source: 'github-inventory', identifier: 'fixture', reason: 'inventory' }], sourceChecks: [{ source: 'github', status: 'success' }] },
    productionDeployments: { complete: false, inventoryVerified: false, issues: [{ source: 'github-inventory', identifier: 'fixture', reason: 'inventory' }], sourceChecks: [{ source: 'github', status: 'success' }] },
    workItemsClosed: { complete: false, inventoryVerified: false, issues: [{ source: 'jira-project-visibility', identifier: 'fixture', reason: 'inventory' }], sourceChecks: [{ source: 'jira', status: 'success' }] },
  },
  playfulCoverage: { complete: false, inventoryVerified: false,
    issues: [{ source: 'github-inventory', identifier: 'fixture', reason: 'inventory' }],
    sourceChecks: [{ source: 'github', status: 'success' }] },
};
const coverageText = `${JSON.stringify(coverage, null, 2)}\n`;
const approval = {
  schemaVersion: 1,
  confirmReviewed: true,
  acknowledgeAccessibleScope: true,
  approvedAt: '2026-10-27T16:00:00.000Z',
  candidateHash: digest(candidateText),
  coverageHash: digest(coverageText),
  approvedHash: digest(candidateText),
};
await mkdir(join(limitedRoot, '.recap-private'), { recursive: true });
await mkdir(join(limitedRoot, 'src', 'data'), { recursive: true });
await writeFile(join(limitedRoot, '.recap-private', 'candidate.json'), candidateText);
await writeFile(join(limitedRoot, '.recap-private', 'coverage.json'), coverageText);
await writeFile(join(limitedRoot, '.recap-private', 'approval.json'), `${JSON.stringify(approval, null, 2)}\n`);
await writeFile(join(limitedRoot, 'src', 'data', 'approved.json'), candidateText);

const origins = {
  sample: { port: 4173, root: await writeFixture('sample', structuredClone(demo)), demo: true, base: '' },
  unavailable: { port: 4174, root: unavailableRoot, demo: true, base: '' },
  completed: { port: 4175, root: completedRoot, demo: true, base: '' },
  subpath: { port: 4176, root: await writeFixture('subpath', structuredClone(demo)), demo: true, base: '/year-in-review' },
  limited: { port: 4177, root: limitedRoot, demo: false, base: '' },
  half: { port: 4178, root: halfRoot, demo: true, base: '' },
  zero: { port: 4179, root: zeroRoot, demo: true, base: '' },
  robotsZero: { port: 4180, root: robotsZeroRoot, demo: true, base: '' },
  legacyV1: { port: 4181, root: await writeFixture('legacy-v1', legacyV1), demo: true, base: '' },
};

const builds: Record<string, string> = {};
for (const [name, origin] of Object.entries(origins)) {
  const outDir = join(scratch, `dist-${name}`);
  const env = {
    ...process.env,
    RECAP_ALLOW_DEMO: origin.demo ? '1' : '0',
    RECAP_BUILD_ROOT: origin.root,
    RECAP_BASE_PATH: origin.base,
    RECAP_OUT_DIR: outDir,
  };
  try {
    await execFile(join(repo, 'node_modules', '.bin', 'astro'), ['build'], { cwd: repo, env, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    const failure = error as Error & { stdout?: string; stderr?: string };
    process.stderr.write(failure.stdout ?? '');
    process.stderr.write(failure.stderr ?? '');
    throw error;
  }
  builds[name] = outDir;
}

const serverSource = `const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(process.argv[1]),prefix=process.argv[2],port=Number(process.argv[3]);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.json':'application/json'};
http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(prefix){if(pathname!==prefix&&!pathname.startsWith(prefix+'/')){res.writeHead(404);return res.end('Not found')}pathname=pathname.slice(prefix.length)||'/'}
let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403);return res.end('Forbidden')}if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');
fs.readFile(file,(error,data)=>{if(error){res.writeHead(404);return res.end('Not found')}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});res.end(data)})}).listen(port,'127.0.0.1');`;
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    browserName: 'chromium',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: Object.entries(origins).map(([name, origin]) => ({
    name,
    use: { baseURL: `http://127.0.0.1:${origin.port}${origin.base}/` },
  })),
  webServer: Object.entries(origins).map(([name, origin]) => ({
    command: `node -e ${quote(serverSource)} ${quote(builds[name])} ${quote(origin.base)} ${origin.port}`,
    url: `http://127.0.0.1:${origin.port}${origin.base}/`,
    reuseExistingServer: false,
    timeout: 10_000,
  })),
});
