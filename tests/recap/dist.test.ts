import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { checkDist } from '../../scripts/check-dist';
import { publishSnapshot } from '../../scripts/publish';

const roots: string[] = [];
const run = promisify(execFile);
async function file(root: string, path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
async function fixture(mode = 'real', base = '/') {
  const root = await mkdtemp(join(tmpdir(), 'recap-dist-'));
  roots.push(root);
  await file(root, 'index.html', `<!doctype html><html><head><meta name="recap-mode" content="${mode}"><link rel="stylesheet" href="${base}_astro/site.css"></head><body id="top"><a href="${base}#chapter">Chapter</a><section id="chapter"></section></body></html>`);
  await file(root, '_astro/site.css', 'body { color: #042e43; }');
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('static distribution defense in depth', () => {
  it.each(['/', '/team-recap/', '/team.recap/'])('resolves assets and chapter links under %s without SPA fallback', async (base) => {
    await expect(checkDist({ directory: await fixture('real', base) })).resolves.toBeUndefined();
  });

  it('rejects demo by default and allows it only for explicit local inspection', async () => {
    const directory = await fixture('demo');
    await expect(checkDist({ directory })).rejects.toThrow(/real/);
    await expect(checkDist({ directory, allowDemo: true })).resolves.toBeUndefined();
  });

  it('requires an existing artifact with a mode marker', async () => {
    const directory = await fixture();
    await rm(join(directory, 'index.html'));
    await expect(checkDist({ directory })).rejects.toThrow(/missing/i);
    await file(directory, 'index.html', '<html><body>No marker</body></html>');
    await expect(checkDist({ directory })).rejects.toThrow(/mode/i);
    await expect(checkDist({ directory: join(directory, 'absent') })).rejects.toThrow(/missing/i);
  });

  it('accepts only an empty nojekyll marker', async () => {
    const directory = await fixture();
    await file(directory, '.nojekyll', '');
    await expect(checkDist({ directory })).resolves.toBeUndefined();
    await file(directory, '.nojekyll', 'raw private text');
    await expect(checkDist({ directory })).rejects.toThrow();
  });

  it('allows ordinary percentage CSS rather than treating it as malformed URL encoding', async () => {
    const directory = await fixture();
    await file(directory, '_astro/site.css', 'body { width: 100%; transform: translateX(-50%); }');
    await expect(checkDist({ directory })).resolves.toBeUndefined();
  });

  it('distinguishes lowercase numbered CSS classes from uppercase source issue keys', async () => {
    const directory = await fixture();
    await file(directory, 'index.html', (await readFile(join(directory, 'index.html'), 'utf8')).replace('<body', '<body class="step-1"'));
    await expect(checkDist({ directory })).resolves.toBeUndefined();
    await file(directory, '_astro/site.css', '/* OTHERPROJECT-123 */');
    await expect(checkDist({ directory })).rejects.toThrow(/private content/);
  });

  it('rejects source identifiers in artifact filenames', async () => {
    const directory = await fixture();
    await file(directory, 'INSUP-123/index.html', '<meta name="recap-mode" content="real">');
    await expect(checkDist({ directory })).rejects.toThrow();
  });

  it.each(['/team', '/team/'])('validates an explicitly configured %s base', async (basePath) => {
    const directory = await fixture('real', '/team/');
    await expect(checkDist({ directory, basePath })).resolves.toBeUndefined();
    await expect(checkDist({ directory, basePath: '/wrong/' })).rejects.toThrow(/link/i);
  });

  it('rejects encoded private content and duplicate mode markers', async () => {
    const directory = await fixture();
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    await file(directory, 'index.html', html.replace('</body>', '<p>&#73;NSUP-123</p></body>'));
    await expect(checkDist({ directory })).rejects.toThrow(/private content/);
    await file(directory, 'index.html', html.replace('</head>', '<meta name="recap-mode" content="demo"></head>'));
    await expect(checkDist({ directory, allowDemo: true })).rejects.toThrow(/mode/);
  });

  it.each(['.env', '.recap-private/coverage.json', 'nested/candidate.json', '_astro/site.css.map', 'notes.txt', 'data.json', 'script.js'])('rejects private or unknown artifact %s recursively', async (path) => {
    const directory = await fixture();
    await file(directory, path, 'not public');
    await expect(checkDist({ directory })).rejects.toThrow();
  });

  it.each(['INSUP-123', 'RWJFINVEST', 'repositoryId', 'issueTypeId', 'FAKE_CREDENTIAL_do_not_echo',
    'ghp_abcdefghijklmnopqrstuvwxyz1234567890', 'Authorization: Bearer synthetic', 'JIRA_API_TOKEN=synthetic',
    '{"token":"synthetic-do-not-echo"}', 'https://jira.internal.example/browse/999',
    'https://github.com/rwjf/private-repo', 'https://private.atlassian.net/browse/ABC-1',
    '/Users/private/source', 'C:\\Users\\private\\source', 'file:///private/tmp/source', 'sourceMappingURL=private.map'])('rejects a private marker without echoing matched content (%#)', async (marker) => {
    const directory = await fixture();
    await file(directory, '_astro/site.css', `/* ${marker} */`);
    await expect(checkDist({ directory })).rejects.toThrow();
    await expect(checkDist({ directory })).rejects.not.toThrow(marker);
  });

  it.each(['/_astro/missing.css', '/wrong/_astro/site.css', '/missing/#chapter', '#missing'])('rejects unresolved local link %s', async (link) => {
    const directory = await fixture('real', '/team/');
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    await file(directory, 'index.html', html.replace('</body>', `<a href="${link}">Broken</a></body>`));
    await expect(checkDist({ directory })).rejects.toThrow(/link/i);
  });

  it('checks nested HTML mode and fragments on their actual target page', async () => {
    const directory = await fixture();
    await file(directory, 'chapter/index.html', '<meta name="recap-mode" content="real"><p id="detail">Detail</p>');
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    await file(directory, 'index.html', html.replace('</body>', '<a href="/chapter/#detail">Detail</a></body>'));
    await expect(checkDist({ directory })).resolves.toBeUndefined();
    await file(directory, 'chapter/index.html', '<meta name="recap-mode" content="demo"><p id="detail">Detail</p>');
    await expect(checkDist({ directory })).rejects.toThrow(/real/);
  });

  it('rejects symlinks, active content, external resources and missing CSS assets', async () => {
    const directory = await fixture();
    await symlink(join(directory, '_astro/site.css'), join(directory, '_astro/link.css'));
    await expect(checkDist({ directory })).rejects.toThrow();
    await rm(join(directory, '_astro/link.css'));
    const html = await readFile(join(directory, 'index.html'), 'utf8');
    for (const extra of ['<script>alert(1)</script>', '<img src="https://example.com/pixel">', '<p onclick="alert(1)">Click</p>']) {
      await file(directory, 'index.html', html.replace('</body>', `${extra}</body>`));
      await expect(checkDist({ directory })).rejects.toThrow();
    }
    await file(directory, 'index.html', html);
    await file(directory, '_astro/site.css', 'body { background: url(./missing.png) }');
    await expect(checkDist({ directory })).rejects.toThrow(/link/i);
  });
});

describe('local publication gates (fixture commands only; never publish)', () => {
  async function publisher(mode = 'real') {
    const artifact = await fixture(mode, '/team/');
    const root = await mkdtemp(join(tmpdir(), 'recap-publish-'));
    roots.push(root);
    await file(root, 'package.json', JSON.stringify({ scripts: { build: 'node build.cjs' } }));
    await file(root, 'build.cjs', `require('node:fs').cpSync(${JSON.stringify(artifact)}, 'dist', { recursive: true });`);
    await file(root, 'node_modules/gh-pages/bin/gh-pages.js', "require('node:fs').writeFileSync('publisher-called.json', JSON.stringify(process.argv.slice(2)))");
    await run('git', ['init', '-q', root]);
    return root;
  }

  it('treats a missing origin as a usage error without invoking the publisher', async () => {
    const root = await publisher();
    await expect(publishSnapshot({ root, env: {} })).rejects.toThrow(/origin/);
    await expect(readFile(join(root, 'publisher-called.json'))).rejects.toThrow();
  });

  it('builds fresh real output and invokes only static dist publishing with nojekyll', async () => {
    const root = await publisher();
    await run('git', ['-C', root, 'remote', 'add', 'origin', 'https://example.invalid/test.git']);
    await file(root, 'dist/stale.txt', 'must be removed before building');
    await publishSnapshot({ root, env: { RECAP_BASE_PATH: '/team/' } });
    expect(JSON.parse(await readFile(join(root, 'publisher-called.json'), 'utf8'))).toEqual(['--dist', 'dist', '--nojekyll']);
    await expect(readFile(join(root, 'dist/stale.txt'))).rejects.toThrow();
  });

  it.each(['demo', 'failed-build', 'alternate-output', 'private-artifact'])('does not publish %s or fall back to stale dist', async (reason) => {
    const root = await publisher(reason === 'demo' ? 'demo' : 'real');
    await run('git', ['-C', root, 'remote', 'add', 'origin', 'https://example.invalid/test.git']);
    if (reason === 'failed-build') await file(root, 'build.cjs', 'process.exit(1)');
    if (reason === 'private-artifact') await file(root, 'build.cjs', "require('node:fs').mkdirSync('dist'); require('node:fs').writeFileSync('dist/.env', 'private');");
    await expect(publishSnapshot({ root, env: reason === 'alternate-output' ? { RECAP_OUT_DIR: './other' } : {} })).rejects.toThrow();
    await expect(readFile(join(root, 'publisher-called.json'))).rejects.toThrow();
  });
});
