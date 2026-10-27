import v1 from './snapshot-v1.json';

export function v2Fixture() {
  return {
    ...structuredClone(v1), schemaVersion: 2,
    cutoffExclusive: '2026-10-27T17:28:51.121Z',
    playful: {
      methodologyVersion: 'known-generated-v1',
      mergedPullRequests: { status: 'available', count: 4 } as { status: string; count: number | null },
      linesAdded: { status: 'available', count: 56_960 } as { status: string; count: number | null },
      linesRemoved: { status: 'available', count: 10 } as { status: string; count: number | null },
      botAuthoredPullRequests: { status: 'available', count: 1 } as { status: string; count: number | null },
      unknownAuthorPullRequests: 0,
    },
  };
}

export function withPrivateExtraField(snapshot: ReturnType<typeof v2Fixture>) {
  return { ...snapshot, playful: { ...snapshot.playful,
    linesAdded: { ...snapshot.playful.linesAdded, path: 'private/source.ts' } } };
}
