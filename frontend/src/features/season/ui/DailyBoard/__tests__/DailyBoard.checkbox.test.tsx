import { act, cleanup, fireEvent, render as renderBridge, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../shared/contracts/season.types';
import { BRIDGE_SEASON_SOURCE } from '../../../../../shared/query/bridge-runtime/bridge-runtime.constants';
import { SEASON_ANIMES_KEY } from '../../../../../shared/query/query-keys/query-keys.constants';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { resetSeasonStore, setSeasonStoreState } from '../../../../../shared/store/season-store/season-store.helpers';
import { DailyBoard } from '../DailyBoard';

// Integration test with the REAL useDailyBoard hook and the REAL HeroUI Checkbox
// (no hook mock) — this is the test that catches "the checkbox renders no
// clickable control": a bug a hook-only test structurally cannot see.

/** The season query client the board reads through, shared by every case. */
const { client, wrapper } = createModulesTestWrapper({ module: 'season', state: 'ready' });

/** Renders each board with the season query client its rows were seeded into. */
const render = (ui: ReactElement) => renderBridge(ui, { wrapper });

/** The Ver hoy subset download the real season port answers. */
const downloadSeasonAnimes = vi.fn().mockResolvedValue('ok');

beforeEach(() => {
  // The rows read stays pending, so the mount refresh never replaces seeded rows.
  vi.spyOn(BRIDGE_SEASON_SOURCE, 'readSeasonAnimes').mockImplementation(() => new Promise<never>(() => undefined));
  vi.spyOn(BRIDGE_SEASON_SOURCE, 'downloadSeasonAnimes').mockImplementation(downloadSeasonAnimes);
});

afterEach(() => {
  cleanup();
  client.clear();
  resetSeasonStore();
  downloadSeasonAnimes.mockClear();
  vi.restoreAllMocks();
});

/**
 * Seeds the created animes the board shows: the query cache the board reads,
 * plus the store fields a read-only season sets.
 * @param rows The created season rows.
 * @param store The store fields the case also sets.
 */
function seedBoard(rows: readonly SeasonAnimeRow[], store: Parameters<typeof setSeasonStoreState>[0] = {}): void {
  client.setQueryData(SEASON_ANIMES_KEY, rows);
  setSeasonStoreState(store);
}

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
  it('renders a real, clickable checkbox per Sin ver row', () => {
    seedBoard([createdRow('a', 'anime-a'), createdRow('b', 'anime-b')]);
    render(<DailyBoard />);

    // The bug was that no interactive checkbox rendered at all.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(2);
  });

  it('leads each Sin ver row with its checkbox, named by the anime, before the cover', () => {
    seedBoard([createdRow('a', 'anime-a')]);
    render(<DailyBoard />);

    const box = screen.getByRole('checkbox', { name: 'A' });
    const cover = within(screen.getByRole('list', { name: 'Sin ver' })).getByTestId('season-cover-thumb');
    expect(box.compareDocumentPosition(cover) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('selecting a checkbox enables both send actions, with no selected-count text', () => {
    seedBoard([createdRow('a', 'anime-a')]);
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
  it('checks Ver hoy animes, before their covers, and downloads only those', async () => {
    seedBoard([createdRow('b', 'anime-b', 'Ver hoy'), createdRow('c', 'anime-c', 'Ver hoy'), createdRow('d', 'anime-d', 'Visto')]);
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
    seedBoard([createdRow('b', 'anime-b', 'Ver hoy')], { readOnly: true });
    render(<DailyBoard />);

    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
