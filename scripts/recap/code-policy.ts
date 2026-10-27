import { posix } from 'node:path';

export const CODE_POLICY_VERSION = 'known-generated-v1' as const;

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules', 'vendor', 'dist', 'build', 'coverage', 'generated', '__generated__',
]);
const LOCKFILES = new Set([
  'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
  'cargo.lock', 'poetry.lock', 'uv.lock', 'pipfile.lock', 'composer.lock', 'gemfile.lock', 'go.sum',
  'packages.lock.json', '.terraform.lock.hcl',
]);
const GENERATED_SUFFIXES = ['.min.js', '.min.css', '.map', '.g.cs', '.g.i.cs'];

export function isExcludedCodePath(path: string): boolean {
  const segments = posix.normalize(path).toLowerCase().split('/');
  const basename = segments[segments.length - 1];
  return segments.slice(0, -1).some((segment) => EXCLUDED_DIRECTORIES.has(segment))
    || LOCKFILES.has(basename)
    || GENERATED_SUFFIXES.some((suffix) => basename.endsWith(suffix));
}
