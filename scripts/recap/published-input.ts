import { z } from 'zod';
import type { PublicSnapshot } from '../../src/data/schema';
import { digest, readText } from './artifacts';
import { parseCuratedSnapshot, validatePublicReadiness } from './policy';

export const PublishedApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotSchemaVersion: z.union([z.literal(1), z.literal(2)]),
  snapshotSha256: z.string().regex(/^[a-f0-9]{64}$/),
  approvedAt: z.iso.datetime(),
  coverageScope: z.enum(['verified-organization', 'accessible-repositories']),
  acknowledgeAccessibleScope: z.boolean(),
}).strict();
export type PublishedApproval = z.infer<typeof PublishedApprovalSchema>;

/** A public receipt binds approved bytes, not a claim to re-audit private coverage. */
export async function loadPublishedSnapshot(options: { root: string }): Promise<PublicSnapshot> {
  try {
    const [approved, manifestText] = await Promise.all([
      readText(options.root, 'src/data/approved.json'), readText(options.root, 'src/data/approved.manifest.json'),
    ]);
    const manifest = PublishedApprovalSchema.parse(JSON.parse(manifestText));
    const snapshot = parseCuratedSnapshot(JSON.parse(approved));
    if (manifest.snapshotSha256 !== digest(approved) || manifest.snapshotSchemaVersion !== snapshot.schemaVersion
      || manifest.coverageScope !== snapshot.coverage.scope) throw new Error('Published input mismatch');
    validatePublicReadiness(snapshot, manifest.acknowledgeAccessibleScope);
    return snapshot;
  } catch {
    throw new Error('Published input blocked: missing, changed, or invalid public approval. Export reviewed real data locally before building.');
  }
}
