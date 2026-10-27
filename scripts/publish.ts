import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { checkDist } from './check-dist';
import { isMain, PROJECT_ROOT } from './recap/artifacts';

/** Local static-directory publishing only: no collection, remote setup, or demo bypass. */
export async function publishSnapshot(options: { root?: string; env?: NodeJS.ProcessEnv } = {}): Promise<void> {
  const root = options.root ?? PROJECT_ROOT;
  const env = options.env ?? process.env;
  if (resolve(root, env.RECAP_OUT_DIR || 'dist') !== resolve(root, 'dist')) {
    throw new Error('Publication blocked: RECAP_OUT_DIR must be dist for local publication.');
  }
  const remote = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' });
  if (remote.status !== 0 || !remote.stdout.trim()) throw new Error('Publication blocked: configure and review an origin remote before publishing.');
  // Remove stale files before the gated build; a failed build must never reuse dist.
  await rm(resolve(root, 'dist'), { recursive: true, force: true });
  const build = spawnSync('npm', ['run', 'build'], { cwd: root, env: { ...process.env, ...env, RECAP_OUT_DIR: './dist' }, stdio: 'inherit' });
  if (build.status !== 0) throw new Error('Publication blocked: approved real build failed.');
  await checkDist({ directory: resolve(root, 'dist'), basePath: env.RECAP_BASE_PATH });
  const published = spawnSync(process.execPath, [resolve(root, 'node_modules/gh-pages/bin/gh-pages.js'), '--dist', 'dist', '--nojekyll'], {
    cwd: root, env: { ...process.env, ...env }, stdio: 'inherit',
  });
  if (published.status !== 0) throw new Error('Static publication failed. Check ordinary GitHub push access and Pages settings.');
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Usage: npm run publish (no demo or publisher flags accepted)');
    await publishSnapshot();
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
