import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PublicSnapshot } from '../../src/data/schema';
import { digest, isMain, PROJECT_ROOT, readText } from './artifacts';
import { parseCuratedSnapshot, ReceiptSchema, validateReviewInputs } from './policy';
import { loadPublishedSnapshot } from './published-input';

/** The build wrapper sets this to "1" only for the explicit build:demo command. */
export const ALLOW_DEMO_ENV = 'RECAP_ALLOW_DEMO';
/** Private wrapper-to-prerender context: bundled modules no longer reside at the source root. */
export const BUILD_ROOT_ENV = 'RECAP_BUILD_ROOT';
export const BUILD_INPUT_ENV = 'RECAP_BUILD_INPUT';

/** Shared private gate: return the exact validated bundle so export can detect intervening edits. */
export async function loadPrivateApproval(root: string) {
  try {
    if (!isAbsolute(root)) throw new Error('Absolute build root required');
    const [candidate, coverage, approved, receiptText] = await Promise.all([
      readText(root, '.recap-private/candidate.json'), readText(root, '.recap-private/coverage.json'),
      readText(root, 'src/data/approved.json'), readText(root, '.recap-private/approval.json'),
    ]);
    const receipt = ReceiptSchema.parse(JSON.parse(receiptText));
    if (receipt.candidateHash !== digest(candidate) || receipt.coverageHash !== digest(coverage)
      || receipt.approvedHash !== digest(approved)) throw new Error('Review inputs changed');
    const reviewed = validateReviewInputs(candidate, coverage, receipt.acknowledgeAccessibleScope);
    const snapshot = parseCuratedSnapshot(JSON.parse(approved));
    if (JSON.stringify(snapshot) !== JSON.stringify(reviewed)) throw new Error('Approved input mismatch');
    return { snapshot, receipt, inputs: [candidate, coverage, approved, receiptText] };
  } catch {
    throw new Error('Build blocked: missing, changed, or unapproved recap input. Collect and explicitly approve real data, or use npm run build:demo.');
  }
}

export async function loadBuildSnapshot(options: {
  allowDemo: boolean; root?: string; inputMode?: 'private' | 'published';
}): Promise<PublicSnapshot> {
  const root = options.root ?? process.env[BUILD_ROOT_ENV] ?? PROJECT_ROOT;
  const inputMode = options.inputMode ?? process.env[BUILD_INPUT_ENV] ?? 'private';
  if (inputMode === 'published' && !options.allowDemo && isAbsolute(root)) {
    return loadPublishedSnapshot({ root });
  }
  try {
    if (inputMode !== 'private' || !isAbsolute(root)) throw new Error('Invalid build context');
    if (options.allowDemo) {
      const demo = parseCuratedSnapshot(JSON.parse(await readText(root, 'src/data/demo.json')));
      if (demo.mode !== 'demo') throw new Error('Demo fixture required');
      return demo;
    }
    return (await loadPrivateApproval(root)).snapshot;
  } catch {
    throw new Error('Build blocked: missing, changed, or unapproved recap input. Collect and explicitly approve real data, or use npm run build:demo.');
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length > 1 || (args.length === 1 && !['--demo', '--published'].includes(args[0]))) throw new Error('Invalid arguments');
    // Ignore inherited demo flags: normal npm build must always validate real approval first.
    const allowDemo = args[0] === '--demo';
    const inputMode = args[0] === '--published' ? 'published' : 'private';
    const snapshot = await loadBuildSnapshot({ allowDemo, root: PROJECT_ROOT, inputMode });
    if (snapshot.mode === 'demo') console.warn('DEMO BUILD — ILLUSTRATIVE ONLY. No source data was collected. Not approved real results.');
    const child = spawn(process.execPath, [fileURLToPath(new URL('../../node_modules/astro/bin/astro.mjs', import.meta.url)), 'build'], {
      cwd: PROJECT_ROOT, stdio: 'inherit',
      env: { ...process.env, [ALLOW_DEMO_ENV]: allowDemo ? '1' : '0', [BUILD_ROOT_ENV]: PROJECT_ROOT,
        [BUILD_INPUT_ENV]: inputMode },
    });
    child.on('error', () => { console.error('Static build could not start.'); process.exitCode = 1; });
    child.on('exit', (code) => { process.exitCode = code ?? 1; });
  } catch {
    console.error('Build blocked: missing, changed, or unapproved recap input. Collect and explicitly approve real data, or use npm run build:demo.');
    process.exitCode = 1;
  }
}
