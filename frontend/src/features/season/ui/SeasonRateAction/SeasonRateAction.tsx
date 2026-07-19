import { RateAnimeModal } from '../RateAnimeModal/RateAnimeModal';
import type { SeasonRateActionProps } from './season-rate-action.types';
import { useSeasonRateAction } from './use-season-rate-action';

/**
 * SeasonRateAction is the season grade action embedded in the Episodes card: it
 * renders the shared RateAnimeModal only when a season is open and the anime is a
 * created candidate, and nothing otherwise. It encapsulates all season-awareness
 * so the Episodes card stays dumb and feature-agnostic (it passes id + name).
 */
export function SeasonRateAction({ animeId, rawName }: Readonly<SeasonRateActionProps>) {
  const { candidate } = useSeasonRateAction(animeId);

  if (candidate === undefined) {
    return null;
  }

  return (
    <RateAnimeModal
      animeId={animeId}
      currentGrade={candidate.grade}
      gradeSource={candidate.gradeSource}
      rawName={rawName}
    />
  );
}
