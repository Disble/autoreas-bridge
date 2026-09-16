/**
 * One MyAnimeList search result rendered as a candidate card, in
 * MyAnimeList's own vocabulary. The MAL-to-bridge translation happens only
 * after the user confirms one candidate, producing an
 * {@link AnimeMetadataSelection} -- this shape exists solely to let the
 * lookup modal render the candidate list and let the user pick one before
 * that translation ever runs.
 */
export interface AnimeMetadataCandidate {
  /** MyAnimeList's own numeric anime id -- the sole argument `confirmCandidate` takes. */
  readonly malId: number;
  readonly name: string;
  readonly image?: string;
  readonly mediaType?: string;
  readonly startYear?: number;
  readonly score?: string;
}

/**
 * Normalized, source-agnostic result of one confirmed lookup (design D6,
 * "Interfaces"). Knows no feature type -- each feature performs its own
 * hop-two mapping into its own draft patch. `kind` already carries the
 * closed four-value bridge enum (`'0'`-`'3'`), never MyAnimeList's own
 * `Type:` text; a MyAnimeList type with no mapped `kind` is omitted here
 * and named in `unfilled` instead (design's Field Mapping table).
 */
export interface AnimeMetadataSelection {
  readonly name: string;
  readonly kind?: string;
  readonly totalEpisodes?: string;
  readonly duration?: string;
  readonly origin?: string;
  readonly genres?: string;
  readonly studios?: string;
  readonly coverURL?: string;
  /** Labels of form-owned fields MyAnimeList left legitimately unfilled. */
  readonly unfilled: readonly string[];
}

/**
 * The lookup modal's one discriminant (design D8). Exactly one of these
 * four values is active at any time, so no reachable state renders two of
 * the modal's mutually exclusive branches together.
 */
export type LookupState = 'idle' | 'loading' | 'resolved' | 'failed';

/**
 * The confirmed candidate's full known MyAnimeList data -- the detail page's
 * mapped fields (design's Field Mapping table), still in MyAnimeList's own
 * vocabulary, plus the cover URL already available from the search payload
 * (the caller merges the selected {@link AnimeMetadataCandidate}'s `image`
 * in before calling {@link toAnimeMetadataSelection}, so no extra fetch is
 * needed to resolve a cover). This is hop one's only input; it carries no
 * `status` field at all -- MyAnimeList's airing `Status:` is discarded one
 * package upstream (`internal/myanimelist/detail.go`) and has no path into
 * this shape, which is what makes the estado mapping trap structurally
 * unavailable rather than merely documented (design's Technical Approach).
 */
export interface AnimeMetadataDetail {
  readonly title: string;
  readonly type?: string;
  readonly episodes?: string;
  readonly duration?: string;
  readonly source?: string;
  readonly genres?: readonly string[];
  readonly studios?: readonly string[];
  readonly coverURL?: string;
}

/**
 * The pre-image and audit trail of one applied metadata patch (design D9).
 * Generic over the feature's own patch shape so Create and Editor share one
 * type instead of each declaring its own (Task-Planning Note A). `previous`
 * holds the *current* draft value for exactly the keys `patch` touches,
 * letting Undo replay it through the same channel the user's own typing
 * uses -- never a full draft snapshot, which would also revert unrelated
 * edits made after the autofill.
 */
export interface AppliedMetadata<TPatch> {
  readonly patch: TPatch;
  readonly previous: TPatch;
  readonly appliedFields: readonly (keyof TPatch)[];
  readonly unfilled: readonly string[];
}
