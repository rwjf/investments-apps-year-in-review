# Team Recap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public static 2026 recap from reviewed, locally collected Jira and GitHub aggregates.

**Architecture:** A local collector normalizes private API data, calculates metrics, and emits an allowlisted candidate snapshot plus a separate ignored coverage report. An explicit approval step promotes validated data to the site input. Astro renders that input as a single static guided-snapshot page; publication never fetches source data.

**Tech Stack:** Astro static output, TypeScript, Node.js 22 LTS, npm, tsx for local commands, Zod for strict schemas, Vitest for fixture tests, Playwright for focused browser checks. GitHub CLI handles existing GitHub authentication; Jira REST uses local environment credentials.

**Spec:** `docs/superpowers/specs/2026-10-27-team-recap-design.md`

**Execution status:** All seven implementation tasks and scoped reviews completed on `feat/team-recap`. Integrated validation passed 182 tests, seven applicable browser scenarios, static demo build/output inspection, Astro checks, and dependency audit; a final Jira timestamp interoperability fix additionally passed 53 impacted tests and two targeted browser scenarios. Final cross-system re-review approved local software use. Live-source acceptance and publication remain pending; do not re-execute completed implementation tasks to address credential setup.

**Real-data follow-up:** Jira MCP and GitHub collection completed at the fixed October 27 cutoff. A metadata-bound GitHub canonical-pagination fix passed independent review and the expanded 206-test suite. The user explicitly approved the real aggregate snapshot for local preview with the accessible-source caveat: 935 dependency fixes, 67 successful production deployments, and 515 completed work items. Real static build and output guard passed. Full organization-wide visibility and public publication remain unapproved/unverified.

## Global Constraints

- Jira scope: INSUP and RWJFINVEST.
- GitHub scope: the entire rwjf organization, not only repositories linked to those Jira projects.
- Reporting period: calendar year 2026.
- Deployment scope: successful production deployments only; environment names Prod and Production.
- No issue/repository/person/vulnerability specifics or links back to Jira or GitHub.
- Local collection -> explicit review -> approved sanitized snapshot -> static build; no backend, database, sign-in, or source credentials in CI.
- Reporting timezone: America/New_York. Before year-end, say '2026 so far' and show the actual cutoff.
- Dependabot dependency alerts fixed only in v1; dismissed alerts are not fixes.
- Unknown data is unavailable, not zero. Samples never establish whole-organization coverage.
- Follow the accepted light-header mockup; deep blue #042E43, purple #AF45C9, yellow #FFE873, mint #8DF3CE.
- No production font hotlinks, invented official logo, tracking, live source requests, or summed 'total accomplishments'.
- No actual public publication until separately authorized. Do not initialize a remote or push changes during implementation.

## Review Focus

1. Secrets or raw source identifiers nested in unexpected fields must fail strict public-schema validation (Task 1).
2. Pagination loops, permission failures, and inaccessible repositories must invalidate complete coverage rather than quietly reducing totals (Task 2).
3. Historically successful deployments later marked inactive must count using their first success, not their latest status (Task 4).
4. A changed candidate or coverage report must invalidate its approval; demo data must not pass the normal publication path (Task 5).
5. A GitHub Pages project subpath must preserve assets and chapter navigation without SPA routing (Tasks 6–7).

---

## File structure and shared contracts

- `package.json`, `tsconfig.json`, `astro.config.mjs`, `vitest.config.ts`: minimal static/tool configuration.
- `.gitignore`, `.env.example`: ignore private artifacts before source collection; document variables without values.
- `src/data/schema.ts`: strict public snapshot schema and inferred `PublicSnapshot` type.
- `src/data/demo.json`: explicitly labeled illustrative snapshot; never the default real build input.
- `src/data/approved.json`: generated approved input; absent until approval, not populated with pretend results.
- `scripts/recap/model.ts`: private normalized types and coverage types shared by source adapters and reducers.
- `scripts/recap/period.ts`: reporting boundaries, cutoff, month buckets.
- `scripts/recap/http.ts`, `github.ts`, `jira.ts`: private API transport and adapters.
- `scripts/recap/metrics.ts`: pure counting, filtering, and aggregate breakdowns.
- `scripts/recap/collect.ts`, `approve.ts`, `build-input.ts`: collection orchestration, approval, and build gate.
- `recap.config.json`: non-secret organization/projects/environment/timezone configuration plus confirmed Jira issue-type/resolution exclusions.
- `.recap-private/`: ignored candidate, private report, and approval receipt; never copied to public assets.
- `src/layouts/Layout.astro`, `src/pages/index.astro`, `src/components/MetricCard.astro`, `src/components/RecapChapter.astro`, `src/styles/global.css`: designer-owned site.
- `tests/recap/*.test.ts`, `tests/fixtures/*`: synthetic collector/privacy/approval tests.
- `tests/browser/recap.spec.ts`, `playwright.config.ts`: focused browser acceptance.
- `scripts/check-dist.ts`, `README.md`: publication guard, local static Pages recipe, local usage.

Private normalized records use only fields needed by reducers:

- `IssueRecord { id, project, issueTypeId, issueTypeName, statusCategory, resolutionId, resolvedAt: string|null }`.
- `AlertRecord { repositoryId, number, state, fixedAt: string|null, severity }`.
- `DeploymentRecord { repositoryId, id, environment, statuses: { state, createdAt }[] }`.
- `Period { start: string, endExclusive: string, cutoffExclusive: string, timezone: 'America/New_York' }`; all boundaries are ISO instants.
- `CoverageReport { complete: boolean, inventoryVerified: boolean, issues: CoverageIssue[], sourceChecks: SourceCheck[] }`. `CoverageIssue` contains private source identifiers and a typed reason; `SourceCheck` distinguishes success/empty/disabled/denied/failed. Do not export this type to browser code.
- `CollectionResult<T> { records: T[], coverage: CoverageReport }`.

Public `PublicSnapshot` has strict, recursively allowlisted fields: `schemaVersion: 1`, `mode: 'demo'|'real'`, `year`, `timezone`, `periodStart`, `periodEndExclusive`, `cutoffExclusive`, `collectedAt`, `isYearToDate`, `metrics`, and `coverage`. `metrics` contains `dependencyAlertsFixed`, `productionDeployments`, `workItemsClosed`, each `{ status: 'available'|'unavailable', count: number|null, breakdown: { label: string, count: number }[] }`. `coverage` contains only `{ scope: 'verified-organization'|'accessible-repositories', notes: string[] }`. Labels and notes are generated from curated templates/known aggregate categories, never raw API text. Count must be null for unavailable and a nonnegative integer for available. Available breakdowns must reconcile to their count.

## Task 1: Validated snapshot contract and period logic

**Files:** Create root configuration, `.gitignore`, `.env.example`, `src/data/schema.ts`, `src/data/demo.json`, `scripts/recap/model.ts`, `period.ts`, `tests/recap/schema.test.ts`, `period.test.ts`.

**Interfaces:** Produce `PublicSnapshotSchema`, `type PublicSnapshot`, `makePeriod(year: number, asOf: string): Period`, `withinPeriod(instant: string, period: Period): boolean`, and `monthKey(instant: string, period: Period): string`. Pin Node >=22 and use a lockfile. No credentials or source access during scaffolding.

- [ ] Write failing tests, including these exact assertions (fixture helpers defined in the same test file):
  ```ts
  expect(PublicSnapshotSchema.safeParse({...validDemo(), repository: 'private-name'}).success).toBe(false);
  expect(PublicSnapshotSchema.safeParse(withNestedExtraField(validDemo(), 'token')).success).toBe(false);
  expect(withinPeriod('2026-01-01T04:59:59Z', fullYear())).toBe(false);
  expect(withinPeriod('2026-01-01T05:00:00Z', fullYear())).toBe(true);
  expect(withinPeriod('2027-01-01T05:00:00Z', fullYear())).toBe(false);
  expect(withinPeriod('2026-10-27T16:00:00Z', makePeriod(2026, '2026-10-27T16:00:00Z'))).toBe(false);
  expect(monthKey('2026-07-01T03:30:00Z', fullYear())).toBe('2026-06');
  ```
- [ ] Add failing cases for negative/fractional counts, count/breakdown mismatches, invalid timestamps, and unavailable metrics carrying numeric zero.
- [ ] Run `npx vitest run tests/recap/schema.test.ts tests/recap/period.test.ts`; confirm missing implementation fails.
- [ ] Implement contracts and strict schemas; use a timezone-aware date library rather than assuming a constant UTC offset. Add only required dependencies and minimal config, including `@astrojs/check` for the check command. Define `npm test` as the Vitest unit/fixture suite, excluding `tests/browser/`. Ignore `.env*` except `.env.example`, `.recap-private/`, `.superpowers/`, build output, browser artifacts, and dependencies.
- [ ] Rerun the same focused tests and `npx astro check`; require passing results. If a Git repository exists, commit only this task's files; otherwise leave changes uncommitted and report that fact. This commit rule applies to every later task too.

## Task 2: Read-only source adapters and coverage

**Files:** Create `scripts/recap/http.ts`, `github.ts`, `jira.ts`, `recap.config.json`, `tests/recap/sources.test.ts`; extend private model only as necessary without changing public schema.

**Interfaces:** Consume Task 1 types. Produce `collectGithub(config: CollectorConfig, period: Period): Promise<{alerts: CollectionResult<AlertRecord>, deployments: CollectionResult<DeploymentRecord>}>` and `collectJira(config: CollectorConfig, period: Period): Promise<CollectionResult<IssueRecord>>`. Define `CollectorConfig` in `model.ts` with fixed source scope, reporting settings, Jira exclusion IDs, optional private inventory path, and optional private Jira base URL. Inject a read-only transport in adapter tests; never shell-interpolate external strings.

- [ ] Write failing fixture tests named `followsAllPages`, `rejectsRepeatedCursor`, `deniedIsNotEmpty`, `incompleteInventoryIsExplicit`, `rateLimitRetryIsBounded`, `readsResolutionDateFromRest`, and `readsEveryDeploymentStatusPage`. Assert two-page inputs include records from both pages; a repeated cursor or 403 produces incomplete coverage; a successful empty response is distinct; exhausted retry never returns complete coverage.
- [ ] Run `npx vitest run tests/recap/sources.test.ts` and confirm failure before implementing adapters.
- [ ] Implement GitHub REST reads through `gh api` with structured arguments, following Link pagination. Read org inventory including archived repositories, fixed Dependabot alerts, repository deployments and all relevant status history. Filter production names before status fetches. Stop by deployment creation date only when ordering is proven safe; otherwise paginate. Never prune alerts by creation year. Validate records and surface malformed responses.
- [ ] Implement direct Jira REST enhanced issue search with pagination, explicit fields, project scope, and resolution-date predicates. Use local `JIRA_BASE_URL`, `JIRA_EMAIL`, `JIRA_API_TOKEN`; no fallback to browser cookies or runtime MCP. Discover relevant issue types/resolutions and record unmapped exclusions as approval blockers, not guessed completion criteria. Do not export names/IDs to the public snapshot.
- [ ] Bound transient/rate-limit retries to three attempts with capped waits honoring sane Retry-After values; no retries for auth failures. Keep logs free of credentials and raw payloads. Treat missing historical/deleted repositories as a coverage limitation, not magically recoverable data.
- [ ] Rerun source tests. Perform a bounded live metadata check only after confirming ignore rules and local credential availability. Do not require source credentials for fixture tests or CI. Record field mappings and coverage privately, not in source fixtures.

## Task 3: Pure Jira and Dependabot metrics

**Files:** Create `scripts/recap/metrics.ts`, `tests/recap/work-items.test.ts`, `security.test.ts`; use synthetic fixtures.

**Interfaces:** Consume normalized source records and Period. Produce `countWorkItems(records: IssueRecord[], period: Period, exclusions: {issueTypeIds: string[], resolutionIds: string[]}): PublicSnapshot['metrics']['workItemsClosed']` and `countDependencyFixes(records: AlertRecord[], period: Period): PublicSnapshot['metrics']['dependencyAlertsFixed']`.

- [ ] Write failing fixtures and assertions: repeated issue ID counts once; resolved Done item in period counts; reopened item, epic, canceled/duplicate resolution, missing resolution date, and out-of-period date do not count. All included issue types including subtasks contribute to a reconciling aggregate breakdown. An unknown source category requiring a resolution mapping blocks collection acceptance outside the reducer.
- [ ] Write failing security fixtures: duplicated repository-ID/alert-number counts once; two repositories with the same alert number count twice; fixed alert with in-period `fixedAt` counts; dismissed/open alerts and fixes outside the period do not. Severity output labels are allowlisted, with an Unknown bucket where needed.
- [ ] Run `npx vitest run tests/recap/work-items.test.ts tests/recap/security.test.ts`; confirm failing assertions.
- [ ] Implement both pure reducers using Task 1 period helpers; include only canonical display labels, no source entities. Return zero only for a supplied complete empty record set; orchestration controls whether that set is trustworthy.
- [ ] Run the same focused tests and verify breakdown sums equal counts.

## Task 4: Production deployment metric

**Files:** Extend `scripts/recap/metrics.ts`; create `tests/recap/deployments.test.ts`.

**Interfaces:** Produce `countProductionDeployments(records: DeploymentRecord[], period: Period, environments: string[]): PublicSnapshot['metrics']['productionDeployments']`, called with `['Prod', 'Production']`. No concurrent writer may edit `metrics.ts` while Task 3 is active.

- [ ] Write failing tests: success -> inactive still counts; waiting/failed only never counts; `' prod '` and `'PRODUCTION'` match; staging does not; duplicate deployment ID within repository counts once; same numeric ID in different repositories stays distinct; multiple successes count once at earliest success. First success before 2026 followed by another success in 2026 does not create a new deployment; a new deployment ID does. Month buckets use Eastern time and sum to the total.
- [ ] Run `npx vitest run tests/recap/deployments.test.ts`; require failure before reducer implementation.
- [ ] Implement matching, deduplication, first-success selection, cutoff filtering, and all 12 month buckets without treating workflow runs as deployment records.
- [ ] Run the same focused tests; compare a bounded source sample against its observed status history before accepting real data.

## Task 5: Collection, approval, and build gate

**Files:** Create `scripts/recap/collect.ts`, `approve.ts`, `build-input.ts`, `tests/recap/approval.test.ts`, `collection.test.ts`; add npm command scripts.

**Interfaces:** Produce commands `npm run collect -- --year 2026`, `npm run approve -- --confirm-reviewed`, `npm run build`, and `npm run build:demo`. `loadBuildSnapshot(options: {allowDemo: boolean}): Promise<PublicSnapshot>` is the only site data entry point. Collection writes `.recap-private/candidate.json` and `coverage.json`; approval writes `src/data/approved.json` and an ignored hash receipt covering both input files and the approved snapshot. These command names are stable for docs/CI.

- [ ] Write failing tests: private report is never embedded in candidate; network failure makes the relevant metric unavailable; unacknowledged coverage gaps prevent approval; changed candidate or report invalidates the receipt; demo snapshot cannot be approved as real; absence of `--confirm-reviewed` refuses promotion; normal build refuses missing/unapproved input; demo build shows unmistakable demo state. Assert the fixture containing a fake credential never reaches candidate JSON or generated error messages.
- [ ] Run `npx vitest run tests/recap/approval.test.ts tests/recap/collection.test.ts`; confirm failures.
- [ ] Implement collection orchestration, canonical public-template generation, strict validation, safe writes, nonzero exits, explicit approval, and provenance receipts. Do not silently overwrite prior approved input during collection. If coverage is limited, require `--acknowledge-accessible-scope` and generate a generic visible coverage caveat. Denied/failed required sources cannot be acknowledged into valid totals.
- [ ] Implement `npm run build` to validate the approval receipt before `astro build`. The receipt is a local review safeguard, not a cryptographic assertion that the source facts are independently audited. `npm run build:demo` uses only the bundled demo with `mode: demo`; it does not fabricate approved data. Expose a private reviewed metric override only if a real source gap is encountered, through a separately documented explicit override path with provenance and no raw text passthrough; otherwise omit this extension.
- [ ] Rerun focused tests. Verify the default build fails cleanly before real approval and the explicit demo build succeeds with the public demo warning.

## Task 6: Branded static guided snapshot

**Owner:** Designer; implementation and focused visual checks belong to that lane. No collector changes.

**Files:** Create `src/layouts/Layout.astro`, `src/pages/index.astro`, `src/components/MetricCard.astro`, `RecapChapter.astro`, `src/styles/global.css`, `tests/browser/recap.spec.ts`, `playwright.config.ts`.

**Interfaces:** Consume `PublicSnapshot` through `loadBuildSnapshot({allowDemo})` from Task 5. No direct source imports in components; no API calls in the browser. Root page renders overview plus `#security`, `#deployments`, `#work-items` anchors. Honor configured Astro base path for all assets.

- [ ] Add failing browser checks against a demo build: heading contains `2026 so far` for the supplied cutoff; visible illustrative-data warning; three accurately labeled counts; chapter anchors navigate; unavailable is rendered as unavailable, not zero; generic coverage caveat visible when limited; no source links or outbound source requests. Include a completed-year fixture with no 'so far' label.
- [ ] Run `npx playwright test tests/browser/recap.spec.ts` with the configured local build/preview server; confirm missing UI failures.
- [ ] Implement the accepted minimal-header design. Show aggregate breakdowns only when available; remove placeholder instructional mockup copy. Use no external font/image requests. Render dates in Eastern time, concise metric definitions, honest reporting scope, and team-oriented language without inventing impact. Keep counts available without JavaScript.
- [ ] Verify keyboard focus and chapter navigation at 375px and 1440px widths, no horizontal overflow, reduced-motion behavior, and meaningful heading order. Add relevant assertions to the same browser test. Check root and `/year-in-review/` base-path builds.
- [ ] Run only the focused browser checks for this lane and provide artifact paths/screenshots if tooling permits; parent reviews copy and produced files before integration.

## Task 7: Safe static publication and usage documentation

**Files:** Create `scripts/check-dist.ts`, `README.md`, `tests/recap/dist.test.ts`; adjust `astro.config.mjs` and npm scripts if needed.

**Interfaces:** Produce `npm run check:dist`, `npm run publish` for local Pages publication, and a documented local refresh flow. Publication uses a locally built artifact, not a fresh source collection in CI. No Actions workflow is necessary for v1; this avoids rebuilding without the ignored local review receipt.

- [ ] Write failing distribution fixtures: root and project-subpath assets resolve; private files or source URLs/credential markers fail inspection; demo output fails the real publication guard. Test missing real artifact fails clearly, rather than rebuilding from demo.
- [ ] Run `npx vitest run tests/recap/dist.test.ts`; confirm failure.
- [ ] Implement the artifact guard and a local `gh-pages` static-directory publication script with `.nojekyll`. `npm run publish` must run the approved real build and distribution guard before invoking the publisher. Adding the dev dependency is allowed during implementation; do not execute publication or create a remote without separate authorization. The hosting recipe uses ordinary GitHub publishing access, never Jira/source-data credentials in the artifact. Add exact preview/build/base-path commands to README.
- [ ] Write README from the actual commands/config: source access and permissions, local env setup, collector scope, Jira mappings, production name rules, timezone, review/approval, coverage limitations, demo preview vs real build, and refreshing the year. Note the public site has no secrets while the local collector necessarily handles private data. Keep source scopes and local credentials out of public build assets.
- [ ] Run the focused dist tests; confirm documentation commands match package scripts. Parent runs one complete validation pass after all writers reconcile: `npm test`, `npx astro check`, `npm run build:demo`, focused browser suite, and `npm run check:dist -- --allow-demo` for the demonstration artifact. A real publication additionally requires approved real input, `npm run build`, and `npm run check:dist` with no demo bypass.

## Execution and validation ownership

Tasks 1–5 establish contracts and the local pipeline in order. The designer may start Task 6 once Tasks 1 and 5 expose a settled build-input contract; do not run parallel writers against shared config/package files. Task 7 follows the finalized command surface. Parent owns final reconciliation, public-copy review, artifact inspection, and the full validation pass; specialists own focused tests only. No live totals or deployment is claimed from fixture evidence.

If local Jira credentials are unavailable, finish fixture-backed implementation and explicitly report live Jira validation as pending; never scrape credentials or request that secrets be pasted into chat. Do not block demo-site delivery on credentials. Real-source approval remains blocked until mappings/access/coverage are checked.

No product files have been created by this plan. No Git repository exists yet; commits and worktrees are conditional on initializing version control during authorized execution. Do not commit raw/private artifacts or public illustrative results as real data.

## Plan self-review

- [x] Spec coverage mapped to tasks: public boundary/schema (1,5,7), source access/coverage (2), metric definitions (3,4), approval (5), approved visual direction/accessibility (6), static hosting/refresh (7).
- [x] Interfaces use normalized private types and the single public schema consistently.
- [x] Each Review Focus condition has an owning test task.
- [x] Kept optional unsupported security categories, archive, automation, and manual override extensions out of the default implementation.
- [x] No source collection, scaffolding, installation, or product implementation occurred during planning.
