import { LookupCandidateRow } from '../../../ui/LookupModal/LookupCandidateRow';
import { formatCandidateSubtitle } from '../../metadata-lookup.helpers';
import type { AnimeMetadataLookupCandidateProps } from './anime-metadata-lookup.types';

/**
 * One selectable MyAnimeList candidate: the shared `LookupCandidateRow` fed
 * with the candidate's cover, title, and format/year/score subtitle. Pressing
 * it only highlights it -- it fires no detail fetch and writes nothing to any
 * draft on its own (`anime-metadata-autofill` spec, "Browsing candidates
 * writes nothing").
 */
export function AnimeMetadataLookupCandidate({
  candidate,
  isSelected,
  onSelect,
}: Readonly<AnimeMetadataLookupCandidateProps>) {
  return (
    <LookupCandidateRow
      image={candidate.image}
      isSelected={isSelected}
      subtitle={formatCandidateSubtitle(candidate)}
      title={candidate.name}
      onPress={() => onSelect(candidate.malId)}
    />
  );
}
