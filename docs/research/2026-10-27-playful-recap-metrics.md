# Playful recap metrics — feasibility research

Research returned by Explorer `ses_e8179c53effeVWcYeoyHlYR25X`; persisted by the orchestrator because the researcher could not write files. This is feasibility research, not a measured dataset or an approved implementation design.

## Recommended small expansion

Investigate merged pull requests, code lines added/deleted, submitted collaboration reviews, and explicitly bot-authored merged PRs. Reuse existing deployment dates and Jira counts for narrative moments. Keep language-of-the-year classification out of the first expansion unless its extra file-level collection cost is warranted.

No new PR/LOC/review/bot metrics have been collected yet. The already reviewed snapshot contains 935 dependency alerts fixed, 67 production deployments, 515 completed work items (209 bugs), and 27 deployments in August. Do not mix hypothetical values with those real results.

## GitHub definitions and constraints

### Merged pull requests

Enumerate closed PRs and retain only those with `merged_at` in the start-inclusive/end-exclusive reporting period. Follow all pages. GitHub Search supports `merged:` but caps a search at 1,000 results; use sharding or full repository pagination rather than truncating a busy organization.

The PR list identifies candidates; aggregate additions/deletions can be retrieved through PR detail or GraphQL fields. Do not assume the REST list response includes all detail statistics.

Sources:
- https://docs.github.com/en/rest/pulls/pulls
- https://docs.github.com/en/rest/search/search
- https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests
- https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api

### Code added and removed

GitHub PR detail exposes `additions` and `deletions`. Label these changed/added/deleted lines in merged PRs, not unique code authored or productivity. Repeated edits, reversions, and automation can contribute more than once across distinct PRs.

Per-file PR results provide additions/deletions and paths for a maintained generated/vendor/lockfile exclusion policy. This endpoint caps output at 3,000 files per PR. A missing/truncated patch cannot be treated as a complete diff; use supplied line counts, not patch parsing. Report incomplete file coverage rather than silently pretending filtering succeeded.

If the first expansion uses unfiltered aggregate PR counters, say so plainly in methodology. Do not claim generated files or bot edits were removed without collecting the data necessary to do that.

Source: https://docs.github.com/en/rest/pulls/pulls

### Collaboration

Distinct merged PRs with a submitted non-self review is different from submitted review events. Choose a precise label. Review `submitted_at`/`submittedAt` is available; exclude pending drafts and self-reviews. Multiple review rounds can produce multiple events on one PR.

Sources:
- https://docs.github.com/en/rest/pulls/reviews
- https://docs.github.com/en/graphql/reference/objects#pullrequest

### Welcoming our Robot Overlords

Count merged PRs authored by actors GitHub explicitly classifies as Bot (`type` in REST, `__typename` in GraphQL). This supports bot-authored PR count and share of merged PRs. It does not measure AI-written code, all automation, human-opened automated changes, or workflow runs. A `[bot]` login suffix is only a fallback heuristic, not the primary definition.

Sources:
- https://docs.github.com/en/graphql/reference/objects#bot
- https://docs.github.com/en/rest/pulls/pulls

### Top genres / languages

The repository-language endpoint measures the current repository byte mix, not the languages in 2026 changes. A real annual language breakdown needs file-level additions and language classification (such as Linguist), with exclusions and coverage for ambiguous files. Defer rather than label current bytes as annual activity.

Sources:
- https://docs.github.com/en/rest/repos/repos#list-repository-languages
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-repository-languages

### Peak week and streak

Merged PR timestamps can support busiest merge week and consecutive days with at least one merge. These are merge cadence, not coding hours or individual effort. Existing deployment timestamps can similarly support shipping cadence. Define the event type and calendar boundaries before comparing.

Orchestrator clarification: retain the project's already approved `America/New_York` reporting timezone; do not introduce a separate UTC-day convention for the new stories. Use the same frozen snapshot cutoff.

## War and Peace printing analogy

Penguin Random House lists the Constance Garnett / Modern Library edition of *War and Peace*, published July 9, 2002, at **1,424 pages**. The orchestrator independently fetched the publisher page (HTTP 200) and confirmed both the visible page count and structured `totalPages: 1424` metadata.

Primary source: https://www.penguinrandomhouse.com/books/179305/war-and-peace-by-leo-tolstoy

A simple analogy can use **added code lines / assumed lines per printed page / 1,424**. For example, a proposed assumption of 40 lines per page means 56,960 code lines per book-equivalent. The page-density choice is our illustrative assumption, not a publisher claim or a measured property of the code. No number of book-equivalents is known until code data is collected.

Possible plain-language framing: “If we printed those added lines at 40 per page, that’s roughly X copies of War and Peace.” Keep the assumption in a small accessible methodology note, not a long disclaimer interrupting the story. Do not equate lines with words or claim literary, quality, business-impact, or productivity equivalence.

## Access and publishing boundary

Documentation establishes available API fields, not complete live permissions. New collection must verify access and pagination for the existing 35 accessible repositories, and retain the current limited-coverage caveat unless independent inventory/visibility is established. No repository/person/issue details or private source links belong in public data. A playful presentation does not weaken review/approval or static-publication guards.
