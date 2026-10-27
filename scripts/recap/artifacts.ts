import { createHash, randomUUID } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve relative to this module, not the caller's working directory.
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function jsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export async function readText(root: string, path: string): Promise<string> {
  return readFile(resolve(root, path), 'utf8');
}

export async function atomicWrite(root: string, path: string, text: string, privateFile = true): Promise<void> {
  const destination = resolve(root, path);
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { flag: 'wx', mode: privateFile ? 0o600 : 0o644 });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export function isMain(moduleUrl: string): boolean {
  try {
    // macOS /var is a symlink to /private/var; runners can canonicalize only one side.
    return process.argv[1] !== undefined
      && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}
