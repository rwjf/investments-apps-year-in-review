import { atomicWrite, isMain, jsonText, PROJECT_ROOT } from './artifacts';
import { loadPrivateApproval } from './build-input';
import { PublishedApprovalSchema, type PublishedApproval } from './published-input';

const REFUSAL = 'Export refused. Existing reviewed real data and unchanged private approval proof are required.';

export async function exportApprovedManifest(options: { root?: string } = {}): Promise<PublishedApproval> {
  try {
    const root = options.root ?? PROJECT_ROOT;
    // This gate is always private, regardless of inherited CI/demo/published environment flags.
    const reviewed = await loadPrivateApproval(root);
    const manifest = PublishedApprovalSchema.parse({ schemaVersion: 1,
      snapshotSchemaVersion: reviewed.snapshot.schemaVersion, snapshotSha256: reviewed.receipt.approvedHash,
      approvedAt: reviewed.receipt.approvedAt, coverageScope: reviewed.snapshot.coverage.scope,
      acknowledgeAccessibleScope: reviewed.receipt.acknowledgeAccessibleScope });
    const current = await loadPrivateApproval(root);
    if (reviewed.inputs.some((text, index) => text !== current.inputs[index])) throw new Error('Review inputs changed');
    // Replace only the public manifest, after rechecking the exact validated bytes.
    await atomicWrite(root, 'src/data/approved.manifest.json', jsonText(manifest), false);
    return manifest;
  } catch {
    throw new Error(REFUSAL);
  }
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.length !== 2) throw new Error('Invalid arguments');
    await exportApprovedManifest();
    console.log('Public approval manifest exported from existing local review proof.');
  } catch {
    console.error(REFUSAL);
    process.exitCode = 1;
  }
}
