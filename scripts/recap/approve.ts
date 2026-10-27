import { atomicWrite, digest, isMain, jsonText, PROJECT_ROOT, readText } from './artifacts';
import { validateReviewInputs } from './policy';

interface ApprovalOptions {
  root?: string;
  confirmReviewed?: boolean;
  acknowledgeAccessibleScope?: boolean;
}

export async function approveSnapshot(options: ApprovalOptions = {}): Promise<void> {
  try {
    if (options.confirmReviewed !== true) throw new Error('Explicit review required');
    const root = options.root ?? PROJECT_ROOT;
    const [candidate, coverage] = await Promise.all([
      readText(root, '.recap-private/candidate.json'), readText(root, '.recap-private/coverage.json'),
    ]);
    const acknowledge = options.acknowledgeAccessibleScope === true;
    const snapshot = validateReviewInputs(candidate, coverage, acknowledge);
    const approved = jsonText(snapshot);
    const receipt = { schemaVersion: 1, confirmReviewed: true, acknowledgeAccessibleScope: acknowledge,
      approvedAt: new Date().toISOString(), candidateHash: digest(candidate), coverageHash: digest(coverage),
      approvedHash: digest(approved) };
    // Publish the input last: a failed receipt write cannot replace the previous approved input.
    // A crash between renames fails closed because the build validates all three hashes.
    await atomicWrite(root, '.recap-private/approval.json', jsonText(receipt));
    await atomicWrite(root, 'src/data/approved.json', approved, false);
  } catch {
    throw new Error('Approval refused. Explicit review, canonical real data, and complete source reads are required; only independent inventory uncertainty may be acknowledged.');
  }
}

if (isMain(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (new Set(args).size !== args.length || args.some((arg) => !['--confirm-reviewed', '--acknowledge-accessible-scope'].includes(arg))) {
      throw new Error('Invalid arguments');
    }
    await approveSnapshot({ confirmReviewed: args.includes('--confirm-reviewed'),
      acknowledgeAccessibleScope: args.includes('--acknowledge-accessible-scope') });
    console.log('Reviewed real snapshot approved. The local receipt is a review safeguard, not an independent source audit.');
  } catch {
    console.error('Approval refused. Use --confirm-reviewed after reviewing candidate.json and coverage.json. Only inventory/visibility uncertainty may use --acknowledge-accessible-scope.');
    process.exitCode = 1;
  }
}
