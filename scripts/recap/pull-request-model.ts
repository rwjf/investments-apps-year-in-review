export interface MergedPullRequestRecord {
  repositoryId: string;
  number: number;
  mergedAt: string;
  authorType: string | null;
  reportedAdditions: number;
  reportedDeletions: number;
  changedFiles: number;
  filesComplete: boolean;
  files: { path: string; additions: number; deletions: number }[];
}
