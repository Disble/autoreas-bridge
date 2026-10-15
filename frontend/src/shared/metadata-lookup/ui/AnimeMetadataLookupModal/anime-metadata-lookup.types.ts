import type { AnimeMetadataCandidate } from '../../metadata-lookup.types';
import type { LookupTriggerVariant } from '../../../ui/LookupModal/lookup-modal.types';

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

/**
 * How the lookup's trigger presents itself: the visible "Fetch metadata" text
 * button forms use, or the round icon-only button a dense row action group uses.
 */
export type AnimeMetadataLookupTriggerVariant = LookupTriggerVariant;

/** Presentation-only inputs for one MyAnimeList candidate row in the lookup modal's list. */
export interface AnimeMetadataLookupCandidateProps {
  /** The MyAnimeList search result this row renders, in its own vocabulary. */
  readonly candidate: AnimeMetadataCandidate;
  /** Whether this is the row the user has currently highlighted. */
  readonly isSelected: boolean;
  /** Invoked with the candidate's `malId` when the row is pressed. */
  readonly onSelect: (malId: number) => void;
}
