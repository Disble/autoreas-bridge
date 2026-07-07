import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { SeasonRateAction } from '../SeasonRateAction';
import { useSeasonRateAction } from '../use-season-rate-action';

vi.mock('../use-season-rate-action', () => ({ useSeasonRateAction: vi.fn() }));
vi.mock('../../RateAnimeModal/RateAnimeModal', () => ({
  RateAnimeModal: (props: { readonly currentGrade: number }) => (
    <div data-testid="rate-modal" data-grade={props.currentGrade} />
  ),
}));

const mockedUseSeasonRateAction = vi.mocked(useSeasonRateAction);

function candidate(grade: number): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Anime A',
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created',
    animeId: 'anime-a',
    section: 'Sin ver',
    grade,
    gradeSource: 'manual',
    skipGrading: false,
  };
}

describe('SeasonRateAction', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the rate modal when the anime is a season candidate', () => {
    mockedUseSeasonRateAction.mockReturnValue({ candidate: candidate(4) });
    render(<SeasonRateAction animeId="anime-a" rawName="Anime A" />);
    expect(screen.getByTestId('rate-modal')).toHaveAttribute('data-grade', '4');
  });

  it('renders nothing when the anime is not a season candidate', () => {
    mockedUseSeasonRateAction.mockReturnValue({ candidate: undefined });
    const { container } = render(<SeasonRateAction animeId="anime-x" rawName="Anime X" />);
    expect(container).toBeEmptyDOMElement();
  });
});
