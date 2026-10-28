# Delightful Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing recap into a playful, comparison-led experience with measured code volume, book-equivalents, and bot-authored PR activity.

**Architecture:** Extend the strict snapshot/review contract while preserving v1 compatibility and rollback. Collect merged PR/file metadata locally, aggregate it privately, and add only curated scalar totals to the reviewed snapshot. Astro renders the selected Delightful scale experience as self-contained HTML/CSS; hosting remains unchanged.

**Tech Stack:** Existing Astro/TypeScript, Zod, Luxon, tsx, Vitest, Playwright, authenticated local GitHub CLI. No new runtime framework or dependencies expected; retain Node >=22.23.4.

**Spec:** `docs/superpowers/specs/2026-10-27-delightful-scale-design.md`

**Execution status:** Implementation and scoped gates completed. The user approved the expanded real local snapshot: 360,076 filtered added lines (about 6.3 book-equivalents), 101,297 removed lines, and 12 bot-authored PRs among 219 merges. Existing 935/67/515 core totals and fixed cutoff are preserved. Parent integrated validation passed 373 unit/fixture tests and 11 applicable browser scenarios; UI review fixes passed six targeted cases. Approved real static build/output guard and no-JS mobile/desktop checks passed. Final whole-branch review is tracked separately; no publication is authorized.

**Final review:** Approved for local use with no Critical or Important findings. One nonblocking display edge remains: very small positive added-line totals can round to “about 0.0” book-equivalents; it does not affect the approved 6.3-book snapshot. The existing private-source Zod deprecation hint has no observed correctness/privacy impact. No additional feature or cleanup loop was introduced.

## Global Constraints

- Develop **Delightful scale**, not the recap-mixtape or scrapbook alternatives.
- Public, team-wide aggregates only; no people/repository/issue specifics, individual rankings, source links, or productivity scores.
- RWJF deep blue `#042E43`, purple `#AF45C9`, yellow `#FFE873`, mint `#8DF3CE`, and light neutral backgrounds; preserve the minimalist-header preference.
- Exact automation heading: **Welcoming our Robot Overlords**.
- Calendar 2026, `America/New_York`, fixed cutoff **2026-10-27T17:28:51.121Z**, end exclusive for this expansion.
- Book-equivalents use **added** lines / **40** lines per printed page / **1,424** pages. Never use net lines or imply prose equivalence.
- Existing reviewed core figures remain 935 dependency fixes, 67 production deployments, and 515 work items; derive the 209-bug and August-27 stories from their breakdowns, not hardcoded copy.
- Full PR/file pagination, explicit path exclusions, typed Bot authors, and honest unknowns. No silent filtered/unfiltered fallback or partial-data approval.
- Retain local candidate/report/receipt review and the visible accessible-source caveat. New real data requires user review before replacing the current approved snapshot.
- Static root and project-subpath hosting remain supported; no backend, source credentials in browser/CI, external font requests, autoplay, or public publication.
- Reviews, languages, new streak/week collection, time/money savings, social-card generation, and audio are deferred.

## Review Focus

1. A v1 receipt must never authorize v2 fields, while the current v1 snapshot must continue to load and remain restorable (Tasks 1 and 4).
2. Large/truncated file lists, GraphQL partial errors, or changing counters must block code totals rather than produce a plausible partial book comparison (Task 2).
3. Null/deleted or unrecognized PR authors must not silently become humans; zero merged PRs must not produce an invented bot percentage (Task 1).
4. A book total below one, zero, or unavailable must produce honest copy and not a misleading stack of whole books (Task 3).
5. Methodology strings, filenames, actor names, and PR metadata must not escape into public JSON, HTML, assets, or error messages (Tasks 1 and 4).

---

## Files and stable interfaces

### Public contract — Task 1 owns changes

- `src/data/schema.ts`: preserve named `PublicSnapshotV1Schema`/`PublicSnapshotV1`, add strict v2, export `PublicSnapshotSchema` and `PublicSnapshot` as the supported union. Existing core `metrics` shape stays unchanged.
- `src/data/playful.ts`: strict scalar/extension schemas, comparison constants and arithmetic.
- `scripts/recap/policy.ts`: validate curated v1/v2 data and versioned private review reports; preserve old receipt hash checks.
- `scripts/recap/code-policy.ts`: versioned path-exclusion rules.
- `scripts/recap/pull-request-model.ts`: private normalized types.
- `scripts/recap/pull-request-metrics.ts`: pure counting/filtering, no network or presentation.

`PublicSnapshotV2` is the same core data as v1, with `schemaVersion: 2` and a required strict `playful` object:

```ts
type ScalarMetric = { status: 'available' | 'unavailable'; count: number | null };
type PlayfulMetrics = {
  methodologyVersion: 'known-generated-v1';
  mergedPullRequests: ScalarMetric;
  linesAdded: ScalarMetric;
  linesRemoved: ScalarMetric;
  botAuthoredPullRequests: ScalarMetric;
  unknownAuthorPullRequests: number;
};
```

Available counts are nonnegative safe integers; unavailable counts are null. Added/removed availability is paired. Known bot count and unknown author count cannot exceed merged PR count. Exact bot metric approval requires no unknown authors. No raw fields or arbitrary extra strings are allowed. Public copy and explanation strings are curated in components, not copied from GitHub.

Private `MergedPullRequestRecord` contains `{repositoryId: string, number: number, mergedAt: string, authorType: string|null, reportedAdditions: number, reportedDeletions: number, changedFiles: number, filesComplete: boolean, files: {path: string, additions: number, deletions: number}[]}`. Identity is repository ID + PR number; source author names/logins and patches are unnecessary.

Task 1 produces:
- `countPullRequestActivity(records: MergedPullRequestRecord[], period: Period): PlayfulMetrics`.
- `isExcludedCodePath(path: string): boolean` and `CODE_POLICY_VERSION`.
- `bookEquivalents(addedLines: number): number` (unrounded quantity), `botShare(botCount: number, mergedCount: number): number|null` (fraction; null if denominator zero), and constants `LINES_PER_PAGE=40`, `BOOK_PAGES=1424`.

Private `ReviewReportSchema` supports existing v1 reports and v2 reports. A v2 report retains the three core coverage entries and adds `playfulCoverage: CoverageReport`, binding the exact candidate bytes. A v1 report cannot validate a v2 candidate. The existing receipt format may remain unchanged because its hashes bind the versioned candidate/report/approved bytes. `publicCoverage(metrics, playfulCoverage?)` includes new-source coverage when supplied; only the existing narrowly defined independent-inventory uncertainty is waivable.

### Source and presentation modules

- Task 2: `scripts/recap/github-prs.ts`, `tests/recap/pull-request-sources.test.ts`.
- Task 3 (designer): existing page/layout/styles/components plus `src/components/ScaleMoment.astro`, `BookScale.astro`, `RobotOverlords.astro`; `src/data/demo.json`; browser fixture/config/tests as needed.
- Task 4: `scripts/recap/collect-playful.ts`, focused integration tests, package command, parent-owned README changes and real-data review.

## Task 1: Versioned contract, inclusion policy, and pure metrics

**Files:** Public/private contract and reducer files above; modify `scripts/recap/policy.ts`; tests `tests/recap/playful-schema.test.ts`, `code-policy.test.ts`, `pull-request-metrics.test.ts`, and impacted approval fixtures. Do not edit the page, collector, current approved JSON, or private review inputs.

**Consumes:** Existing `Period`, `CoverageReport`, date helpers, and core snapshot schema. **Produces:** All stable interfaces above; backward-compatible loader/approval semantics for Task 3 and Task 4.

- [ ] Write failing tests with these literal assertions, using synthetic fixture helpers:
  ```ts
  expect(bookEquivalents(56_960)).toBe(1);
  expect(bookEquivalents(28_480)).toBe(0.5);
  expect(bookEquivalents(0)).toBe(0);
  expect(botShare(1, 4)).toBe(0.25);
  expect(botShare(0, 0)).toBeNull();
  expect(isExcludedCodePath('web/package-lock.json')).toBe(true);
  expect(isExcludedCodePath('web/src/main.ts')).toBe(false);
  expect(PublicSnapshotSchema.safeParse(withPrivateExtraField(v2Fixture())).success).toBe(false);
  ```
- [ ] Add failing cases for v1 loading unchanged, v2 candidate rejected with a v1 report/receipt pair, receipt tampering, negative/fractional/nonfinite counts, unknown authors (not humans), bot count exceeding total, unavailable-not-zero, duplicate PR identity across pages/repos, and exact Eastern start/cutoff boundaries.
- [ ] Define `known-generated-v1`: match directory segments case-insensitively `node_modules`, `vendor`, `dist`, `build`, `coverage`, `generated`, `__generated__`; basename lockfiles `package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lock`, `bun.lockb`, `cargo.lock`, `poetry.lock`, `uv.lock`, `pipfile.lock`, `composer.lock`, `gemfile.lock`, `go.sum`, `packages.lock.json`, `.terraform.lock.hcl`; suffixes `.min.js`, `.min.css`, `.map`, `.g.cs`, `.g.i.cs`. Normalize GitHub's relative POSIX paths without substring matching (e.g. `src/builder.ts` remains included). Tests pin nested, case-varied, excluded, and similarly named included paths.
- [ ] Run only the focused new/impacted tests and confirm RED before feature bodies. Implement minimal schemas, policy, and reducers. Count all in-window merged PRs; filtered line totals include human and bot PRs and ordinary docs/tests/config files. If any intended file set is incomplete, code counts become unavailable, never mixed with unfiltered totals. Unknown actor types make exact bot count/share unavailable; preserve `unknownAuthorPullRequests` for review (a count of PRs, not unique people). Do not change old core reducers.
- [ ] Run focused GREEN plus `npx tsc --noEmit`. Ensure old v1 approval fixtures still pass without source credentials. Commit explicit task files; never force-add ignored reports/private data.

## Task 2: Complete merged-PR and file collection

**Files:** Create `scripts/recap/github-prs.ts`, `tests/recap/pull-request-sources.test.ts`, synthetic fixtures only. Task 1 private model/policy files are read-only to this lane.

**Interfaces:** Export `collectMergedPullRequests(config: CollectorConfig, period: Period, options?: {transport?: GithubGraphqlTransport; onProgress?: (progress: PullRequestProgress) => void}): Promise<CollectionResult<MergedPullRequestRecord>>`. Define `GithubGraphqlTransport` and `PullRequestProgress` locally and export them. Transport accepts fixed read-only query text plus structured variables and returns unknown JSON. Progress reports phase, repositories completed, PRs completed, file pages completed, and last update time—no source names for user-facing status.

- [ ] Write failing fixtures for multi-page repository, merged-PR, and per-PR file connections; repeated/missing cursors; nonempty GraphQL `errors` even with partial data; rate-limit/transient exhaustion; null/malformed counters; foreign owner scope; cap/changed-file mismatch; repeated paths; changing reported counters across continuation pages; and a permission failure. All must produce explicit incomplete coverage, not available zero.
- [ ] Write a fixture with an old-created but in-period merged PR, a PR updated after cutoff but merged before it, and out-of-period merges. Filter by `mergedAt`. Never stop by creation time or assume a capped Search result is complete. Any safe early stop by sorted update time must be proved with tests; otherwise fully paginate.
- [ ] Run focused RED. Implement using local authenticated `gh api graphql` with structured arguments/input, sanitized errors, bounded retries, and metadata-only queries. Reuse the validated organization scope; enumerate all accessible repositories including archived ones. Do not loosen the existing REST transport to accept arbitrary writes. No PR titles, bodies, patches, comments, or actor names are needed.
- [ ] Fetch all intended file pages and compare unique returned file count to `changedFiles`; use per-file additions/deletions and check reported raw totals where source semantics permit. A 3,000-file endpoint cap or any unexplained truncation is a coverage error. Explicitly classify `Bot` versus `User`; null/other actors are mapping issues, not humans. Only independent inventory uncertainty may use the existing inventory caveat; failed reads remain blockers.
- [ ] Run focused GREEN and typecheck. Record source-pagination proof and progress privately during real collection later; no full-year live crawl yet. Commit explicit source/test files. Validation owner: source specialist.

## Task 3: Delightful scale presentation

**Owner:** Designer. **Files:** Existing `src/pages/index.astro`, layout/styles, needed comparison components, demo JSON, `playwright.config.ts`, and `tests/browser/recap.spec.ts`. No source collector, contract/policy, package dependencies, or approval changes.

**Consumes:** Task 1 public v1/v2 union, `PlayfulMetrics`, and comparison helpers. Use existing `loadBuildSnapshot` frontmatter call and wrapper environment convention. v1 remains readable: omit unavailable new comparisons and keep its recorded stories; don't invent a book count.

- [ ] Add failing browser scenarios before implementing: v2 sample with 56,960 added lines displays about one book, 28,480 displays about half, zero is honest, and unavailable code never produces a book claim. Bot 1-of-4 shows 25%; zero denominator shows no invented percentage. The exact robot heading, actual underlying totals, and small printing assumptions remain readable. Update old copy/layout assertions without weakening privacy or coverage tests.
- [ ] Implement the selected comparison-first vertical scroll with a minimalist light header, RWJF palette, jump links, distinct code-added/deleted moments, robot chapter, and playful existing security/delivery/bugs/work stories. Derive counts and peak-month/tie wording from data. No individual judgments or unmeasured savings/AI claims. Designer owns all layout/illustration/motion decisions.
- [ ] Use self-contained HTML/CSS and inline decorative markup, not external assets or runtime JavaScript. Keep the existing artifact policy intact. All story text/counts work with JS disabled; respect reduced motion, focus, mobile layouts, and screen-reader labels. Keep estimates, cutoff/collection time, and coverage visible without turning them into the main story.
- [ ] Use explicit v2 demo fixtures only, retaining the canonical demo warning. Update synthetic review-report/browser fixtures for v2 where necessary. Build test previews to temporary output (`RECAP_OUT_DIR`), not the main `dist`, so the currently approved preview stays available until real-data review.
- [ ] Run focused browser checks for root/project bases, 375px/1440px overflow, keyboard navigation, reduced motion/no JS, exact labels, no source URLs/private markers, and all comparison states. Provide screenshots. Commit explicit UI/demo/browser files; parent reviews copy afterward. Do not run full unit suite.

## Task 4: Assemble, review, and render the real expanded snapshot

**Files:** Create `scripts/recap/collect-playful.ts`, `tests/recap/playful-collection.test.ts`; add `collect:playful` package script. Parent writes the README update from current context; implementer supplies exact command/interface details. Existing approval/build commands remain the publication boundary.

**Interfaces:** Export `collectPlayfulSnapshot(options?: {root?: string; collector?: typeof collectMergedPullRequests; collectedAt?: string}): Promise<PublicSnapshotV2>`. `npm run collect:playful` verifies the current approved snapshot with its receipt, derives the same Period/cutoff, and augments its exact three core metrics. It must not require Jira REST credentials or recrawl/reinterpret the already reviewed MCP data.

- [ ] Write failing integration fixtures: core values/coverage survive unchanged; new private metadata never reaches public JSON; incomplete files/unknown authors/GraphQL errors cannot approve; v2 data cannot inherit v1 approval; user has not reviewed until explicit approve. Validate all public relationship/formula constraints rather than trusting supplied derived numbers.
- [ ] Write a rollback fixture: before changing candidate/report, save the existing approved/candidate/report/receipt files together under an ignored timestamp/hash-named backup. A collection failure must not overwrite approved JSON. Pending new candidate may invalidate the old build receipt as in the existing workflow, but the prior proof bundle is restorable and the existing served static `dist` is untouched.
- [ ] Run focused RED. Implement augmentation, versioned review report with new coverage and candidate hash, generic public caveat, atomic writes, safe nonzero failures, and private normalized source/progress evidence. Do not fabricate unavailable metrics or automatically approve. Document how to restore the complete backup if the user declines. The approval command is still `npm run approve -- --confirm-reviewed --acknowledge-accessible-scope` when that caveat applies.
- [ ] Run focused GREEN and typecheck. Then perform full read-only PR/file collection at the fixed approved cutoff, reporting progress truthfully and final status after background completion (not leaving “still running” after a finished blocked job). Independently recompute added/deleted lines, bot numerator/denominator, and book arithmetic from private records. If filtered coverage is blocked, bring the user the explicit alternative described in the spec before any approval.
- [ ] Parent shows the new actual totals, exclusions, approximate book conversion, bot classification coverage, and existing source caveat to the user. **Wait for approval** before promoting or rebuilding the main real preview. No push/publication is implied.
- [ ] After approval, use the normal receipt gate and real build. Parent runs one integrated validation pass after all writers reconcile: `npm test`, `npm run check`, approved `npm run build`, `npm run check:dist`, and applicable browser scenarios. Verify the served local real snapshot, not only fixture builds. Record limitations honestly; no cold-CI or organization-wide completeness claims.
- [ ] Commit only explicit code/docs and approved aggregate data. Leave raw records, source paths, actor information, candidate/reports/receipts, and screenshots ignored. No publication or remote mutations.

## Scheduling and review ownership

Task 1 establishes the contract and is reviewed before dependents start. Tasks 2 (source/reducer integration) and 3 (designer UI) can run in parallel **only with the disjoint scopes above**; no shared writers to schemas, policy, package/config, or demo fixtures. Task 4 follows both. Source specialist owns focused source/aggregation evidence; designer owns focused visual/browser evidence; parent owns copy review, independent real-data arithmetic, reconciliation, and one full integrated test pass. Reuse unaffected v1 evidence rather than repeating every old check per edit.

Preserve the user's previously chosen specialist-led execution method. Use an isolated feature branch/workspace decision at execution time; do not implement on behalf of this plan before the user reviews it. Routine exact module internals remain builder-owned; no optional metrics or new framework should be added.

## Self-review

- [x] Approved spec mapped to contract/math (1), real sources/coverage (2), chosen playful experience/accessibility (3), and review/rollback/static deployment continuity (4).
- [x] Stable interfaces, exact printing constants, timezone/cutoff, exclusion policy, bot classification, and v1/v2 relationships are explicit.
- [x] All five Review Focus failure modes have owning tests.
- [x] UI and source lanes have disjoint write scopes after Task 1; full-suite validation has one owner.
- [x] Deferred metrics remain out; real new totals are not invented or preapproved.
