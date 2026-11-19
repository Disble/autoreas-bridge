import { describe, expect, it } from 'vitest';

import {
  buildUndoPatch,
  formatCandidateSubtitle,
  meetsMinimumQueryLength,
  normalizeLookupQuery,
  rankCandidates,
  rankLookupCandidates,
  toAnimeMetadataSelection,
} from '../metadata-lookup.helpers';
import type { AnimeMetadataCandidate, AnimeMetadataDetail } from '../metadata-lookup.types';

/** A mapped selection field a case reads, every key except the `unfilled` report. */
type SelectionField = Exclude<keyof ReturnType<typeof toAnimeMetadataSelection>, 'unfilled'>;

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
  it('applies design D7a\'s script-aware floor by code point, with 127 still Basic Latin', () => {
    // '𠮷' is one code point but two UTF-16 units. A naive `query.length >= 2`
    // check would wrongly clear the wide floor on this single character.
    expect('𠮷'.length).toBe(2);
    const cases: ReadonlyArray<readonly [string, string, boolean]> = [
      ['empty query', '', false],
      ['one CJK character', '鬼', false],
      ['two CJK characters', '銀魂', true],
      ['three CJK characters', '進撃の', true],
      ['two Latin characters', 'bl', false],
      ['three Latin characters', 'ble', true],
      ['one supplementary-plane character', '𠮷', false],
      // Only 'a' is Basic Latin; the second character alone selects the wide floor.
      ['mixed-script query', 'a鬼', true],
      // U+007F sits at the exact boundary (`> 127`, not `>= 127`).
      ['two code points 127', String.fromCodePoint(0x7f, 0x7f), false],
    ];
    for (const [name, query, expected] of cases) {
      expect.soft(meetsMinimumQueryLength(query), name).toBe(expected);
    }
  });
});

describe('normalizeLookupQuery', () => {
  it('trims, lowercases and collapses internal repeated whitespace', () => {
    expect.soft(normalizeLookupQuery('Bleach   Sennen'), 'internal whitespace').toBe('bleach sennen');
    expect.soft(normalizeLookupQuery('  Bleach  '), 'plain query').toBe('bleach');
  });
});

describe('rankCandidates', () => {
  it('orders candidates by normalized edit distance from the query', () => {
    const jjkSequel = candidate(58567, 'Jujutsu Kaisen: Shimetsu Kaiyuu');
    const jjk = candidate(40748, 'Jujutsu Kaisen');
    const single = candidate(1, 'Bleach: Sennen Kessen-hen');
    const exact = candidate(1, 'abcde');
    const oneSubstitution = candidate(2, 'abcdz');
    const twoSubstitutions = candidate(3, 'abzzz');
    const totallyDifferent = candidate(4, 'vwxyz');
    const oneCharShorter = candidate(1, 'narut');
    const unrelatedShort = candidate(2, 'zzzzz');
    const oneCharLonger = candidate(1, 'narutoo');
    const unrelatedLong = candidate(2, 'zzzzzzz');
    const sameLengthTwoEdits = candidate(1, 'a12345678b'); // two substitutions, distance 2, length 10
    const longerTwoEdits = candidate(2, '0123456789zz'); // two insertions, distance 2, length 12
    // "naruto" ten characters into an unrelated title exercises the DP matrix far past its first
    // row and column, where a broken boundary initialization would understate the prefix cost.
    const exactSuffix = candidate(1, 'xxxxxxxxxxnaruto');
    const unrelatedSuffixLength = candidate(2, 'zzzzzzzzzzzzzzzz');
    const cases: ReadonlyArray<readonly [string, AnimeMetadataCandidate[], string, AnimeMetadataCandidate[]]> = [
      ['design D11 Jujutsu Kaizen: closer title outranks the sequel', [jjkSequel, jjk], 'Jujutsu Kaizen', [jjk, jjkSequel]],
      ['a single candidate stays the only entry', [single], 'Bleach', [single]],
      ['an empty list stays empty', [], 'anything', []],
      ['same length: increasing substitutions', [totallyDifferent, twoSubstitutions, exact, oneSubstitution], 'abcde', [exact, oneSubstitution, twoSubstitutions, totallyDifferent]],
      ['deletion path: one trailing character missing', [unrelatedShort, oneCharShorter], 'naruto', [oneCharShorter, unrelatedShort]],
      ['insertion path: one extra trailing character', [unrelatedLong, oneCharLonger], 'naruto', [oneCharLonger, unrelatedLong]],
      ['same distance ranks closer on the longer title', [sameLengthTwoEdits, longerTwoEdits], '0123456789', [longerTwoEdits, sameLengthTwoEdits]],
      ['exact suffix behind a long unrelated prefix', [unrelatedSuffixLength, exactSuffix], 'naruto', [exactSuffix, unrelatedSuffixLength]],
    ];
    for (const [name, candidates, query, expected] of cases) {
      expect.soft(rankCandidates(candidates, query), name).toEqual(expected);
    }
  });
});

describe('rankLookupCandidates', () => {
  it('orders any candidate shape by the title its getter reads', () => {
    const pages = [
      { pageURL: 'https://jkanime.net/starmyu-2/', label: 'Starmyu 2nd Season' },
      { pageURL: 'https://jkanime.net/ao-ashi-2/', label: 'Ao Ashi Season 2' },
    ];

    const ranked = rankLookupCandidates(pages, 'Ao Ashi 2nd Season', (page) => page.label);

    expect(ranked.map((page) => page.pageURL)).toEqual(['https://jkanime.net/ao-ashi-2/', 'https://jkanime.net/starmyu-2/']);
  });
});

describe('formatCandidateSubtitle', () => {
  it('joins the reported parts and skips the missing or empty ones', () => {
    expect(formatCandidateSubtitle({ ...candidate(1, 'Ao Ashi'), mediaType: 'TV', startYear: 2022, score: '' })).toBe('TV · 2022');
    expect(formatCandidateSubtitle(candidate(2, 'Ao Ashi'))).toBe('');
  });
});

describe('buildUndoPatch', () => {
  it('copies exactly the patch\'s own keys from the current draft and never an untouched key', () => {
    expect
      .soft(buildUndoPatch({ name: 'Old Name', kind: '0', origin: 'Manga' }, { name: 'New Name', kind: '1' }), 'two patched keys')
      .toEqual({ name: 'Old Name', kind: '0' });
    expect
      .soft(buildUndoPatch({ name: 'Old Name', origin: 'Manga' }, { name: 'New Name' }), 'one patched key')
      .not.toHaveProperty('origin');
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

  it('maps each reported field to its bridge value', () => {
    const cases: ReadonlyArray<readonly [string, Partial<AnimeMetadataDetail>, SelectionField, string]> = [
      ['type TV', { type: 'TV' }, 'kind', '0'],
      ['type Movie', { type: 'Movie' }, 'kind', '1'],
      ['type Special', { type: 'Special' }, 'kind', '2'],
      ['type OVA', { type: 'OVA' }, 'kind', '3'],
      ['digit-only episode count', { episodes: '366' }, 'totalEpisodes', '366'],
      ['multiple genres join with a comma and space', { genres: ['Action', 'Adventure', 'Drama'] }, 'genres', 'Action, Adventure, Drama'],
      ['single-genre candidate, non-negotiable #1', { genres: ['Slice of Life'] }, 'genres', 'Slice of Life'],
      ['multiple studios join with a comma and space', { studios: ['Pierrot', 'Studio Bones'] }, 'studios', 'Pierrot, Studio Bones'],
      ['search-payload cover passes straight through', { coverURL: 'https://cdn.example/cover.jpg' }, 'coverURL', 'https://cdn.example/cover.jpg'],
    ];
    for (const [name, overrides, field, expected] of cases) {
      expect.soft(toAnimeMetadataSelection(detail(overrides))[field], name).toBe(expected);
    }
  });

  it('leaves a field unset and reports it unfilled rather than a defaulted value', () => {
    const cases: ReadonlyArray<readonly [string, Partial<AnimeMetadataDetail>, SelectionField]> = [
      // Non-negotiable #6: never files an ONA as TV.
      ['unmapped type ONA', { type: 'ONA' }, 'kind'],
      ['missing type', { type: undefined }, 'kind'],
      ['missing episodes', { episodes: undefined }, 'totalEpisodes'],
      ['empty episodes', { episodes: '' }, 'totalEpisodes'],
      ['Unknown episodes', { episodes: 'Unknown' }, 'totalEpisodes'],
      ['missing duration', { duration: undefined }, 'duration'],
      ['empty duration', { duration: '' }, 'duration'],
      ['missing Source:', { source: undefined }, 'origin'],
      ['missing genres', { genres: undefined }, 'genres'],
      ['empty genres', { genres: [] }, 'genres'],
      ['missing Studios:', { studios: undefined }, 'studios'],
      ['empty studios', { studios: [] }, 'studios'],
    ];
    for (const [name, overrides, field] of cases) {
      const selection = toAnimeMetadataSelection(detail(overrides));

      expect.soft(selection[field], `${name}: value`).toBeUndefined();
      expect.soft(selection.unfilled, `${name}: unfilled`).toContain(field);
    }
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
