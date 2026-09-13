import { Button, cn, Typography } from '@heroui/react';
import { AnimeCoverPlaceholder } from '../../../ui/AnimeCoverPlaceholder';
import type { AnimeMetadataCandidate } from '../../metadata-lookup.types';
import { METADATA_LOOKUP_CANDIDATE_ROW_CLASS } from './anime-metadata-lookup.constants';

/** Presentation-only inputs for one candidate row in the lookup modal's list. */
export interface AnimeMetadataLookupCandidateProps {
  /** The MyAnimeList search result this row renders, in its own vocabulary. */
  readonly candidate: AnimeMetadataCandidate;
  /** Whether this is the row the user has currently highlighted. */
  readonly isSelected: boolean;
  /** Invoked with the candidate's `malId` when the row is pressed. */
  readonly onSelect: (malId: number) => void;
}

/**
 * Formats a candidate's subtitle line -- format, year, and score -- from
 * fields the search payload alone already carries, so this row never needs
 * a detail-page fetch to render (design's Field Mapping table: `mediaType`,
 * `startYear` and `score` all come from `prefix.json`).
 * @param candidate The candidate whose subtitle is being built.
 * @returns The parts joined by " · ", or `''` when MyAnimeList reported none of them.
 */
function formatCandidateSubtitle(candidate: AnimeMetadataCandidate): string {
  return [candidate.mediaType, candidate.startYear?.toString(), candidate.score]
    .filter((part): part is string => part !== undefined && part !== '')
    .join(' · ');
}

/**
 * One selectable candidate row: cover thumbnail, title, and its
 * format/year/score subtitle. Pressing it only highlights it -- it fires no
 * detail fetch and writes nothing to any draft on its own
 * (`anime-metadata-autofill` spec, "Browsing candidates writes nothing").
 */
export function AnimeMetadataLookupCandidate({
  candidate,
  isSelected,
  onSelect,
}: Readonly<AnimeMetadataLookupCandidateProps>) {
  const subtitle = formatCandidateSubtitle(candidate);

  return (
    <Button
      aria-pressed={isSelected}
      className={cn(
        METADATA_LOOKUP_CANDIDATE_ROW_CLASS,
        isSelected ? 'border-accent bg-accent/10' : undefined,
      )}
      variant="tertiary"
      onPress={() => onSelect(candidate.malId)}
    >
      {candidate.image === undefined ? (
        <AnimeCoverPlaceholder className="size-10 shrink-0 text-muted" />
      ) : (
        // `width`/`height` attributes (not just the `size-10` class) reserve this
        // box's layout space before the remote image resolves, and keep it
        // reserved if it never does -- measured against
        // `loading-skeletons-fixture.tsx` in headless Edge, where an <img> with
        // no network access otherwise collapsed the row well below its
        // skeleton placeholder's height.
        <img
          alt=""
          className="size-10 shrink-0 rounded object-cover"
          height={40}
          src={candidate.image}
          width={40}
        />
      )}
      <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
        <Typography className="whitespace-normal break-words" type="body-sm" weight="semibold">
          {candidate.name}
        </Typography>
        {subtitle === '' ? null : (
          <Typography color="muted" type="body-xs">
            {subtitle}
          </Typography>
        )}
      </div>
    </Button>
  );
}
