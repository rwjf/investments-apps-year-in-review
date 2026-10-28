# Investments Apps Team Year in Review

A static, public-friendly recap of the Investments Applications team's 2026 work. The website contains reviewed aggregate counts—not source records, people, repository names, or issue details.

**Current status:** the comparison-led Delightful scale site is live at **https://rwjf.github.io/investments-apps-year-in-review/**, using the reviewed real 2026 snapshot with its visible limited-coverage caveat. Complete organization-wide visibility has not been independently established. The separate bundled demo remains illustrative.

## Build and preview from a clean checkout

Requires Node.js **22.23.4 or newer** and npm; Node 24 LTS is used by Actions.

```sh
npm ci
npm run build:published
npm run preview -- --host 127.0.0.1
```

Open the address printed by Astro. The portable build reads the checked-in approved aggregate snapshot and its public approval manifest; no Jira/GitHub collection credentials or private review files are needed. The site works without browser JavaScript and makes no live Jira/GitHub requests.

For explicitly illustrative sample data instead, use `npm run build:demo`. Demo data cannot pass the production deployment guard. The normal `npm run build` remains the stricter local build requiring your private approval proof; it does not silently fall back to portable or demo input.

Use the wrapped build commands below rather than calling `astro build` directly. They validate the input and pass the correct build context to Astro.

## What is counted

| Measure | Definition |
|---|---|
| Dependency alerts fixed | Unique Dependabot alerts currently marked fixed, with their fix timestamp in the reporting period. Dismissals are excluded. This does not claim coverage of all security tools or count unique vulnerabilities. |
| Successful production deployments | Unique GitHub deployment records targeting `Prod` or `Production` (case-insensitive, trimmed), whose first successful status is in the reporting period. A later inactive status does not erase the deployment. Workflow runs and merged PRs are not deployments. |
| Work items closed | Unique Jira issues currently in the Done status category with a resolution date in the reporting period, excluding configured epic and canceled/duplicate resolution IDs. Subtasks are included unless explicitly excluded. |
| Merged pull requests | Unique repository/PR pairs merged within the same reporting interval, regardless of creation date. |
| Lines added / removed | File-level line changes in those merged PRs after the versioned known-generated path filter. Includes bot changes, docs, tests, and config; repeated edits can contribute repeatedly. Not net growth or unique human-written code. |
| Bot-authored PRs | Merged PRs authored by actors GitHub explicitly classifies as Bot. Unknown/deleted authors are not silently treated as human. This is not a measure of AI usage or all automation. |

Source scope is the `rwjf` GitHub organization and Jira projects `INSUP` and `RWJFINVEST`. Those identifiers are collector configuration/source metadata, not content rendered on the public recap page.

Reporting uses the **2026 calendar year in America/New_York**, capped at collection time. The cutoff is exclusive. Until the year ends, the page says **2026 so far**. Refreshing later may change counts for reopened issues or alerts; this is a reviewed snapshot, not an immutable event ledger.

### The book comparison

The Delightful scale presentation divides filtered **added lines** by **40 lines per printed page** and **1,424 pages per book**, using the Constance Garnett / Modern Library edition of *War and Peace* as a reference. Forty lines per page is our illustrative printing assumption. The result is a playful estimate—not prose, current repository size, productivity, or code quality. Removed lines are shown separately rather than subtracted from the book quantity.

The `known-generated-v1` policy is defined in `scripts/recap/code-policy.ts`. It excludes recognizable lockfiles, vendor/dependency directories, generated/minified output, and build artifacts by path. It does not claim to recognize every generated file. All intended file pages and their raw totals must reconcile before filtering; truncated/capped reads block approval rather than inflating a partial comparison.

### The estimated coffee comparison

The coffee card is explicitly an **estimate**, not measured intake or a Jira/GitHub metric. It assumes four developers averaging 150 mg of caffeine each per calendar day, a 150 mg / 250 ml coffee, and a 200-litre bathtub. It counts calendar dates in the approved snapshot interval and reporting timezone, including a partial final day but excluding an exact next-day midnight; it never uses the current machine date. The current 300-day snapshot produces 180 g of caffeine-equivalent, 300 litres of coffee-equivalent, or 1.5 reference bathtubs. Assumptions are centralized in `src/data/caffeine.ts`; approved source data and receipts remain unchanged.

## Add or refresh the playful metrics

Start with a valid approved core snapshot and its local proof files. Then:

```sh
npm run collect:playful
```

This verifies the approved input, retains its exact core totals and cutoff, and collects merged-PR/file metadata through the local GitHub CLI. It does **not** require Jira REST credentials or repeat the MCP collection. The new scalar metrics use a version-2 public snapshot and require a fresh review; a version-1 receipt cannot authorize them.

The command saves a complete four-file rollback bundle plus private normalized records, source coverage, and progress under `.recap-private/playful-runs/`. Find the exact paths in `.recap-private/playful-latest.json`. Existing approved JSON and served static output are not replaced by collection. As in the original workflow, changing the pending candidate/report invalidates the old build receipt until approval or restoration.

Review `.recap-private/candidate.json` and `.recap-private/coverage.json`, including line exclusions, bot numerator/denominator, unknown authors, and source coverage. File caps, incomplete pages, unknown authors, and source errors cannot be acknowledged away as inventory uncertainty. Then use the existing explicit approval/build commands below. The new figures and approximate comparison need their own review before replacing the local snapshot; collection never auto-approves or publishes.

If declining a candidate, stop writers and restore **all four** files from the manifest's `backupPath` to the same relative paths at the project root: `src/data/approved.json`, `.recap-private/candidate.json`, `.recap-private/coverage.json`, and `.recap-private/approval.json`. Restore the whole bundle, not only the JSON or receipt, then run `npm run build` to validate it. Do not copy private source evidence into public assets.

After restoring old reviewed data, re-export its public manifest before committing or using the portable build; the public manifest must match the restored approved JSON.

## Collect real data locally

### Quick reference

The full sequence for generating a new reviewed aggregate snapshot, run **locally** (Actions never collects, approves, or exports):

```sh
npm run collect -- --year 2026        # read GitHub (gh CLI) + Jira, write private candidate + coverage
npm run collect:playful               # optional: add merged-PR / lines / bot metrics (needs an approved core snapshot)
# Review .recap-private/candidate.json and .recap-private/coverage.json
npm run approve -- --confirm-reviewed  # promote reviewed data to src/data/approved.json (+ private receipt)
npm run export:approved               # write the public src/data/approved.manifest.json
npm run build:published               # verify the portable build
npm run check:dist                    # confirm no private content leaked into dist/
```

Then commit `src/data/approved.json` and `src/data/approved.manifest.json` together. Credentials are used only by the local `collect`/`collect:playful` steps and never leave your machine. Each step below explains the review gates in full; `--acknowledge-accessible-scope` may be added to `approve` only when the single remaining uncertainty is independent inventory/visibility.

### 1. Configure access

GitHub reads use your existing local GitHub CLI session:

```sh
gh auth status
```

The account must be able to read the intended organization repositories, Dependabot alerts, deployment records, and deployment status history. Being able to see some private repositories does not establish access to the whole organization. Respect your organization's access policies; do not broaden permissions merely to silence a coverage warning.

The current snapshot used the connected Jira MCP session, so it did not require a separate Jira token. To rerun the standalone REST collector, create a local `.env` from `.env.example` and fill in the values **on your machine**, not in chat or source control. That collector uses Jira Cloud REST with your email and API token; the account needs Browse Projects and any relevant issue-security access.

```sh
cp .env.example .env
# Edit .env locally. Quote values as appropriate for your shell.
set -a
source .env
set +a
```

Only source a local file you created and trust. The commands do not automatically load `.env`. Never put Jira credentials in the static host or CI. Tokens, reports, and execution scratch files are ignored by Git.

### 2. Confirm Jira mappings and coverage

Review `recap.config.json`. The included epic exclusions and Done workflow mapping were checked against the connected Jira projects for this snapshot. Recheck them if workflows change, including resolution IDs for canceled/duplicate/not-done work under `jiraExclusions`. Set `confirmed: true` **only after checking the actual workflows**. An unconfirmed mapping intentionally blocks real approval; do not turn it on just to make a build pass.

Full-scope claims also need an independently reviewed private inventory/visibility record. Set `inventoryPath` to a file under `.recap-private/`, for example `.recap-private/inventory.json`. Its shape is:

```json
{
  "repositoryIds": ["actual-reviewed-repository-id"],
  "historicalCoverageConfirmed": true,
  "jiraProjects": ["INSUP", "RWJFINVEST"],
  "jiraVisibilityConfirmed": true
}
```

Populate this from a genuine review, not the synthetic test fixture. It must include the complete intended repository inventory, including relevant archived history, and account for inaccessible/deleted sources. Jira visibility includes issue-level security. If that cannot be established, leave it unconfirmed and use the explicit limited-scope review path below only when every required data read otherwise succeeded.

### 3. Collect and review

```sh
npm run collect -- --year 2026
```

Collection writes:

- `.recap-private/candidate.json`: sanitized aggregate candidate.
- `.recap-private/coverage.json`: private coverage checks and blockers.

Review **both** files locally. Confirm totals, scope, exclusions, cutoff, and whether aggregate security/severity counts are suitable for public release. Collection does not overwrite previously approved data.

Failed, denied, malformed, or partially paginated reads are not zeros. They produce unavailable metrics and block approval. A successful empty endpoint is distinct from a missing permission. Direct Jira live validation and whole-organization parity must be completed with your own access before treating results as complete.

### 4. Explicitly approve

After reviewing complete sources:

```sh
npm run approve -- --confirm-reviewed
```

If the **only** uncertainty is independent inventory/project visibility, and you accept a visible limited-coverage caveat:

```sh
npm run approve -- --confirm-reviewed --acknowledge-accessible-scope
```

That acknowledgment cannot waive source failures, missing mappings, inaccessible repositories, or pagination errors. Approval creates `src/data/approved.json` and a private receipt binding the exact candidate and report. Changing or removing those review inputs invalidates a real build; review and approve again. The receipt is a local safeguard, not an independent audit or cryptographic proof of the underlying counts.

### 5. Export the reviewed public snapshot

After local approval:

```sh
npm run export:approved
```

This verifies the unchanged private review bundle and writes only `src/data/approved.manifest.json`: the approved snapshot hash/version, original approval timestamp, and coverage acknowledgment. It does not collect or approve new data and cannot run successfully from private-proof-free CI. The manifest contains no private report, source identities, or credential values.

Commit the approved JSON and manifest together when updating data. The hash is an integrity/review safeguard—not a signature or independent proof of source completeness. Local data review and repository review remain the authority. Any changed data bytes or stale manifest make the portable build fail rather than self-approve; LF rules keep these JSON files stable across checkouts.

### 6. Build the public artifact

```sh
npm run build
npm run check:dist
npm run preview -- --host 127.0.0.1
```

The normal build refuses demo or unapproved data. Only `dist/` belongs on a public host—never upload the project directory or private review files. Approved aggregate data and page copy are public, so review them accordingly.

The portable equivalent is `npm run build:published`, which verifies the public snapshot/manifest without loading private proof. Neither `CI=true` nor inherited mode flags bypasses local review/export, and Actions never runs collection, approval, or export commands.

The output checker is defense in depth, not a guarantee that arbitrary content is safe to publish. The strict snapshot schema, curated text, and human review remain the primary privacy boundary. Today's guard deliberately permits only the site's HTML/CSS output; adding fonts, images, or JavaScript requires a reviewed policy update.

## GitHub Actions deployment

The source workflow targets `main` in **rwjf/investments-apps-year-in-review** and uses native Pages artifact deployments at the same live URL. Edit the source on a normal branch, review/merge to `main` (or push directly when repository policy permits), and Actions installs dependencies, runs checks, builds the approved public snapshot, validates `dist/`, and deploys that static artifact. PR checks do not deploy. The initial creation of `main` is deliberately build-only for safe setup; normal subsequent pushes deploy.

Code-only changes do not need data recollection or a new manifest. For a reviewed data update:

```sh
# After local collection/review/approval:
npm run export:approved
git add src/data/approved.json src/data/approved.manifest.json
git commit -m "data: update reviewed recap snapshot"
git push origin main
```

Manual rebuild of the currently committed `main`:

```sh
gh workflow run pages.yml --ref main --repo rwjf/investments-apps-year-in-review
```

Build uses read-only repository access; the separate deploy job has scoped Pages/OIDC permissions. No Jira token, organization PAT, private approval secret, or source collection is used by Actions. **Statistics do not refresh automatically.** Keep raw records, populated environment files, private receipts, caches, screenshots, and internal execution notes out of source commits. Collector source/config names and synthetic fixtures are public metadata, not data exports.

The project path is `/investments-apps-year-in-review/`. To reproduce that artifact locally, use `RECAP_BASE_PATH=/investments-apps-year-in-review/ npm run build:published` followed by `npm run check:dist`. Omit the base variable for a root-path local preview. Only `dist/` is uploaded; use ordinary static serving, not an SPA rewrite.

The old `npm run publish` branch publisher is not the normal deployment path and refuses an Actions-enabled checkout rather than falsely reporting a live update. The retained `gh-pages` branch is the prior known-good artifact for an administrator's explicit emergency rollback: restore Pages to legacy branch publishing from `gh-pages` / root and verify the site. Do not delete that branch or alter organization protections as routine setup. No rollback or source-history deletion happens automatically.

## Checks

```sh
npm test
npm run check
npm run build:published
npm run check:dist
# Optional sample-only checks:
npm run build:demo
npm run check:dist -- --allow-demo
npx playwright install chromium
npm run test:browser
```

The `--allow-demo` distribution check is for local sample validation only; the publishing path must not use it. Browser tests build isolated synthetic snapshots, including unavailable, completed-year, limited-scope, and project-subpath scenarios. Fixture/project matrix exclusions are intentional; each applicable scenario must execute.

`PLAYWRIGHT_CHROMIUM_PATH` optionally points to an existing compatible Chromium executable for local checks. A warm local browser cache is not proof of clean CI provisioning. Browser evidence in this project is local unless a separate clean environment has been tested.

## Refreshing the recap

Run local collection, review, approval, and public-manifest export again, then commit the two public snapshot files for Actions. Keep the candidate/report/receipt together locally for reproducibility; none belongs in Git or a workflow secret. This version intentionally supports 2026 only; adapting another year requires updating collection/configuration and canonical month policy together, not just changing the displayed heading.

The reviewed public snapshot and application source are versioned. Raw records and private proof stay local. Source changes can deploy automatically; source-data refresh cannot.
