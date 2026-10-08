import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

  it('renders a tertiary "Rate" trigger for an ungraded anime by default', () => {
    render(<RateAnimeModal animeId="anime-a" rawName="Anime A" currentGrade={0} gradeSource="" />);
    const trigger = screen.getByRole('button', { name: 'Rate Anime A' });
    expect(trigger).toHaveTextContent('Rate');
    expect(trigger.className).toContain('button--tertiary');
  });

  it.each([1, 4])('shows the current grade %i on the default trigger when graded', (grade) => {
    render(<RateAnimeModal animeId="anime-a" rawName="Anime A" currentGrade={grade} gradeSource="manual" />);
    expect(screen.getByRole('button', { name: 'Rate Anime A' })).toHaveTextContent(`Grade ${grade}`);
  });

  it('renders the rate variant as a secondary "Rate" button that opens the dialog', () => {
    render(<RateAnimeModal animeId="anime-a" rawName="Anime A" currentGrade={0} gradeSource="" triggerVariant="rate" />);
    const trigger = screen.getByRole('button', { name: 'Rate Anime A' });
    expect(trigger).toHaveTextContent('Rate');
    expect(trigger.className).toContain('button--secondary');

    fireEvent.click(trigger);

    expect(screen.getByRole('radiogroup', { name: 'Grade for Anime A' })).toBeInTheDocument();
  });

  it('renders the icon variant as an icon-only "Change grade" button that opens the dialog', () => {
    render(<RateAnimeModal animeId="anime-a" rawName="Anime A" currentGrade={5} gradeSource="manual" triggerVariant="icon" />);
    const trigger = screen.getByRole('button', { name: 'Change grade for Anime A' });
    expect(trigger).not.toHaveTextContent('Grade 5');
    expect(trigger.className).toContain('button--tertiary');

    fireEvent.click(trigger);

    expect(screen.getByRole('radiogroup', { name: 'Grade for Anime A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Grade 5' }).className).toContain('button--primary');
  });
});
