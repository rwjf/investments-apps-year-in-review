# Team year in review — design for approval

## Intent

Create a public, aggregate-only recap of the team's 2026 work for the team and its stakeholders. Make the volume of work visible through security fixes, production deployments, and completed work items. Celebrate shared accomplishments, not individual rankings. A count of activity is not a claim of business impact.

## Decisions from the conversation

- Jira scope: INSUP and RWJFINVEST.
- GitHub scope: the entire rwjf organization, not only repositories linked to those Jira projects.
- Reporting period: calendar year 2026.
- Public website: no issue/repository/person/vulnerability specifics or links back to Jira or GitHub.
- Collection: run locally, review a sanitized snapshot, then publish static files.
- Visual direction: guided snapshot with a quick overview and optional deeper story sections.
- RWJF website colors; no formal brand-guide exercise. The latest mockup uses a minimalist light header background, without decorative circles.
- Deployment scope: successful production deployments only; environment names Prod and Production.

## Goals, non-goals, and anti-goals

Goals: credible totals, easy browsing on mobile and desktop, simple annual refresh, easy static deployment, and an explicit reporting cutoff.

Non-goals for the first version: live dashboards, a server/database, sign-in, scheduled collection, a CMS, individual contributor metrics, year-over-year comparisons, AI-written narratives, social-image generation, and a multi-year archive. Keep the snapshot format reusable for a later year.

Anti-goals: private data in a public bundle, inflated counts, unexplained partial coverage, failed requests displayed as zero, or elaborate deployment infrastructure.

## Approaches considered

1. **Local snapshot + static site — selected by the user.** Local credentials access the sources; only reviewed aggregates reach the build. Minimal ongoing infrastructure and a deliberate publication checkpoint.
2. **GitHub Actions collection + static deployment.** Easier repeat automation but introduces CI credentials and access configuration. A later extension, not needed now.
3. **Manually supplied totals.** Simplest integration but less reproducible and more manual work. Not selected; a reviewed override may still rescue a blocked individual metric without disguising it as automated data.

## Proposed implementation choices

These are orchestrator recommendations, not choices the user has explicitly made:

- Astro with TypeScript, static output, one page, minimal browser JavaScript. No server adapter or runtime API calls.
- A separate local TypeScript collector. Use existing authenticated GitHub CLI access for GitHub REST calls, and local Jira credentials for Jira REST calls. The connected tools used during discovery are not a runtime dependency.
- A single approved aggregate JSON file drives the site. Fetching and publication are separate commands; collection never silently replaces the approved input.
- GitHub Pages as the initial hosting recipe, publishing only the static build artifact. The same output works on any ordinary static host. Publishing infrastructure is not part of local data collection; an optional Pages workflow needs no Jira or GitHub source-data credentials.
- Use America/New_York as the reporting timezone, subject to approval. Interpret calendar boundaries consistently in that zone; convert API timestamps before filtering. Show a readable 'through' date and collection timestamp. Before year-end, say '2026 so far', not a completed full-year recap.
- Use the observed RWJF palette: deep blue #042E43, purple #AF45C9, yellow #FFE873, mint #8DF3CE, with light neutral backgrounds. Use permitted local brand fonts if supplied; otherwise use suitable system fallbacks. Do not make production rendering depend on hotlinked proprietary fonts or invent an official logo.

## Experience

Follow the accepted exploration in `.superpowers/brainstorm/59062-1793110140/content/visual-directions-rwjf-minimal.html`, not the original dark-hero mockup.

The opening pairs a short team/year heading and cutoff with three prominent totals. Below, anchor navigation leads to Security, Deployments, and Work Items. Each section gives its headline number, a concise definition, and only supported aggregate breakdowns. Useful initial breakdowns are security severity, deployment month, and Jira work-item type, where coverage permits. Do not add a combined 'total accomplishments' that sums incompatible units.

The site must remain useful without animation. Use semantic headings, visible keyboard focus, readable contrast, responsive layouts, and reduced-motion support. Optional restrained count/reveal animation cannot hide content or delay access. No autoplay, forced slide sequence, source links, tracking, or external runtime dependencies.

All current mockup values are illustrative. No preview values can become published results. Draft/sample mode must be clearly labeled; a real publication uses explicitly approved data.

## Metric definitions and collection

All periods are start-inclusive/end-exclusive: January 1, 2026 to January 1, 2027, capped at the snapshot cutoff. Retrieve all necessary pages; keep filtering and deduplication local. Deduplication identifiers are private collector state and never public JSON fields.

### Work items closed

Proposed definition: unique issues in the two projects that are currently in Jira's Done status category at collection time and have a resolution date within the reporting period. This is a snapshot of resolved work, not a reconstruction of every historical closure event; later reopening may change a refreshed count.

Discover project issue types, resolution values, and workflow conventions before calculating final counts. Proposed default: count completed delivery items, including subtasks, but exclude epics and resolutions representing cancellation, duplication, or work not done. Report issue-type breakdowns so the unit is understandable. Configure exclusions using observed IDs/values rather than guessing names. If completion cannot be distinguished reliably, stop approval of this metric and request a mapping; do not silently infer it. Count each issue once. No story-point or productivity claims.

Live discovery confirmed both projects return matches for a 2026 resolved-date and Done-category query. The connector did not expose resolution dates in its compact mapping despite selected fields; the direct collector must validate actual REST fields before using them.

### Security alerts fixed

Proposed first-version scope: **Dependabot dependency alerts fixed**, labeled exactly that rather than implying all security tooling. Organization-level fixed-alert access and a populated `fixed_at` field were verified with a bounded live sample. Filter by fix timestamp in the reporting period and count unique repository-ID/alert-number pairs. Exclude dismissed alerts; count alerts, not unique CVEs. Treat current fixed state as a snapshot, not immutable historical events.

Aggregate severity may be shown. No dependency/package/advisory names or vulnerability details are public. Fixed code-scanning and resolved secret-scanning probes returned empty lists; those are not proof of complete coverage or zero fixes. Adding those categories is deferred until access, semantics, and data are verified; especially do not equate any resolved secret alert with a remediated exposure.

### Production deployments

Use GitHub deployment records and their status history as the proposed countable source; Jira remains the team's familiar deployment view. Live checks in three recently active repositories found deployment records and statuses. This is evidence of feasibility, not organization-wide completeness. Jira's documented deployment API offers point reads by known deployment keys, but a general enumeration route was not established during discovery.

Match environment names case-insensitively after trimming against Prod and Production. Do not rely solely on `production_environment`: sampled records had it false. Count each repository-ID/deployment-ID once if it has a success status timestamp in the period, using its first success as the completion time. Read status history, not just latest status: a subsequently inactive deployment still counts. Exclude failed/waiting/non-production deployments and never substitute successful workflow runs or merged PRs. A separate redeployment with a new deployment ID is a separate deployment, not a unique release.

Validate the mapping against a small source sample before accepting totals. If some production workflows do not create GitHub deployment records, the total is incomplete: obtain a reviewed source export/override for this metric or show it as unavailable. Do not call a known partial number an organization-wide total.

## Coverage and privacy boundary

- Enumerate accessible organization repositories, including private and archived repositories where history exists. Compare against an authorized organization inventory when available. Without one, explicitly state accessible-repository coverage rather than asserting complete organization coverage.
- Record missing permissions, disabled features, request failures, pagination failures, and inaccessible/deleted repositories in a private local coverage report. An empty successful response differs from an error and does not by itself establish historical completeness.
- Default publication requires complete successful collection for the defined scope. Any unavoidable coverage limitation needs explicit reviewer acknowledgement and a short generic public caveat; no private repository names leak into that caveat. Unknown data is unavailable, not zero.
- Keep tokens in environment variables/keychain, never committed. Ignore `.env`, private reports/caches/exports, and `.superpowers/` before version control is initialized. Do not log raw API responses or secrets.
- Public data uses an allowlisted schema: reporting period/cutoff, metric counts and defined aggregate breakdowns, generic methodology/coverage notes, and approved display copy. No arbitrary source fields, IDs, repository/project identifiers, names, URLs, descriptions, or secret values are passed through. Static HTML, JSON, assets, and source maps all fall inside the review boundary.
- The collector writes a candidate sanitized snapshot and a separate ignored private report. A local validation/approval command promotes only the reviewed, schema-valid snapshot to the website's input. Review aggregate security counts and any small breakdowns for public suitability; aggregation is not automatic declassification.

## Deployment and refresh

Expected flow: configure local access -> collect 2026 candidate -> inspect coverage and totals -> explicitly approve sanitized snapshot -> preview/build -> publish static output.

Document local credential setup without embedding tokens. The public website requires no credentials. Keep source and private collection artifacts out of the hosting artifact. GitHub Pages should support a project subpath; avoid root-only asset URLs and SPA fallback requirements. No host account setup or actual public publication until separately authorized.

## Verification expectations

- Fixture tests for date boundaries/timezone/cutoff, deduplication, pagination, Jira exclusions/reopened items, alert fixed-vs-dismissed semantics, and deployment status history/environment matching.
- Fixtures for permission/rate-limit/empty/partial responses; incomplete results cannot silently be approved as complete.
- Schema/privacy tests reject extra fields and raw source entities; demo values cannot pass as a real approved snapshot.
- Build and inspect output with an approved fixture; verify no source credentials/details, runtime source requests, or private files are included.
- Check static hosting under both root and project subpaths, responsive behavior, keyboard navigation, reduced motion, and the published metric labels.
- Bounded live validation establishes API field mappings and source parity before any real totals are approved. Do not treat samples as full inventory evidence.

## Left to the builder

Exact file/module structure, test runner, small component boundaries, collector pagination/retry implementation, schema library, and minimal animation details. Keep source adapters separate from aggregation and from the public schema. Settle routine implementation choices without expanding scope.

## Evidence references

- Live checks: both Jira projects queryable; private GitHub repositories visible in a five-repository sample; fixed Dependabot sample includes `fixed_at`; three recently active repository samples expose deployment/status APIs. No full-year totals have been calculated or published.
- RWJF observed website CSS: https://www.rwjf.org/etc.clientlibs/rwjf-web/clientlibs/clientlib-site.min.f0c5a73cc6a3efdcd8ede28fd7b1af54.css
- Jira deployment API: https://developer.atlassian.com/cloud/jira/software/rest/api-group-deployments/
- Jira issue search: https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-issue-search/
- GitHub API references: https://docs.github.com/en/rest/dependabot/alerts and https://docs.github.com/en/rest/deployments/deployments and https://docs.github.com/en/rest/deployments/statuses

Approved by the user on October 27, 2026. The directory is not currently a Git repository, so the design has not been committed. No product implementation has begun.
