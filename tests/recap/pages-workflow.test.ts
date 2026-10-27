import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const workflowUrl = new URL('../../.github/workflows/pages.yml', import.meta.url);
const productionCondition = "github.ref == 'refs/heads/main' && (github.event_name == 'workflow_dispatch' || (github.event_name == 'push' && toJSON(github.event.created) == 'false'))";
const pins = {
  checkout: 'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
  node: 'actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1',
  upload: 'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
  deploy: 'actions/deploy-pages@368f82528645a54fb793d4d04e342629a3f51346',
};

async function workflow() {
  return parse(await readFile(workflowUrl, 'utf8'));
}

function productionEligible(condition: unknown, github: { ref: string; event_name: string; event: { created?: boolean | string | null } }) {
  expect(condition).toBe(productionCondition);
  // Model only the exact allowlisted condition, not arbitrary Actions expressions.
  // Actions uses '' for missing properties; toJSON preserves JSON primitive types,
  // and comparisons here are all string-to-string (case-insensitive), not loose numeric equality.
  // https://docs.github.com/en/actions/reference/workflows-and-actions/contexts
  // https://docs.github.com/en/actions/reference/workflows-and-actions/expressions
  const createdJson = JSON.stringify(github.event.created === undefined ? '' : github.event.created);
  const equal = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();
  return equal(github.ref, 'refs/heads/main') && (equal(github.event_name, 'workflow_dispatch')
    || (equal(github.event_name, 'push') && equal(createdJson, 'false')));
}

describe('source Actions Pages workflow', () => {
  it('accepts main pushes, manual dispatch and isolated PR checks without schedules or token defaults', async () => {
    const config = await workflow();
    expect(config.on).toEqual({ push: { branches: ['main'] }, workflow_dispatch: null, pull_request: { branches: ['main'] } });
    expect(config.permissions).toEqual({});
    expect(config.concurrency).toEqual({
      group: "pages-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.number) || 'production' }}",
      'cancel-in-progress': false,
    });
    expect(Object.keys(config.jobs).sort()).toEqual(['build', 'deploy']);
  });

  it('builds and guards only public output with read-only permissions and credentials disabled', async () => {
    const { jobs } = await workflow();
    expect(jobs.build.permissions).toEqual({ contents: 'read' });
    expect(jobs.build['runs-on']).toBe('ubuntu-latest');
    expect(jobs.build.steps).toEqual([
      { uses: pins.checkout, with: { 'persist-credentials': false } },
      { uses: pins.node, with: { 'node-version': 24 } },
      { run: 'npm ci' },
      { run: 'npm test' },
      { run: 'npm run check' },
      { run: 'npm run build:published', env: { RECAP_BASE_PATH: '/investments-apps-year-in-review/' } },
      { run: 'npm run check:dist', env: { RECAP_BASE_PATH: '/investments-apps-year-in-review/' } },
      { uses: pins.upload, if: productionCondition, with: { path: 'dist' } },
    ]);
    expect(jobs.build.environment).toBeUndefined();
  });

  it('deploys an existing build with only Pages/OIDC privileges and no checked-out code', async () => {
    const { jobs } = await workflow();
    expect(jobs.deploy).toEqual({
      needs: 'build',
      if: productionCondition,
      'runs-on': 'ubuntu-latest',
      permissions: { pages: 'write', 'id-token': 'write' },
      environment: { name: 'github-pages', url: '${{ steps.deployment.outputs.page_url }}' },
      steps: [{ name: 'Deploy to GitHub Pages', id: 'deployment', uses: pins.deploy }],
    });
  });

  it.each([
    ['new main branch', 'refs/heads/main', 'push', true, false],
    ['ordinary main push', 'refs/heads/main', 'push', false, true],
    ['main manual dispatch', 'refs/heads/main', 'workflow_dispatch', undefined, true],
    ['PR merge ref', 'refs/pull/1/merge', 'pull_request', false, false],
    ['PR main ref', 'refs/heads/main', 'pull_request', false, false],
    ['non-main push', 'refs/heads/topic', 'push', false, false],
    ['non-main dispatch', 'refs/heads/topic', 'workflow_dispatch', undefined, false],
    ['push without creation metadata', 'refs/heads/main', 'push', undefined, false],
    ['push with empty creation metadata', 'refs/heads/main', 'push', '', false],
    ['push with null creation metadata', 'refs/heads/main', 'push', null, false],
    ['push with string false creation metadata', 'refs/heads/main', 'push', 'false', false],
    ['case-insensitive Actions string comparisons', 'REFS/HEADS/MAIN', 'PUSH', false, true],
  ])('gates both artifact upload and deployment for %s', async (_label, ref, eventName, created, eligible) => {
    const { jobs } = await workflow();
    const upload = jobs.build.steps.find((step: { uses?: string }) => step.uses === pins.upload);
    for (const condition of [upload.if, jobs.deploy.if]) {
      const event = created === undefined ? {} : { created };
      expect(productionEligible(condition, { ref, event_name: eventName, event })).toBe(eligible);
    }
  });

  it('uses only verified official pins with version comments and no private CI inputs', async () => {
    const source = await readFile(workflowUrl, 'utf8');
    for (const [action, version] of [[pins.checkout, 7], [pins.node, 7], [pins.upload, 5], [pins.deploy, 5]] as const) {
      expect(source).toContain(`uses: ${action} # v${version}`);
    }
    expect(source).not.toMatch(/secrets\s*[.\[]|collect|export:approved|npm run approve|\.recap-private|configure-pages|schedule:/i);
  });
});
