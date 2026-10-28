# Source and Pages Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a clean source `main` and automatically build/deploy the reviewed static snapshot through native GitHub Pages Actions.

**Architecture:** A local export validates private review proof and creates a public hash-bound snapshot manifest. An explicit portable build mode consumes only the checked-in snapshot/manifest; local private review remains unchanged. A least-privilege workflow builds checked-in source and deploys a Pages artifact. Operational migration publishes a fresh source root without internal-note ancestry, preserves existing branches, and switches only this repository's Pages/default/environment settings.

**Tech Stack:** Existing Astro/TypeScript/Zod/tsx/Vitest, Node 24 LTS on hosted Ubuntu, official SHA-pinned Pages Actions, existing GitHub CLI/SSH. Add only direct dev dependency `yaml@2.9.1` (already installed transitively) for semantic workflow tests.

**Spec:** `docs/superpowers/specs/2026-10-27-source-actions-design.md`

## Global Constraints

- Exact target: `rwjf/investments-apps-year-in-review`; preserve `https://rwjf.github.io/investments-apps-year-in-review/`.
- Build/deploy only: no Jira/GitHub data collection, PAT, collection credential, private approval file, or schedule in CI.
- Clean `main` is a fresh audited source-tree baseline; keep existing public branches/history unchanged. No force push, branch deletion, or history rewrite.
- Include app/collector code, tests, lockfile, approved aggregates, public manifest, workflow, blank `.env.example`, root config, and maintainer docs. Exclude private/scratch/generated files and internal planning/research notes.
- Normal private build/review/export gates remain; neither `CI=true` nor inherited demo/published mode may bypass private approval/export or deploy demo data.
- Build job read-only, checkout credentials not persisted; deploy job Pages/OIDC scopes only. Do not broaden repository-wide defaults, branch protections, global credentials, or organization policy.
- Project base `/investments-apps-year-in-review/`, current real data, estimates, coverage caveat, UI, and static HTML/CSS guards stay unchanged.
- First hosted deployment and anonymous public verification are required; local build or queued workflow is not migration success.

## Review Focus

1. A clean checkout must build real approved content without private files, while private review/export still refuses missing proof (Task 1).
2. Tampering, demo input, unsupported/extra fields, stale hashes, or missing coverage acknowledgment must not pass the public gate (Task 1).
3. Astro prerender's bundled loader must receive explicit root/input mode; inherited flags must not select the wrong trust path (Task 1).
4. PR/non-main runs must never deploy; the write-enabled deploy job must not run checked-out app/npm code (Task 2).
5. Clean source publication and repository migration must not publish scratch ancestry, bypass protections, break the URL, or silently leave the old publisher active (Tasks 2–3).

---

## Files and interfaces

- `scripts/recap/published-input.ts`: strict manifest, public snapshot validation/loading, no private proof reads.
- `scripts/recap/export-approved.ts`: explicit local-only export after private gate validation.
- `scripts/recap/build-input.ts`: explicit private/demo/published wrapper and bundled-loader mode propagation.
- `scripts/recap/policy.ts`: reuse/factor publishable public-data checks without weakening private source/coverage validation.
- `scripts/recap/collect-playful.ts`: force private input mode for its base/backup verification.
- `.gitattributes`: LF for approved snapshot and public manifest.
- `.github/workflows/pages.yml`: final push-main/manual workflow, optionally PR checks without deployment.
- `scripts/publish.ts`: clear refusal of obsolete branch publishing in an Actions-enabled checkout; retain legacy helper compatibility for isolated old fixtures/rollback context.
- `tests/recap/published-input.test.ts`, `pages-workflow.test.ts`, plus impacted loader/approval/publisher fixtures.
- Parent-owned `README.md`: public maintainer instructions with no links to excluded internal plans.

Public `src/data/approved.manifest.json` has exactly:

```ts
type PublishedApproval = {
  schemaVersion: 1;
  snapshotSchemaVersion: 1 | 2;
  snapshotSha256: string; // lowercase 64-hex digest of approved.json UTF-8 bytes
  approvedAt: string; // copied from validated private review receipt, not CI time
  coverageScope: 'verified-organization' | 'accessible-repositories';
  acknowledgeAccessibleScope: boolean;
};
```

Task 1 exports `PublishedApprovalSchema`, `loadPublishedSnapshot({root: string}): Promise<PublicSnapshot>`, and `exportApprovedManifest({root?: string}): Promise<PublishedApproval>`. Commands: `npm run export:approved` and `npm run build:published` (wrapper `--published`). Existing normal `build` and explicit `build:demo` retain their meaning.

`loadBuildSnapshot` gains optional `inputMode: 'private'|'published'`; wrapper preflight forces its chosen mode/root and overwrites child environment `RECAP_BUILD_INPUT`, `RECAP_BUILD_ROOT`, and demo flag. Default page frontmatter can select wrapper-provided published mode, while collection/export callers explicitly request private mode. Modes are mutually exclusive; no fallback to another mode on failure.

## Task 1: Public approval export and clean-checkout build

**Files:** New published/export modules; modify loader/policy/collector, package scripts, `.gitattributes`; new published-input tests and impacted old CLI fixture dependency copies. Do not alter source data, UI, private proof files, or GitHub settings.

**Consumes:** Existing strict curated v1/v2 snapshots, receipt hashes, private review validation, atomic writes. **Produces:** Interfaces above, backward-compatible private behavior, portable real build.

- [ ] Write failing tests for valid local export, no private metadata fields in manifest, absent/invalid proof refusal, exact byte hash/schema/scope/ack matching, tampered bytes, extra manifest fields, demo refusal, unavailable metrics/unknown authors, and exported approval date preservation. Assert clean checkout (no `.recap-private`) succeeds only in explicit published mode; normal private mode still refuses.
- [ ] Add failing wrapper integration tests for inherited `CI=true`/demo/published flags, conflicting CLI modes, unrelated cwd/path spaces, and a real one-page Astro prerender consumer in published mode. Update old copied CLI fixtures to include new module dependencies; keep frozen-v1 tests genuinely v1.
- [ ] Run focused tests and observe assertion RED before feature bodies. Implement the strict loader/export/mode routing; factor shared public readiness checks rather than duplicate/private-validator bypasses. Local export must validate the private bundle and bind the actual reviewed bytes; refuse intervening changes before writing manifest. Never copy candidate/coverage hashes, report content, source identities, or secrets into it.
- [ ] Add LF rules for the two public JSON files. Wire `export:approved` and `build:published`. Force private mode at collector base/backup and export entry points; CI never runs export/approve. Preserve generic error handling and correct Astro root propagation.
- [ ] Run focused GREEN (new tests + impacted old approval/collection fixtures), typecheck, and whitespace checks. Parent inspects artifacts before task review. Commit only scoped code/config/tests; actual export of the existing approved manifest occurs after review.

## Task 2: Least-privilege workflow and current maintainer flow

**Files:** `.github/workflows/pages.yml`, `tests/recap/pages-workflow.test.ts`, `scripts/publish.ts`, impacted publisher tests, dev dependency metadata. README prose is parent-owned.

**Consumes:** Task 1 command/interface contract and unchanged production artifact guard. **Produces:** Reviewed final workflow and a safe replacement for the old manual-push update instructions.

- [ ] Declare pinned dev `yaml@2.9.1` for workflow parsing; no runtime dependency. Write semantic YAML tests proving trigger refs, production deploy condition, credentials-off checkout, Node 24, public build command, guard-before-upload ordering, upload path exactly `dist`, separate permissions/environment, no collection/approval/export commands or custom secrets, and no active-deploy cancellation.
- [ ] Write a publisher regression: an Actions-enabled checkout refuses obsolete branch publication before reading origin/deleting/building/pushing. Existing isolated legacy fixtures without the workflow keep their tested behavior. Run focused RED.
- [ ] Implement final workflow: `push` on `main`, `workflow_dispatch`, optionally `pull_request` checks to `main`. PR/non-main runs never upload a production artifact or deploy. The **initial branch-creation push** also checks/builds without deploying; production upload/deploy requires `github.ref == 'refs/heads/main'` and either manual dispatch or a push with explicit JSON boolean false: `toJSON(github.event.created) == 'false'`. This avoids GitHub's loose equality treating missing/empty/null metadata as false. This permanent bootstrap guard avoids temporary workflow variants or lying workflow-contract tests. Use read-only build (`contents: read`), checkout `persist-credentials: false`, Node 24, `npm ci`, `npm test`, `npm run check`, `RECAP_BASE_PATH=/investments-apps-year-in-review/ npm run build:published`, `npm run check:dist`, and Pages artifact upload of `dist/` only. Tests cover new-branch, normal push, PR, non-main, manual, and malformed/missing creation metadata cases using relevant documented Actions semantics, not unmodified JavaScript equality.
- [ ] Deploy job needs build, production ref/event condition, `github-pages` environment and output URL, `pages: write` / `id-token: write`; no checkout/npm execution. Keep repository token defaults unchanged. Use separate PR concurrency groups and a production Pages group with `cancel-in-progress: false` so PR checks do not cancel production.
- [ ] Pin official actions: checkout `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7), setup-node `949feb2413d6458794dcd2491c4babbbce0c15c1` (v7), upload-pages-artifact `fc324d3547104276b827a68afc52ff2a11cc49c9` (v5), deploy-pages `368f82528645a54fb793d4d04e342629a3f51346` (v5). No configure-pages action is needed for the fixed known path. Reconfirm pins/runtimes before rollout if remote facts changed; don't substitute unverified tags.
- [ ] Run focused YAML/publisher GREEN, typecheck, and dependency audit for the declared dev tool. Parent writes README covering clean-clone public build, code push/manual deploy, local data approval/export, source metadata/public privacy boundary, no private-file uploads, and legacy rollback. Remove references to internal plans from the public README. Commit scoped files; no source push/settings migration yet.

## Task 3: Verify clean baseline and perform reversible migration

**Scope:** Parent/coordinated operational specialist; no UI or statistics changes. Reuse scoped test evidence; parent owns one full integrated run and independent hosted verification.

**Release allowlist:** Root `.gitignore`, `.gitattributes`, blank `.env.example`, `README.md`, `package.json`, `package-lock.json`, `astro.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `recap.config.json`; tracked `src/**`, `scripts/**`, `tests/**`; `.github/workflows/pages.yml`; only separately reviewed public maintainer docs if any. Exclude all internal `docs/superpowers/**`, `docs/research/**`, ignored/private/dot-environment files, generated assets/caches/dependencies/reports/screenshots. Include the approved manifest; never include private proof in the clean export.

- [ ] After code reviews, run local `export:approved` against the real existing private proof. Verify current approved JSON, core/line/Bot/coffee values and source config remain byte-identical; inspect strict public manifest. Test a tracked-file-only clean export with **no** private files/credentials: `npm ci`, explicit published real build, and production dist guard. Do not mutate/restore private proof just to make that test work.
- [ ] Parent runs one combined full unit/type validation after writers reconcile; existing UI unchanged, so reuse its prior browser matrix and perform a focused real published-build no-JS/root/subpath smoke. Record no new data collection.
- [ ] Re-read exact repository branches/protection/Pages/environment settings; save private rollback evidence. Stop for legitimate owner/PR requirements if protection blocks setup; no bypass/global policy/credential changes. If `main` already exists unexpectedly, do not overwrite it.
- [ ] Prepare an isolated fresh Git root/tree using the explicit allowlist. Inspect staged names/content and compare included bytes with reviewed source; confirm no old commit ancestry. Keep source development branches/local proof recoverable. Preserve internal notes privately before any final local checkout switch.
- [ ] **Safe bootstrap:** publish initial clean `main` with the exact final reviewed workflow. Its branch-creation guard runs hosted checks/build and skips production upload/deploy; require that build to pass before switching settings. Set repository default to `main`, add `main` to `github-pages` environment policy while retaining `gh-pages`, and use **PUT** Pages with `{build_type: workflow}` only, preserving URL/HTTPS/domain. No branch protection or organization policy changes.
- [ ] Dispatch/watch the manual run on `main`; require successful hosted checks/build/guard/deploy and anonymous public verification. Then push a normal second source commit (an explicit empty `ci: verify push-triggered Pages deployment` commit is acceptable so reviewed tree bytes stay exact), following required PR flow if applicable. Watch the actual automatic run too; verify its ref/SHA/event and public result. Don't declare automation ready based only on the manual run.
- [ ] If the initial migration cannot become healthy, restore saved legacy Pages mode/source (`gh-pages` / root), prior default/environment policy as appropriate, and verify the live prior artifact. Preserve new branches and report the blocker; do not erase already-published history or force push.
- [ ] Compare the final clean source tree to the reviewed allowlist (final workflow bytes now exact), verify source/manifest/privacy exclusions, default main, native Pages mode, required environment policy, and unchanged site URL/content/coverage. Download/inspect the hosted artifact and compare its public file bytes/semantics to live output. No private inputs should be on runner/host/release branch.
- [ ] After success, make clean `main` the normal local tracking checkout without losing ignored private files or old development branches; restore root local preview if the project-base build altered it. Parent documents actual source/deploy URLs and future update commands. All source publication/settings changes stay within the user-approved exact target; no branch deletion or unrelated cleanup.

## Execution ownership and self-review

Task 1 is the trust-boundary foundation; Task 2 consumes its stable commands and follows its review. Task 3 performs source publication/settings only after both code gates. A separate read-only migration preflight can run alongside code work, but no early mutations. Specialists run focused checks; parent reconciles and runs the full suite once, then verifies actual hosted runs/public output. Continue the user's specialist-led method.

- [x] Spec mapped to public gate (1), native workflow/operator flow (2), and clean baseline/reversible hosted migration (3).
- [x] Public/private trust distinction, exact pins, permissions, source allowlist, and safe bootstrap ordering are explicit.
- [x] All five Review Focus classes have tests or operational evidence owners.
- [x] Existing site/data/UI preserved; no raw-data export, history rewrite, token escalation, or automatic collection introduced.

Plan pending user confirmation; implementation/migration has not started.
