# Team year in review

A static, public-friendly recap of the team's 2026 work. The website contains reviewed aggregate counts—not source records, people, repository names, or issue details.

**Current status:** the demo and fixture-backed implementation have been verified locally. Real Jira credentials and mappings, complete source coverage, and an actual public deployment still need validation. The bundled example is not real team data.

## Preview the example

Requires Node.js **22.23.4 or newer** and npm.

```sh
npm ci
npm run build:demo
npm run preview -- --host 127.0.0.1
```

Open the address printed by Astro. The example is clearly marked **illustrative**; its numbers are not actual team results. No credentials are needed to preview or test it. The site works without browser JavaScript and makes no live Jira/GitHub requests.

Use the wrapped build commands below rather than calling `astro build` directly. They validate the input and pass the correct build context to Astro.

## What is counted

| Measure | Definition |
|---|---|
| Dependency alerts fixed | Unique Dependabot alerts currently marked fixed, with their fix timestamp in the reporting period. Dismissals are excluded. This does not claim coverage of all security tools or count unique vulnerabilities. |
| Successful production deployments | Unique GitHub deployment records targeting `Prod` or `Production` (case-insensitive, trimmed), whose first successful status is in the reporting period. A later inactive status does not erase the deployment. Workflow runs and merged PRs are not deployments. |
| Work items closed | Unique Jira issues currently in the Done status category with a resolution date in the reporting period, excluding configured epic and canceled/duplicate resolution IDs. Subtasks are included unless explicitly excluded. |

Source scope is the `rwjf` GitHub organization and Jira projects `INSUP` and `RWJFINVEST`. Those identifiers are local configuration/documentation only and are not rendered on the public page.

Reporting uses the **2026 calendar year in America/New_York**, capped at collection time. The cutoff is exclusive. Until the year ends, the page says **2026 so far**. Refreshing later may change counts for reopened issues or alerts; this is a reviewed snapshot, not an immutable event ledger.

## Collect real data locally

### 1. Configure access

GitHub reads use your existing local GitHub CLI session:

```sh
gh auth status
```

The account must be able to read the intended organization repositories, Dependabot alerts, deployment records, and deployment status history. Being able to see some private repositories does not establish access to the whole organization. Respect your organization's access policies; do not broaden permissions merely to silence a coverage warning.

For Jira, create a local `.env` from `.env.example` and fill in the values **on your machine**, not in chat or source control. The collector uses Jira Cloud REST with your email and API token; the account needs Browse Projects and any relevant issue-security access.

```sh
cp .env.example .env
# Edit .env locally. Quote values as appropriate for your shell.
set -a
source .env
set +a
```

Only source a local file you created and trust. The commands do not automatically load `.env`. Never put Jira credentials in the static host or CI. Tokens, reports, and execution scratch files are ignored by Git.

### 2. Confirm Jira mappings and coverage

Review `recap.config.json`. Set the observed issue-type IDs for epics and resolution IDs for canceled/duplicate/not-done work under `jiraExclusions`. Set `confirmed: true` **only after checking the actual workflows**. The initial empty, unconfirmed mapping intentionally blocks real approval; do not turn it on just to make a build pass.

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

### 5. Build the public artifact

```sh
npm run build
npm run check:dist
npm run preview -- --host 127.0.0.1
```

The normal build refuses demo or unapproved data. Only `dist/` belongs on a public host—never upload the project directory or private review files. Approved aggregate data and page copy are public, so review them accordingly.

The output checker is defense in depth, not a guarantee that arbitrary content is safe to publish. The strict snapshot schema, curated text, and human review remain the primary privacy boundary. Today's guard deliberately permits only the site's HTML/CSS output; adding fonts, images, or JavaScript requires a reviewed policy update.

## Static deployment

The simplest recipe is GitHub Pages with a local build and a `gh-pages` branch. No source collection runs in CI and no backend is deployed.

For a project site, set the exact repository subpath during build/publication:

```sh
RECAP_BASE_PATH=/your-repository/ npm run build
npm run check:dist
```

For a custom-domain or root site, omit `RECAP_BASE_PATH`. The output is also suitable for another static host; upload the contents of `dist/` and use ordinary static file serving, not an SPA rewrite.

**Publication pushes to your configured Git remote. Do not run it until the target repository and public-release approval are confirmed.** No remote or public site is created by setup or testing.

```sh
RECAP_BASE_PATH=/your-repository/ npm run publish
```

The publishing command requires an existing reviewed `origin` remote. It clears stale `dist/`, rebuilds approved real data, checks the artifact, and publishes only `dist/` with `.nojekyll`. It intentionally refuses alternate `RECAP_OUT_DIR` settings. Configure GitHub Pages to serve the resulting `gh-pages` branch at its root. Publishing requires ordinary GitHub push access, not Jira credentials on the host. A demo can be previewed locally but cannot pass the real publication guard.

## Checks

```sh
npm test
npm run check
npm run build:demo
npm run check:dist -- --allow-demo
npx playwright install chromium
npm run test:browser
```

The `--allow-demo` distribution check is for local sample validation only; the publishing path must not use it. Browser tests build isolated synthetic snapshots, including unavailable, completed-year, limited-scope, and project-subpath scenarios. Fixture/project matrix exclusions are intentional; each applicable scenario must execute.

`PLAYWRIGHT_CHROMIUM_PATH` optionally points to an existing compatible Chromium executable for local checks. A warm local browser cache is not proof of clean CI provisioning. Browser evidence in this project is local unless a separate clean environment has been tested.

## Refreshing the recap

Run collection, review, approval, and build again. Keep the candidate/report/receipt together locally for reproducibility. This first version intentionally supports 2026 only; adapting another year requires updating collection/configuration and canonical month policy together, not just changing the displayed heading.

The implementation design and plan are under `docs/superpowers/`. No real data is bundled by default, and no public deployment is performed automatically.
