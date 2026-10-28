# GitHub Pages Actions research — 2026-10-27

Primary-source findings returned by Explorer `ses_e80c3bb64ffeKmHoo16VUJGkpM`; persisted by the orchestrator because the researcher could not write files. The orchestrator independently fetched the four used action refs and their immutable `action.yml` files, plus the official REST OpenAPI schema.

## Verified action pins

| Official action | Captured stable tag | Verified commit | Runtime |
|---|---|---|---|
| actions/checkout | v7 | `3d3c42e5aac5ba805825da76410c181273ba90b1` | node24 |
| actions/setup-node | v7 | `949feb2413d6458794dcd2491c4babbbce0c15c1` | node24 |
| actions/upload-pages-artifact | v5 | `fc324d3547104276b827a68afc52ff2a11cc49c9` | composite |
| actions/deploy-pages | v5 | `368f82528645a54fb793d4d04e342629a3f51346` | node24 |

Each official REST tag-ref endpoint returned HTTP 200 and a commit object, not an unresolved annotated tag. Pin full commits; comments may retain the major tag for readability. Node 24 LTS satisfies the app's `>=22.23.4` floor. The Pages documentation examples can lag current official action releases.

The fixed project base path can be supplied directly. `configure-pages` is not needed to discover this project's known path, avoiding a build-job settings permission solely for metadata discovery.

## Workflow shape

- Pushes to `main` and `workflow_dispatch` build/deploy. PR checks may test/build, but must not deploy or receive write/OIDC permissions.
- Build job uses `contents: read`, checkout `persist-credentials: false`, Node setup, `npm ci`, unit/type checks, approved-public-snapshot build, distribution guard, and upload of `dist/` only.
- Deploy job uses the uploaded `github-pages` artifact, `pages: write`, `id-token: write`, and the `github-pages` environment. Do not grant the build job Pages/OIDC write scope or change the repository-wide token default.
- Pages-specific concurrency with `cancel-in-progress: false` avoids canceling an in-flight production deployment.
- No PAT, Jira token, cross-repository collection token, or private approval report belongs in CI. The normal ephemeral workflow token is sufficient for native Pages deployment.

## Verified settings API

The site update method is **PUT**, not PATCH:

`PUT /repos/{owner}/{repo}/pages`

The official OpenAPI schema allows `{"build_type":"workflow"}` alone: one `anyOf` requirement is `build_type`; `source` need not be sent for this change. Preserve unrelated custom-domain/HTTPS settings. Rollback uses `build_type: legacy` with `source: {branch: gh-pages, path: /}`; schema confirms the branch/path object is accepted.

Deployment environment branch policies are separate. Current audited `github-pages` policy permits only `gh-pages`; `main` must be allowed for the new deployment job. Preserve the old policy/branch for rollback. Do not broaden organization policy or assume protected-branch flags imply push/bypass authority.

The default branch must contain the workflow before depending on manual dispatch. Re-read repo settings before migration, retain the previous deployment/branch/settings, prove clean-checkout build first, migrate only the exact target repository, and verify an actual workflow deployment and anonymous public page afterward. A failed initial CI run is not a successful migration.

## Sources

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://github.com/actions/starter-workflows/blob/main/pages/astro.yml
- https://api.github.com/repos/actions/checkout/git/ref/tags/v7
- https://api.github.com/repos/actions/setup-node/git/ref/tags/v7
- https://api.github.com/repos/actions/upload-pages-artifact/git/ref/tags/v5
- https://api.github.com/repos/actions/deploy-pages/git/ref/tags/v5
- Immutable `https://raw.githubusercontent.com/actions/<action>/<commit>/action.yml` for each verified commit above.
- https://docs.github.com/en/rest/pages/pages#update-information-about-a-github-pages-site
- https://raw.githubusercontent.com/github/rest-api-description/main/descriptions/api.github.com/api.github.com.json
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions
- https://docs.github.com/en/rest/deployments/environments
- https://docs.github.com/en/rest/deployments/branch-policies

## Point-in-time audit context

The read-only local/remote audit is private at `.recap-private/source-ci-audit.md`. It identified no active credentials or raw exports with bounded native scans, but did identify historical internal notes. This is not an exhaustive secret guarantee. A clean `main` is the user's selected baseline; it does not erase the existing public feature branch/history. No migration mutation occurred during research.
