import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { DailyBoard } from '../DailyBoard';

// Integration test with the REAL useDailyBoard hook and the REAL HeroUI Checkbox
// (no hook mock) — this is the test that catches "the checkbox renders no
// clickable control": a bug a hook-only test structurally cannot see.

// The real hook refreshes the rows on mount through the season port. Keep that
// read pending so it can never replace the rows each case seeds in the store.
vi.mock('../../../../../infrastructure/season-source/season-source.helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../infrastructure/season-source/season-source.helpers')>();
  return {
    ...actual,
    seasonSource: { ...actual.seasonSource, getSeasonAnimes: () => new Promise<never>(() => undefined) },
  };
});

/** Builds a created Sin ver row for the real store. */
function createdRow(id: string, animeId: string): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section: 'Sin ver', sectionOrder: 0,
    grade: 0,
    gradeSource: '',
    skipGrading: false,
    consideration: 'none',
  };
}

describe('DailyBoard Sin ver checkboxes (real component)', () => {
  afterEach(() => {
    cleanup();
    resetSeasonStore();
  });

  it('renders a real, clickable checkbox per Sin ver row', () => {
    setSeasonStoreState({ seasonAnimes: [createdRow('a', 'anime-a'), createdRow('b', 'anime-b')] });
    render(<DailyBoard />);

    // The bug was that no interactive checkbox rendered at all.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
  });

  it('selecting a checkbox enables both send actions, with no selected-count text', () => {
    setSeasonStoreState({ seasonAnimes: [createdRow('a', 'anime-a')] });
    render(<DailyBoard />);

    /** The two Sin ver send actions, in footer order. */
    const sendButtons = () => [
      screen.getByRole('button', { name: 'Send to Ver hoy' }),
      screen.getByRole('button', { name: 'Send & download now' }),
    ];
    sendButtons().forEach((button) => expect(button).toBeDisabled());

    fireEvent.click(screen.getByRole('checkbox'));

    sendButtons().forEach((button) => expect(button).toBeEnabled());
    expect(screen.queryByText(/selected for today/)).toBeNull();
  });
});
