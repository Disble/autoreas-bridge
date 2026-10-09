import { describe, expect, it } from 'vitest';

import { narrowSeasonSectionId } from '../season-workspace.helpers';

/** Keeps HeroUI selection keys within the workspace's declared tab identifiers. */
describe('narrowSeasonSectionId', () => {
  /** Accepts each valid workspace tab id and rejects unknown HeroUI keys. */
  it.each([
    { key: 'overview', expected: 'overview' },
    { key: 'intake', expected: 'intake' },
    { key: 'evaluation', expected: 'evaluation' },
    { key: 'selection', expected: 'selection' },
    { key: 'ordering', expected: 'ordering' },
    { key: 'unknown', expected: undefined },
    { key: 42, expected: undefined },
  ])('narrows $key to $expected', ({ key, expected }) => {
    expect(narrowSeasonSectionId(key)).toBe(expected);
  });
});
