import { describe, expect, it } from 'vitest';
import * as policy from '../../scripts/recap/code-policy';

describe('known-generated-v1 path policy', () => {
  it('exposes the version and matches exact nested segments, not substrings', () => {
    expect(policy.CODE_POLICY_VERSION).toBe('known-generated-v1');
    const { isExcludedCodePath } = policy;
    expect(isExcludedCodePath('web/package-lock.json')).toBe(true);
    expect(isExcludedCodePath('web/src/main.ts')).toBe(false);
  });

  it.each(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'generated', '__generated__'])('excludes directory segment %s case-insensitively', (segment) => {
    expect(policy.isExcludedCodePath).toBeTypeOf('function');
    expect(policy.isExcludedCodePath(`web/${segment.toUpperCase()}/nested/main.ts`)).toBe(true);
  });

  it.each(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb',
    'cargo.lock', 'poetry.lock', 'uv.lock', 'pipfile.lock', 'composer.lock', 'gemfile.lock', 'go.sum',
    'packages.lock.json', '.terraform.lock.hcl'])('excludes lockfile %s by basename', (basename) => {
    expect(policy.isExcludedCodePath).toBeTypeOf('function');
    expect(policy.isExcludedCodePath(`web/config/${basename.toUpperCase()}`)).toBe(true);
  });

  it.each(['.min.js', '.min.css', '.map', '.g.cs', '.g.i.cs'])('excludes suffix %s', (suffix) => {
    expect(policy.isExcludedCodePath).toBeTypeOf('function');
    expect(policy.isExcludedCodePath(`web/asset${suffix.toUpperCase()}`)).toBe(true);
  });

  it.each(['src/builder.ts', 'src/distribution.ts', 'src/generated-helper.ts', 'src/vendor.ts', 'src/build',
    'src/node_modules-helper.ts', 'docs/README.md', 'tests/main.test.ts', '.github/workflows/test.yml',
    'web/package-lock.json.example', 'assets/main.min.js.txt', './web/dist/../src/main.ts'])('includes ordinary path %s', (path) => {
    expect(policy.isExcludedCodePath).toBeTypeOf('function');
    expect(policy.isExcludedCodePath(path)).toBe(false);
  });

  it('normalizes redundant relative POSIX segments', () => {
    expect(policy.isExcludedCodePath).toBeTypeOf('function');
    expect(policy.isExcludedCodePath('./web/src/../DIST//main.js')).toBe(true);
  });
});
