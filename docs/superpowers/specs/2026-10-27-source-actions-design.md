# Source-controlled site with GitHub Actions — approved design

## Intent and decisions

Store the application source in the existing public repository and automatically rebuild/deploy the static site after source or approved-data changes. The user selected **build/deploy only** and **clean main**. Collection and data review remain local; CI does not refresh Jira/GitHub data or need source-data credentials.

Target remains `rwjf/investments-apps-year-in-review`. Preserve the live URL: `https://rwjf.github.io/investments-apps-year-in-review/`.

## Approaches considered

1. **Clean `main` — selected:** a fresh, audited source-tree baseline containing app/collector code, tests, lockfile, approved aggregates, CI, and maintainer docs, without internal working notes or their ancestry.
2. **Existing development history:** simpler branch creation but carries a historical internal execution report and planning notes. User did not select this approach.

Use native Pages artifact/OIDC deployment rather than a CI bot pushing generated `gh-pages` commits. This keeps the build read-only and avoids legacy branch-trigger/write-permission complications. Keep `gh-pages` as rollback, not the normal update route.

## Public-source boundary

- Include all application source (`src/`), local collection/build/validation tools (`scripts/`), synthetic tests/fixtures, root configuration, lockfile, blank `.env.example`, approved aggregate JSON, public-safe approval manifest, workflow, and reviewed maintainer documentation.
- Source/configuration includes nonsecret organization/project/environment names needed by the collectors. These are source metadata, not credentials. The app itself remains aggregate-only.
- Exclude populated `.env` files, `.recap-private/`, `.superpowers/`, generated outputs/dependencies/screenshots, internal `docs/superpowers/` and research/working notes, private reports, raw records, tokens, and local proof files. Use an explicit release allowlist plus staged-tree inspection, not only `.gitignore`.
- Existing public branches/history are preserved unchanged. A fresh `main` does **not** make the already-public feature-branch history disappear. No deletion, force push, or history rewrite is authorized by this design.
- Keep original local development history and private collection state recoverable. Prepare/export the clean baseline in an isolated release workspace; do not discard existing local work or private proof files.

## CI-safe approved snapshot

Current production builds correctly require a private candidate, coverage report, and receipt. Do not upload those to Git or Actions to make a clean checkout build.

Add an explicit public-snapshot build mode and a small checked-in approval manifest beside `src/data/approved.json`. The manifest contains only an allowlisted format version, approved snapshot SHA-256, snapshot schema version, approval timestamp, and coverage-scope acknowledgement. No source identities, record IDs, raw/private reports, or their contents belong in it.

A local export command validates the existing private approval proof first, then writes the public manifest. It never approves arbitrary JSON or recollects data. Code-only changes reuse the existing exported snapshot; new data requires local collection, review, approval, and re-export before committing both public files.

CI validates the manifest, exact approved file hash, supported strict/curated schema, `mode: real`, required available metrics, unknown-author policy, and declared coverage acknowledgement. Missing/stale/mismatched manifests, demo data, extras, and unavailable unapproved values fail closed. Keep the approved JSON in LF form so checkout line endings do not silently change its hash.

The manifest is a reproducibility/review safeguard—not a signature or independent source audit. Repository review is the authority for source changes; CI cannot independently prove private source completeness. Retain the public limited-coverage note.

Normal local collection/approval/build safeguards remain intact. CI must use an explicit portable build command; setting `CI=true` or inheriting a mode variable must not bypass private review/export or silently select demo data. The build wrapper still passes the correct private process-only root/mode into Astro prerendering; no local path or build variable is rendered.

## Actions workflow

- Run checks/build/deploy on pushes to `main`, plus a manual trigger. Optional PR checks do not deploy.
- Build: Ubuntu hosted runner, Node 24 LTS, `npm ci`, unit/type checks, portable approved-snapshot build with `/investments-apps-year-in-review/` base, production artifact guard, upload `dist/` only.
- Build permissions: `contents: read`; checkout does not persist credentials. No Jira token, organization PAT, private data/receipt secret, data collection step, or schedule.
- Deploy: consumes the Pages artifact, uses `pages: write` and `id-token: write`, targets `github-pages`, and publishes through the native deployment action. No source checkout/npm execution in the write-enabled deploy job.
- Pin official actions to the verified commits in `docs/research/2026-10-27-pages-actions.md`; retain readable version comments. Do not add a framework or broaden token defaults.
- Use Pages concurrency without canceling an active production deployment. Preserve explicit demo-vs-real guards and static HTML/CSS output checks.

## Repository migration and authorization scope

After code/review/clean-checkout validation, migration is limited to this repository:

1. Re-read branches, Pages, environment, and protection settings; save the old deployment/settings as private rollback evidence.
2. Inspect the allowlisted clean source tree and create a fresh `main` baseline without internal-note ancestry. Publish only that reviewed source tree. No populated credentials or raw data are included.
3. Make `main` the default source branch. Respect existing branch protections; if they block setup, report the exact requirement rather than bypassing them.
4. Permit `main` in the repository's existing `github-pages` environment while preserving its prior `gh-pages` policy for rollback. Do not change organization policy or global credentials.
5. Switch this Pages site to `build_type: workflow` using the documented PUT endpoint, preserving URL/HTTPS/domain settings. Run and watch the first Actions deployment.
6. Verify successful build/deploy, anonymous public HTML/CSS, real values/estimates/coverage, no private artifacts, and the same URL. Keep the old deployed branch/artifact available; restore legacy Pages settings if the first migration cannot be made healthy.

Retire the old manual branch publisher from the normal workflow. It must not report a live update merely because it pushed an inactive `gh-pages` branch. Document the new source-push/manual-Actions workflow and the explicit legacy rollback route.

After successful migration, make the clean `main` checkout the normal local source workflow without losing ignored private files or prior development branches. Keep internal planning documentation privately recoverable rather than publishing it in the new baseline.

## Verification

- Unit tests: public manifest export/gate, private-mode preservation, no environment/demo bypass, tampering/unknown fields/coverage, and no private data in emitted metadata.
- Fresh checkout/export with **no** `.recap-private` or credentials must build the real site through the portable command; normal private-review operations must still refuse absent private proof.
- Validate root/project base output, distribution guard, real metadata, existing metrics and estimates, and no-JS/mobile content. Reuse unchanged UI/source-count evidence.
- Audit release-tree inclusions/exclusions and compare included file bytes to reviewed source. No source-history cleanup claims beyond the new baseline.
- A real hosted Actions run and public-page verification establish migration success. Local tests or a queued run alone do not. No additional collection or public data changes are part of this migration.

## Builder discretion

Exact module/command names, manifest representation, test fixtures, and isolated export mechanics; keep them small and reuse existing validators. Preserve current data/behavior and avoid unrelated refactors, secret-scanner infrastructure, or repository-wide policy changes.

Approved by the user on October 27, 2026. Approval authorizes the scoped source publication/default-branch/Pages/environment migration above, not raw-data publication, branch deletion, or organization changes. Implementation still awaits plan confirmation.
