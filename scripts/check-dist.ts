import { lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isMain, PROJECT_ROOT } from './recap/artifacts';

// Defense in depth for the current HTML/CSS-only site, NOT a privacy proof or an
// arbitrary HTML sanitizer. Strict schema + curated loader + review remain the boundary.
const PRIVATE_MARKERS = [
  /\b(?:INSUP|RWJFINVEST|rwjf)\b/iu,
  /\b[A-Z][A-Z0-9]+-\d+\b/u,
  /\b(?:repositoryId|issueTypeId|resolutionId|sourceChecks|jiraProjects)\b/iu,
  /\.recap-private|(?:candidate|coverage|approval|approved)\.json/iu,
  /FAKE_CREDENTIAL|\b(?:gh[pousr]_[a-z0-9_]+|github_pat_[a-z0-9_]+|AKIA[A-Z0-9]{16})\b/iu,
  /(?:api[_-]?token|api[_-]?key|client[_-]?secret|token|secret|password|authorization)["']?\s*[=:]/iu,
  /-----BEGIN [A-Z ]*PRIVATE KEY/iu,
  /https?:\/\//iu,
  /(?:\/Users\/|\/home\/|\/private\/|\/tmp\/|[A-Z]:\\|file:\/\/)/iu,
  /sourceMappingURL|sourcesContent/iu,
];

function hasPrivateContent(text: string): boolean {
  return PRIVATE_MARKERS.some((pattern) => pattern.test(text));
}

function decoded(value: string): string {
  const entities = value.replace(/&#(x[0-9a-f]+|\d+);?/gi, (_, code: string) => {
    const point = code[0]?.toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code);
    return point <= 0x10ffff ? String.fromCodePoint(point) : '';
  }).replace(/&(?:amp|quot|apos|lt|gt|colon|sol);/gi, (entity) => ({
    '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>', '&colon;': ':', '&sol;': '/',
  })[entity.toLowerCase()] ?? entity);
  // CSS percentages are literal text, not malformed URI escapes.
  try { return decodeURIComponent(entities.replace(/%(?![0-9a-f]{2})/gi, '%25')); } catch {
    throw new Error('Distribution blocked: invalid encoded content.');
  }
}

function attributes(tag: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    const name = match[1]!.toLowerCase();
    if (result.has(name)) throw new Error('Distribution blocked: duplicate HTML attribute.');
    result.set(name, decoded(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return result;
}

export async function checkDist(options: { directory: string; allowDemo?: boolean; basePath?: string }): Promise<void> {
  const files = new Map<string, string>();
  async function walk(directory: string, prefix = ''): Promise<void> {
    const info = await lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Distribution blocked: unsupported artifact directory.');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = prefix + entry.name;
      if (hasPrivateContent(path)) throw new Error('Distribution blocked: private content marker.');
      // Only known public formats; no private dotfiles, raw JSON, scripts or maps.
      if (!/^[a-zA-Z0-9_./-]+$/.test(path) || (path.split('/').some((part) => part.startsWith('.')) && path !== '.nojekyll')) {
        throw new Error('Distribution blocked: private or unknown artifact.');
      }
      if (entry.isDirectory()) await walk(resolve(directory, entry.name), `${path}/`);
      else if (entry.isFile() && (/\.html$/.test(path) || /^_astro\/[\w.-]+\.css$/.test(path) || path === '.nojekyll')) {
        const text = await readFile(resolve(directory, entry.name), 'utf8');
        if (hasPrivateContent(decoded(text)) || (path === '.nojekyll' && text.trim())) {
          throw new Error('Distribution blocked: private content marker.');
        }
        files.set(path, text);
      } else throw new Error('Distribution blocked: private or unknown artifact.');
    }
  }
  try { await walk(resolve(options.directory)); } catch (error) {
    if ((error as NodeJS.ErrnoException).code) throw new Error('Distribution blocked: missing or unreadable artifact. Build first.');
    throw error;
  }
  const index = files.get('index.html');
  if (!index) throw new Error('Distribution blocked: missing index.html. Build first.');

  // Infer the built mount from Astro's stylesheet, so a separate check:dist works
  // after a subpath build even without repeating the build's environment variable.
  const stylesheet = [...index.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0]))
    .find((attrs) => attrs.get('rel') === 'stylesheet')?.get('href');
  const configuredBase = options.basePath ? `${options.basePath.replace(/\/$/, '')}/` : undefined;
  const base = configuredBase ?? stylesheet?.match(/^(\/.*\/|\/)_astro\/[^/]+\.css$/)?.[1] ?? '/';
  if (!/^\/(?:[\w.-]+\/)*$/.test(base) || base.split('/').some((part) => part === '.' || part === '..')) {
    throw new Error('Distribution blocked: invalid base path.');
  }
  const documents = new Map<string, { ids: Set<string>; links: string[] }>();
  for (const [path, text] of files) {
    if (!path.endsWith('.html')) continue;
    const ids = new Set<string>();
    const links: string[] = [];
    const modes: string[] = [];
    for (const match of text.matchAll(/<([a-z][\w:-]*)\b[^>]*>/gi)) {
      const tag = match[1]!.toLowerCase();
      const attrs = attributes(match[0]);
      if (/^(script|iframe|object|embed|base|form)$/.test(tag)
        || [...attrs.keys()].some((name) => /^on/i.test(name) || /^(srcdoc|srcset|style)$/.test(name))) {
        throw new Error('Distribution blocked: unsupported active content.');
      }
      if (tag === 'meta' && attrs.get('http-equiv')) throw new Error('Distribution blocked: unsupported redirect metadata.');
      if (tag === 'meta' && attrs.get('name') === 'recap-mode') modes.push(attrs.get('content') ?? '');
      if (attrs.has('id')) ids.add(attrs.get('id')!);
      for (const name of ['href', 'src', 'poster', 'action', 'xlink:href']) {
        if (attrs.has(name)) links.push(attrs.get(name)!);
      }
    }
    if (modes.length !== 1 || !['real', 'demo'].includes(modes[0]!)) throw new Error('Distribution blocked: missing or invalid recap mode.');
    if (modes[0] !== 'real' && !options.allowDemo) throw new Error('Distribution blocked: real recap required; demo is local-preview only.');
    documents.set(path, { ids, links });
  }

  function checkLink(value: string, from: string): void {
    if (!value || /[\\\s]|&|^[a-z][\w+.-]*:|^\/\//i.test(value)) throw new Error('Distribution blocked: unsupported or external link.');
    const current = new URL(`${base}${from}`, 'https://recap.invalid');
    const target = new URL(value, current);
    if (!target.pathname.startsWith(base)) throw new Error('Distribution blocked: link escapes the site base path.');
    let path = decoded(target.pathname.slice(base.length));
    if (path === '' || path.endsWith('/')) path += 'index.html';
    if (!files.has(path)) throw new Error('Distribution blocked: broken local link.');
    if (target.hash && !documents.get(path)?.ids.has(decoded(target.hash.slice(1)))) throw new Error('Distribution blocked: broken chapter link.');
  }
  for (const [path, document] of documents) for (const link of document.links) checkLink(link, path);
  for (const [path, text] of files) {
    if (!path.endsWith('.css')) continue;
    if (/@import|\\/i.test(text)) throw new Error('Distribution blocked: unsupported CSS resource.');
    for (const match of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) checkLink(decoded(match[1]!), path);
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && args[0] !== '--allow-demo')) throw new Error('Usage: npm run check:dist -- [--allow-demo]');
    await checkDist({ directory: resolve(PROJECT_ROOT, process.env.RECAP_OUT_DIR || 'dist'), allowDemo: args[0] === '--allow-demo' });
    console.log('Distribution check passed (defense in depth; reviewed curated input is still required).');
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
