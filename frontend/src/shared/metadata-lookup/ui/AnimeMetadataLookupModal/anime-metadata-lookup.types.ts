import type { AnimeMetadataCandidate } from '../../metadata-lookup.types';

/**
 * One `SearchMyAnimeList` result exactly as the Wails binding returns it
 * (`contracts.MyAnimeListSearchResult`'s wire shape, flattened to the JSON
 * field names its own struct tags declare). A zero-candidate search is
 * outcome `'no_op'`, never `'error'` -- an empty match list is a legitimate
 * result, not a failure (design D4).
 */
export interface MyAnimeListSearchResultDTO {
  readonly outcome: string;
  readonly message: string;
  readonly candidates?: readonly AnimeMetadataCandidate[];
}

/**
 * One `GetMyAnimeListDetail` result exactly as the Wails binding returns it
 * (`contracts.MyAnimeListDetailResult`'s wire shape). Fields stay MyAnimeList's
 * own vocabulary -- the MAL-to-bridge translation happens one hop later, in
 * each feature's own mapping helper, never inside this hook.
 */
export interface MyAnimeListDetailResultDTO {
  readonly outcome: string;
  readonly message: string;
  readonly title?: string;
  readonly type?: string;
  readonly episodes?: string;
  readonly duration?: string;
  readonly source?: string;
  readonly studios?: readonly string[];
  readonly genres?: readonly string[];
  readonly unfilled?: readonly string[];
}

/**
 * The lookup's own request port -- the two Wails-bound calls its search half
 * (`useAnimeMetadataLookupSearch`) and selection half
 * (`useAnimeMetadataLookupSelection`) each drive one of (design D4/D7),
 * injected so a test can supply a fake instead of a real IPC round trip. No
 * production default is wired here: `wailsjs/go/desktop/App` is regenerated
 * at build time and does not yet export either binding in this tree, so a
 * caller must supply a concrete adapter once one exists.
 */
export interface AnimeMetadataLookupSource {
  readonly SearchMyAnimeList: (query: string) => Promise<MyAnimeListSearchResultDTO>;
  readonly GetMyAnimeListDetail: (malId: number) => Promise<MyAnimeListDetailResultDTO>;
}
