export interface Period {
  start: string;
  endExclusive: string;
  cutoffExclusive: string;
  timezone: 'America/New_York';
}

export interface IssueRecord {
  id: string;
  project: string;
  issueTypeId: string;
  issueTypeName: string;
  statusCategory: string;
  resolutionId: string | null;
  resolvedAt: string | null;
}

export interface AlertRecord {
  repositoryId: string;
  number: number;
  state: string;
  fixedAt: string | null;
  severity: string;
}

export interface DeploymentRecord {
  repositoryId: string;
  id: string;
  environment: string;
  statuses: { state: string; createdAt: string }[];
}

export type CoverageIssueReason = 'denied' | 'failed' | 'inaccessible' | 'pagination' | 'inventory' | 'mapping';

export interface CoverageIssue {
  source: string;
  identifier: string;
  reason: CoverageIssueReason;
}

export interface SourceCheck {
  source: string;
  status: 'success' | 'empty' | 'disabled' | 'denied' | 'failed';
}

export interface CoverageReport {
  complete: boolean;
  inventoryVerified: boolean;
  issues: CoverageIssue[];
  sourceChecks: SourceCheck[];
}

export interface CollectionResult<T> {
  records: T[];
  coverage: CoverageReport;
}

export interface SourceRequest {
  source: 'github' | 'jira';
  method: 'GET' | 'POST';
  path: string;
  body?: Record<string, unknown>;
}

export interface SourceResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export interface CollectorConfig {
  organization: 'rwjf';
  projects: ['INSUP', 'RWJFINVEST'];
  year: 2026;
  timezone: 'America/New_York';
  productionEnvironments: ['Prod', 'Production'];
  jiraExclusions: {
    issueTypeIds: string[];
    resolutionIds: string[];
    confirmed: boolean;
  };
  /** Private, independently reviewed repository inventory and/or Jira visibility attestation. */
  inventoryPath?: string;
  jiraBaseUrl?: string;
  transport?: (request: SourceRequest) => Promise<SourceResponse>;
  sleep?: (milliseconds: number) => Promise<void>;
}
