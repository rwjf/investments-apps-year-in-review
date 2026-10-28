# Delightful scale — playful recap expansion

Status: approved by the user on October 27, 2026 after a builder check found no blocking gaps. This extends the working site; it does not replace the source/privacy architecture. No v2 product implementation has begun.

## Intent

Make the team's year feel surprising, playful, and worth exploring—not like an executive dashboard. The user chose **Delightful scale**, likes a *War and Peace* comparison for code volume, and requested an automation section titled **“Welcoming our Robot Overlords.”** Audience remains the team and its stakeholders, but the tone can be quite playful and need not feel formal.

Retain public, team-wide aggregates only; RWJF colors; a minimalist light header; easy static deployment; and explicit local snapshot review. No people/repository/issue specifics, individual rankings, source links, or productivity scores.

## Approaches considered

1. **Recap mixtape:** a scene-by-scene story with a progress trail. Closest to a Wrapped sequence but more prescribed pacing. Designer recommended it; the user chose otherwise.
2. **Delightful scale — selected:** comparisons and memorable illustrations lead the story, with the underlying counts nearby. More dependent on well-defined data and transparent assumptions, but best matches the user's enthusiasm for book-volume analogies.
3. **Joyful scrapbook:** a loose, colorful scroll of team wins. Flexible and playful, but can get visually busy and is less focused on surprising scale.

The other approaches are not separate feature modes. Develop only the selected experience.

## Experience direction (designer's proposal)

- A comparison-first vertical scroll with a small chapter index/jump links—not forced slides, autoplay, or a new dashboard grid.
- Open with code volume as an illustrated book-equivalent, if measured data is approved. Use adaptive copy for less than one book; never imply several books before the amount is known.
- Give added and deleted code distinct playful moments. Deleted lines are not a failure metric; do not imply smaller/bigger is automatically better.
- Carry the existing security, delivery, and completed-work figures into playful supporting moments. A comparison is optional: don't invent conversions merely to fill a section.
- Include **“Welcoming our Robot Overlords”** as an automation chapter, showing bot-authored merged PRs and their share of all merged PRs.
- Retain exact counts, the reporting cutoff/collection timestamp, short method notes, and the accessible-source caveat. They should support the story without dominating it.
- Use RWJF deep blue `#042E43`, purple `#AF45C9`, yellow `#FFE873`, mint `#8DF3CE`, and light neutral backgrounds. Preserve the user's minimalist-header preference. Do not copy Spotify branding.
- Designer owns illustration, hierarchy, spacing, responsive layout, restrained motion, and final interaction details. Parent reviews copy afterward without changing visuals.

## First expansion: data scope

### Existing reviewed snapshot

Retain its frozen reporting period and cutoff: calendar 2026, `America/New_York`, through **2026-10-27T17:28:51.121Z**, end exclusive. Existing approved figures are 935 dependency alerts fixed, 67 successful production deployments, and 515 completed work items. Already available supporting stories include 209 completed Jira bugs and 27 deployments in August (about 40% of the 67).

Keep those units distinct. Do not sum unlike measures into “total accomplishments.” Labels must not turn dependency alerts into unique vulnerabilities, work items into features, or deployment records into unique releases.

### Merged pull requests

Collect distinct PRs merged within the same reporting interval across the existing accessible GitHub repository scope, including archived history where accessible. Identity is repository ID plus PR number. Filter by merge time, not creation time. Follow all pages; do not rely on an unpartitioned Search result beyond its 1,000-result cap.

Merged PR count is useful both as a story and as the robot-share denominator. Do not call it completed features or unique changes to today's codebase.

### Lines added and deleted

Proposed headline scope: additions/deletions across those merged PRs, excluding a documented set of recognizable lockfiles, vendored dependencies, generated directories, minified output, and build artifacts. Define the maintained exclusion list during planning and keep it versioned. This is path-based filtering, not proof that every generated file has been identified.

Use file-level supplied additions/deletions, not patch-text parsing. Validate that all intended PR files were retrieved; GitHub's PR-files endpoint caps at 3,000 files. Don't silently mix filtered values for some PRs with unfiltered totals for others.

If complete filtered collection is impossible, stop approval of the affected headline and bring back a clearly labeled alternative (such as unfiltered GitHub-reported additions/deletions) for user review. Do not invent a missing count, hide the collection failure, or fall back silently. Existing reviewed chapters remain usable while new metrics are pending.

Added/deleted lines are activity counts across merged changes. They may include bot-authored changes, repeated edits, reversions, and code later removed. They are not unique human-written code, current repository size, or a quality measure. Book-equivalents use **added** lines, not additions minus deletions.

### Welcoming our Robot Overlords

Count distinct merged PRs authored by actors GitHub explicitly classifies as Bot; display their share of the same complete merged-PR set. Do not infer bot status solely from a login suffix or classify unknown/deleted authors as human. Any missing/unclassifiable author is an explicit coverage issue: do not approve an exact bot share until resolved or until the user reviews a clearly labeled lower-bound alternative. Zero bot-authored PRs is a valid result, not a reason to invent robot activity or claim there was no other automation.

This represents bot-authored PR activity—not all automation, AI-authored code, CI runs, or estimated hours saved. No bot names, human names, or repository names are public.

## Book-equivalent calculation

Orchestrator proposal, subject to this design's approval:

**book-equivalents = filtered added lines / 40 lines per printed page / 1,424 pages per book**

- The 1,424-page reference is the Constance Garnett / Modern Library edition of *War and Peace*, confirmed on the publisher's listing.
- Forty code lines per printed page is an illustrative printing assumption, not a publisher fact or a physical measurement of the source.
- Use approximate language and sensible rounding. Keep the actual added-line total available nearby; a small method note states the assumptions.
- Support zero and sub-one-book values honestly. Illustration must not imply a measured quantity beyond the displayed units.
- Cite the publisher internally in research/design docs; no new external public link is required.

Primary source: https://www.penguinrandomhouse.com/books/179305/war-and-peace-by-leo-tolstoy

## Explicitly deferred

Annual language “top genres,” review-event/collaboration metrics, new streak/busiest-week collection, estimated time or money saved, individual comparisons, social-card generation, audio, autoplay, a CMS, new hosting infrastructure, and a multi-year archive. They are possible later, not prerequisites for this expansion. Existing August/bug facts can be reused without new collection.

## Technical and publication constraints

- Build on the existing Astro/TypeScript app, local GitHub access, curated aggregate schema, candidate/report/receipt review, real-vs-demo separation, and static build/publish commands. No backend, source credentials in the browser, or source collection in CI.
- Extend/version the snapshot contract deliberately for new metrics and comparison inputs. Preserve the current approved v1 snapshot as rollback/reference; don't overwrite it with speculative data or assume old receipts approve new fields.
- New public fields are allowlisted aggregate values and curated copy only. Paths, filenames, PR identifiers, actors, raw diffs, tokens, and source URLs remain private. All public text must pass the same review boundary.
- Retain the existing accessible-source caveat unless independent inventory/visibility is established. Source permission failures and incomplete pagination/file coverage cannot be waived as mere inventory uncertainty.
- Prefer self-contained HTML/CSS and local illustrations. Core content works with JavaScript disabled; motion is optional and removed under reduced-motion. Any need to expand the current HTML/CSS-only artifact policy must be explicit and narrowly justified during planning, not silently bypassed.
- Static root and project-subpath hosting must still work. No public push/deployment is authorized by design approval.

## Success and verification

- The page feels comparison-led and playful while keeping real units understandable. The selected mockup is direction, not a mandate to keep explanatory prototype copy.
- Added/deleted line totals, merged PRs, bot share, and book arithmetic can be reproduced from the private source collection and versioned exclusion policy.
- Fixtures prove date/cutoff boundaries, deduplication, file pagination/caps, excluded paths, missing authors, bot classification, zero/sub-one book values, and no filtered/unfiltered mixing.
- Approval tests reject incomplete or unreviewed new metrics and unknown public fields; private data and sample values cannot become real results accidentally.
- Focused browser checks cover responsive story flow, chapter navigation, reduced motion/no-JS access, honest estimates/coverage, exact underlying totals, and both static hosting bases. Reuse valid v1 evidence; parent runs the integrated suite once after writers reconcile.
- The user reviews new real aggregates and approximations before they replace the currently approved local snapshot. Public deployment remains a separate decision.

## Left to the builder

Exact schema version/migration mechanics, module seams, GitHub REST versus GraphQL batching, cache/retry implementation, concrete exclusion list, and test fixtures. The designer settles visual details within the selected approach. Do not expand optional metrics or rewrite the existing pipeline to make the recap more elaborate.

Feasibility references and API limitations: `docs/research/2026-10-27-playful-recap-metrics.md`. A bounded live field-access probe is separate from whole-year collection; no new metric totals are asserted in this design.

Bounded live evidence: one read-only GraphQL request returned ten merged PRs across two accessible repositories with valid additions/deletions/merge times, file-level line counters, and typed authors. Parent inspected the private samples. Two file connections needed further pages, intentionally not fetched during the probe; no completeness claim follows. Only User authors were observed in that small sample, so an actual Bot example and full-year totals remain unverified. These limitations are collection work, not permission to display invented or partial results.
