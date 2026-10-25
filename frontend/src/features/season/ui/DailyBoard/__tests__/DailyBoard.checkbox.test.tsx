import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { DailyBoard } from '../DailyBoard';

// Integration test with the REAL useDailyBoard hook and the REAL HeroUI Checkbox
// (no hook mock) — this is the test that catches "the checkbox renders no
// clickable control": a bug a hook-only test structurally cannot see.

/** The Ver hoy subset download the real season port is spied through. */
const { downloadSeasonAnimes } = vi.hoisted(() => ({ downloadSeasonAnimes: vi.fn().mockResolvedValue('ok') }));

// The real hook refreshes the rows on mount through the season port. Keep that
// read pending so it can never replace the rows each case seeds in the store.
vi.mock('../../../../../infrastructure/season-source/season-source.helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../infrastructure/season-source/season-source.helpers')>();
  return {
    ...actual,
    seasonSource: { ...actual.seasonSource, getSeasonAnimes: () => new Promise<never>(() => undefined), downloadSeasonAnimes },
  };
});

/** Builds a created row in the given section for the real store. */
function createdRow(id: string, animeId: string, section = 'Sin ver'): SeasonAnimeRow {
  return {
    id,
    rawName: id.toUpperCase(),
    matchStatus: 'matched',
    matchedSlug: 'x',
    candidates: [],
    availability: 'created', availableEpisodes: 0,
    animeId,
    section, sectionOrder: 0,
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

  it('leads each Sin ver row with its checkbox, named by the anime, before the cover', () => {
    setSeasonStoreState({ seasonAnimes: [createdRow('a', 'anime-a')] });
    render(<DailyBoard />);

    const box = screen.getByRole('checkbox', { name: 'A' });
    const cover = within(screen.getByRole('list', { name: 'Sin ver' })).getByTestId('season-cover-thumb');
    expect(box.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe('DailyBoard Ver hoy checkboxes (real component)', () => {
  afterEach(() => {
    cleanup();
    resetSeasonStore();
    downloadSeasonAnimes.mockClear();
  });

  it('checks Ver hoy animes, before their covers, and downloads only those', async () => {
    setSeasonStoreState({
      seasonAnimes: [createdRow('b', 'anime-b', 'Ver hoy'), createdRow('c', 'anime-c', 'Ver hoy'), createdRow('d', 'anime-d', 'Visto')],
    });
    render(<DailyBoard />);

    const verHoy = within(screen.getByRole('list', { name: 'Ver hoy' }));
    expect(verHoy.getAllByRole('checkbox')).toHaveLength(2);
    expect(within(screen.getByRole('list', { name: 'Visto' })).queryByRole('checkbox')).toBeNull();
    const box = verHoy.getByRole('checkbox', { name: 'C' });
    expect(box.compareDocumentPosition(verHoy.getAllByTestId('season-cover-thumb')[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const download = screen.getByRole('button', { name: 'Download now' });
    expect(download).toBeDisabled();
    fireEvent.click(box);
    expect(download).toBeEnabled();

    await act(async () => {
      fireEvent.click(download);
    });

    expect(downloadSeasonAnimes).toHaveBeenCalledWith(['anime-c']);
  });

  it('renders no Ver hoy checkbox in a read-only season', () => {
    setSeasonStoreState({ readOnly: true, seasonAnimes: [createdRow('b', 'anime-b', 'Ver hoy')] });
    render(<DailyBoard />);

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
