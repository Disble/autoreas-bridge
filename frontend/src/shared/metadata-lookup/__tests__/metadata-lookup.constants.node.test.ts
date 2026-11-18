import { describe, expect, it } from 'vitest';
import { METADATA_LOOKUP_KIND_MAP } from '../metadata-lookup.constants';

describe('METADATA_LOOKUP_KIND_MAP', () => {
  it.each([
    ['TV', '0'],
    ['Movie', '1'],
    ['Special', '2'],
    ['OVA', '3'],
  ])('maps MyAnimeList type %s to bridge kind %s', (malType, kind) => {
    expect(METADATA_LOOKUP_KIND_MAP[malType]).toBe(kind);
  });

  it.each(['ONA', 'Music', 'Unknown'])(
    'never maps %s to a kind -- an unmapped type must leave kind unfilled, never filed as TV (non-negotiable #6)',
    (malType) => {
      expect(METADATA_LOOKUP_KIND_MAP[malType]).toBeUndefined();
    },
  );
});
