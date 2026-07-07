import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { resetSeasonStore, useSeasonStore } from '../../../../../shared/store/season-store';
import { DailyBoard } from '../DailyBoard';

// Integration test with the REAL useDailyBoard hook and the REAL HeroUI Checkbox
// (no hook mock) — this is the test that catches "the checkbox renders no
// clickable control": a bug a hook-only test structurally cannot see.

function createdRow(id: string, animeId: string): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableChapters: 0,
    animeId,
    section: 'Sin ver',
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
    useSeasonStore.setState({ seasonAnimes: [createdRow('a', 'anime-a'), createdRow('b', 'anime-b')] });
    render(<DailyBoard />);

    // The bug was that no interactive checkbox rendered at all.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
  });

  it('selecting a checkbox updates the "selected for today" count and enables Send', () => {
    useSeasonStore.setState({ seasonAnimes: [createdRow('a', 'anime-a')] });
    render(<DailyBoard />);

    expect(screen.getByText('0 selected for today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Ver hoy' })).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox'));

    expect(screen.getByText('1 selected for today')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send to Ver hoy' })).toBeEnabled();
  });
});
