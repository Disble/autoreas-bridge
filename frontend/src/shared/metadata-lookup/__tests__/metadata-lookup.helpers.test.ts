import { describe, expect, it } from 'vitest';

import {
  buildUndoPatch,
  meetsMinimumQueryLength,
  normalizeLookupQuery,
  rankCandidates,
  toAnimeMetadataSelection,
} from '../metadata-lookup.helpers';
import type { AnimeMetadataCandidate, AnimeMetadataDetail } from '../metadata-lookup.types';

/**
 * Builds a minimal candidate for ranking tests -- only `malId` and `name`
 * matter to `rankCandidates`.
 * @param malId MyAnimeList's numeric anime id.
 * @param name The candidate's display title.
 * @returns A candidate carrying no optional fields.
 */
function candidate(malId: number, name: string): AnimeMetadataCandidate {
  return { malId, name };
}

describe('meetsMinimumQueryLength', () => {
  it.each([
    ['', false],
    ['鬼', false],
    ['銀魂', true],
    ['ナル', true],
    ['進撃の', true],
    ['進撃の巨人', true],
    ['bl', false],
    ['ble', true],
    ['𠮷', false],
  ])(
    'returns %s for query %j -- design D7a\'s script-aware floor',
    (query, expected) => {
      expect(meetsMinimumQueryLength(query)).toBe(expected);
    },
  );

  it('counts code points, not UTF-16 units -- the supplementary-plane trap', () => {
    // '𠮷' is one code point but two UTF-16 units. A naive `query.length >= 2`
    // check would wrongly clear the wide floor on this single character.
    expect('𠮷'.length).toBe(2);
    expect(meetsMinimumQueryLength('𠮷')).toBe(false);
  });

  it('treats a mixed-script query as non-Latin once any single character clears the boundary', () => {
    // Only 'a' (Basic Latin) is below the 127 boundary; the second
    // character alone must be enough to select the wide floor.
    expect(meetsMinimumQueryLength('a鬼')).toBe(true);
  });

  it('treats code point 127 itself as still within Basic Latin', () => {
    // U+007F sits at the exact boundary the design chose (`> 127`, not
    // `>= 127`) -- two of them stay under the Latin floor of 3.
    expect(meetsMinimumQueryLength(String.fromCodePoint(0x7f, 0x7f))).toBe(false);
  });
});

describe('normalizeLookupQuery', () => {
  it('folds case and collapses surrounding whitespace to the same cache key', () => {
    expect(normalizeLookupQuery('  Bleach  ')).toBe(normalizeLookupQuery('bleach'));
  });

  it('collapses internal repeated whitespace too', () => {
    expect(normalizeLookupQuery('Bleach   Sennen')).toBe('bleach sennen');
  });

  it('produces the exact normalized form for a plain query', () => {
    expect(normalizeLookupQuery('  Bleach  ')).toBe('bleach');
  });
});

describe('rankCandidates', () => {
  it('reorders MyAnimeList\'s own order so the closer title outranks the sequel -- design D11, measured Jujutsu Kaizen case', () => {
    const malOrder = [
      candidate(58567, 'Jujutsu Kaisen: Shimetsu Kaiyuu'),
      candidate(40748, 'Jujutsu Kaisen'),
    ];

    const ranked = rankCandidates(malOrder, 'Jujutsu Kaizen');

    expect(ranked.map((entry) => entry.malId)).toEqual([40748, 58567]);
  });

  it('leaves a single candidate as the only entry', () => {
    const single = [candidate(1, 'Bleach: Sennen Kessen-hen')];

    expect(rankCandidates(single, 'Bleach')).toEqual(single);
  });

  it('leaves an empty candidate list empty', () => {
    expect(rankCandidates([], 'anything')).toEqual([]);
  });

  it('orders same-length candidates by their increasing number of substitutions from the query', () => {
    const exact = candidate(1, 'abcde');
    const oneSubstitution = candidate(2, 'abcdz');
    const twoSubstitutions = candidate(3, 'abzzz');
    const totallyDifferent = candidate(4, 'vwxyz');

    const ranked = rankCandidates(
      [totallyDifferent, twoSubstitutions, exact, oneSubstitution],
      'abcde',
    );

    expect(ranked.map((entry) => entry.malId)).toEqual([1, 2, 3, 4]);
  });

  it('ranks a title missing one trailing character above an unrelated title of the same shorter length -- the deletion path', () => {
    const oneCharShorter = candidate(1, 'narut');
    const unrelatedSameLength = candidate(2, 'zzzzz');

    const ranked = rankCandidates([unrelatedSameLength, oneCharShorter], 'naruto');

    expect(ranked.map((entry) => entry.malId)).toEqual([1, 2]);
  });

  it('ranks a title with one extra trailing character above an unrelated title of the same longer length -- the insertion path', () => {
    const oneCharLonger = candidate(1, 'narutoo');
    const unrelatedSameLength = candidate(2, 'zzzzzzz');

    const ranked = rankCandidates([unrelatedSameLength, oneCharLonger], 'naruto');

    expect(ranked.map((entry) => entry.malId)).toEqual([1, 2]);
  });

  it('normalizes by each candidate\'s own length, ranking the same edit distance as closer on a longer title', () => {
    const query = '0123456789';
    const sameLengthTwoEdits = candidate(1, 'a12345678b'); // two substitutions, distance 2, length 10
    const longerTwoEdits = candidate(2, '0123456789zz'); // two insertions, distance 2, length 12

    const ranked = rankCandidates([sameLengthTwoEdits, longerTwoEdits], query);

    expect(ranked.map((entry) => entry.malId)).toEqual([2, 1]);
  });

  it('ranks a title carrying an exact-suffix match above an unrelated title, even with a long unrelated prefix', () => {
    // "naruto" is an exact suffix of exactSuffix, ten characters into an
    // otherwise unrelated title -- this exercises the DP matrix far past its
    // first row and column, where a broken boundary initialization would
    // understate the cost of the unrelated prefix.
    const exactSuffix = candidate(1, 'xxxxxxxxxxnaruto');
    const unrelatedSameLength = candidate(2, 'zzzzzzzzzzzzzzzz');

    const ranked = rankCandidates([unrelatedSameLength, exactSuffix], 'naruto');

    expect(ranked.map((entry) => entry.malId)).toEqual([1, 2]);
  });
});

describe('buildUndoPatch', () => {
  it('copies exactly the patch\'s own keys from the current draft', () => {
    const draft = { name: 'Old Name', kind: '0', origin: 'Manga' };
    const patch = { name: 'New Name', kind: '1' };

    expect(buildUndoPatch(draft, patch)).toEqual({ name: 'Old Name', kind: '0' });
  });

  it('never includes a key the patch did not touch', () => {
    const draft = { name: 'Old Name', origin: 'Manga' };
    const patch = { name: 'New Name' };

    expect(buildUndoPatch(draft, patch)).not.toHaveProperty('origin');
  });
});

describe('toAnimeMetadataSelection', () => {
  /**
   * Builds a minimal, fully-mapped detail input, so each test overrides only
   * the field it is exercising.
   * @param overrides Per-test field replacements.
   * @returns A detail input with every mapped field filled.
   */
  function detail(overrides: Partial<AnimeMetadataDetail> = {}): AnimeMetadataDetail {
    return {
      title: 'Bleach: Sennen Kessen-hen',
      type: 'TV',
      episodes: '13',
      duration: '24',
      source: 'Manga',
      genres: ['Action', 'Adventure'],
      studios: ['Pierrot'],
      coverURL: 'https://cdn.myanimelist.net/cover.jpg',
      ...overrides,
    };
  }

  it('maps every mapped field to its bridge shape and reports nothing unfilled', () => {
    expect(toAnimeMetadataSelection(detail())).toEqual({
      name: 'Bleach: Sennen Kessen-hen',
      kind: '0',
      totalEpisodes: '13',
      duration: '24',
      origin: 'Manga',
      genres: 'Action, Adventure',
      studios: 'Pierrot',
      coverURL: 'https://cdn.myanimelist.net/cover.jpg',
      unfilled: [],
    });
  });

  it.each([
    ['TV', '0'],
    ['Movie', '1'],
    ['Special', '2'],
    ['OVA', '3'],
  ])('maps MyAnimeList type %j to bridge kind %j', (type, kind) => {
    expect(toAnimeMetadataSelection(detail({ type })).kind).toBe(kind);
  });

  it.each([['ONA'], ['Music'], ['Unknown Type'], [undefined]])(
    'leaves kind unset and reports it unfilled for unmapped type %j -- non-negotiable #6, never files an ONA as TV',
    (type) => {
      const selection = toAnimeMetadataSelection(detail({ type }));

      expect(selection.kind).toBeUndefined();
      expect(selection.unfilled).toContain('kind');
    },
  );

  it('reads the digit-only episode count as totalEpisodes', () => {
    expect(toAnimeMetadataSelection(detail({ episodes: '366' })).totalEpisodes).toBe('366');
  });

  it.each([[undefined], [''], ['Unknown']])(
    'reports totalEpisodes unfilled rather than a defaulted value for %j',
    (episodes) => {
      const selection = toAnimeMetadataSelection(detail({ episodes }));

      expect(selection.totalEpisodes).toBeUndefined();
      expect(selection.unfilled).toContain('totalEpisodes');
    },
  );

  it.each([[undefined], ['']])(
    'reports duration unfilled when MyAnimeList\'s page legitimately omitted it, for %j',
    (duration) => {
      const selection = toAnimeMetadataSelection(detail({ duration }));

      expect(selection.duration).toBeUndefined();
      expect(selection.unfilled).toContain('duration');
    },
  );

  it('reports origin unfilled when Source: was legitimately absent', () => {
    const selection = toAnimeMetadataSelection(detail({ source: undefined }));

    expect(selection.origin).toBeUndefined();
    expect(selection.unfilled).toContain('origin');
  });

  it('joins multiple genres with a comma and space', () => {
    expect(toAnimeMetadataSelection(detail({ genres: ['Action', 'Adventure', 'Drama'] })).genres).toBe(
      'Action, Adventure, Drama',
    );
  });

  it('fills genres from a single-genre candidate -- non-negotiable #1', () => {
    expect(toAnimeMetadataSelection(detail({ genres: ['Slice of Life'] })).genres).toBe('Slice of Life');
  });

  it.each([[undefined], [[]]])('reports genres unfilled for %j', (genres) => {
    const selection = toAnimeMetadataSelection(detail({ genres }));

    expect(selection.genres).toBeUndefined();
    expect(selection.unfilled).toContain('genres');
  });

  it('joins multiple studios with a comma and space', () => {
    expect(toAnimeMetadataSelection(detail({ studios: ['Pierrot', 'Studio Bones'] })).studios).toBe(
      'Pierrot, Studio Bones',
    );
  });

  it.each([[undefined], [[]]])('reports studios unfilled for %j -- Missing Studios: field is surfaced', (studios) => {
    const selection = toAnimeMetadataSelection(detail({ studios }));

    expect(selection.studios).toBeUndefined();
    expect(selection.unfilled).toContain('studios');
  });

  it('passes the search-payload cover straight through as coverURL, with no extra fetch', () => {
    expect(toAnimeMetadataSelection(detail({ coverURL: 'https://cdn.example/cover.jpg' })).coverURL).toBe(
      'https://cdn.example/cover.jpg',
    );
  });

  it('leaves coverURL unset, never unfilled, when no candidate image was available', () => {
    const selection = toAnimeMetadataSelection(detail({ coverURL: undefined }));

    expect(selection.coverURL).toBeUndefined();
    expect(selection.unfilled).not.toContain('coverURL');
  });

  it('never writes MyAnimeList\'s Status to any field -- structurally unavailable, AnimeMetadataDetail has no status property', () => {
    const selection = toAnimeMetadataSelection(detail());

    expect(Object.keys(selection).sort()).toEqual(
      ['coverURL', 'duration', 'genres', 'kind', 'name', 'origin', 'studios', 'totalEpisodes', 'unfilled'].sort(),
    );
  });
});
