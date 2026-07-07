import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RateAnimeModal } from '../RateAnimeModal';
import { useRateAnimeModal } from '../use-rate-anime-modal';

vi.mock('../use-rate-anime-modal', () => ({
  useRateAnimeModal: vi.fn(() => ({ onSelectGrade: vi.fn() })),
}));

vi.mocked(useRateAnimeModal);

describe('RateAnimeModal', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a "Rate" trigger for an ungraded anime', () => {
    render(<RateAnimeModal animeId="anime-a" rawName="Anime A" currentGrade={0} gradeSource="" />);
    expect(screen.getByRole('button', { name: 'Rate Anime A' })).toBeInTheDocument();
  });

  it('shows the current grade on the trigger when graded', () => {
    render(<RateAnimeModal animeId="anime-a" rawName="Anime A" currentGrade={4} gradeSource="manual" />);
    expect(screen.getByRole('button', { name: 'Rate Anime A' })).toHaveTextContent('Grade 4');
  });
});
