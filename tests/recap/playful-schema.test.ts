import { describe, expect, it } from 'vitest';
import { PublicSnapshotSchema } from '../../src/data/schema';
import * as schemas from '../../src/data/schema';
import * as playful from '../../src/data/playful';
import { v2Fixture, withPrivateExtraField } from '../fixtures/playful';
import v1 from '../fixtures/snapshot-v1.json';

describe('versioned public snapshot and scalar math', () => {
  it('keeps v1 unchanged and exposes named versions', () => {
    expect(PublicSnapshotSchema.parse(v1)).toEqual(v1);
    expect(schemas).toHaveProperty('PublicSnapshotV1Schema');
    expect(schemas).toHaveProperty('PublicSnapshotV2Schema');
    expect(schemas.PublicSnapshotV1Schema.parse(v1)).toEqual(v1);
    expect(schemas.PublicSnapshotV1Schema.safeParse(v2Fixture()).success).toBe(false);
    expect(schemas.PublicSnapshotV2Schema.safeParse(v1).success).toBe(false);
  });

  it('accepts the strict v2 extension without changing the three core metrics', () => {
    expect(PublicSnapshotSchema.safeParse(v2Fixture()).success).toBe(true);
    expect(Object.keys(v2Fixture().metrics)).toHaveLength(3);
    expect(PublicSnapshotSchema.safeParse({ ...v2Fixture(), schemaVersion: 3 }).success).toBe(false);
    const { playful, ...withoutExtension } = v2Fixture();
    expect(PublicSnapshotSchema.safeParse(withoutExtension).success).toBe(false);
    expect(PublicSnapshotSchema.safeParse({ ...v2Fixture(), playful: { ...playful, methodologyVersion: 'private-method' } }).success).toBe(false);
  });

  it('rejects private extras at every extension level', () => {
    expect(PublicSnapshotSchema.safeParse(withPrivateExtraField(v2Fixture())).success).toBe(false);
    expect(PublicSnapshotSchema.safeParse({ ...v2Fixture(), private: 'secret' }).success).toBe(false);
    const snapshot = v2Fixture();
    expect(PublicSnapshotSchema.safeParse({ ...snapshot, playful: { ...snapshot.playful, author: 'secret' } }).success).toBe(false);
  });

  it.each([-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects invalid extension counts %s', (count) => {
    const snapshot = v2Fixture();
    snapshot.playful.linesAdded.count = count;
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.playful.linesAdded.count = 1;
    snapshot.playful.unknownAuthorPullRequests = count;
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('distinguishes unavailable from zero, and pairs added/removed availability', () => {
    const snapshot = v2Fixture();
    snapshot.playful.linesAdded = { status: 'unavailable', count: null };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.playful.linesRemoved = { status: 'unavailable', count: null };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(true);
    snapshot.playful.linesAdded.count = 0;
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
    snapshot.playful.linesAdded = { status: 'available', count: null };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(false);
  });

  it('rejects bots or unknown PRs exceeding the total and exact bot counts with unknowns', () => {
    for (const change of [
      { botAuthoredPullRequests: { status: 'available', count: 5 } },
      { unknownAuthorPullRequests: 5 },
      { unknownAuthorPullRequests: 1 },
    ]) {
      const snapshot = v2Fixture();
      expect(PublicSnapshotSchema.safeParse({ ...snapshot, playful: { ...snapshot.playful, ...change } }).success).toBe(false);
    }
    const snapshot = v2Fixture();
    snapshot.playful.unknownAuthorPullRequests = 2;
    snapshot.playful.botAuthoredPullRequests = { status: 'unavailable', count: null };
    expect(PublicSnapshotSchema.safeParse(snapshot).success).toBe(true);
  });

  it('uses unrounded added-line book quantities and fractional bot shares', () => {
    expect(playful.bookEquivalents).toBeTypeOf('function');
    const { bookEquivalents, botShare } = playful;
    expect(playful.LINES_PER_PAGE).toBe(40);
    expect(playful.BOOK_PAGES).toBe(1424);
    expect(bookEquivalents(56_960)).toBe(1);
    expect(bookEquivalents(28_480)).toBe(0.5);
    expect(bookEquivalents(0)).toBe(0);
    expect(bookEquivalents(1)).toBe(1 / 56_960);
    expect(botShare(1, 4)).toBe(0.25);
    expect(botShare(0, 0)).toBeNull();
  });
});
