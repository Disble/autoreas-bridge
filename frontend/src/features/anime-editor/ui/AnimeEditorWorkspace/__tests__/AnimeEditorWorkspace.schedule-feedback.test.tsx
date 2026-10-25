import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRecord, AnimeEditorScheduleBoard } from '../../../../../shared/contracts/anime.types';
import type { AnimeScheduleOrderingTestDriverRef } from '../../../../../shared/ordering/ui/AnimeScheduleOrdering/anime-schedule-ordering.types';

/** Hoisted mocks and the schedule entries the apply assertion expects. */
const { expectedScheduleEntries, fakeSource, getAnimeEditorRecordMock, getAnimeEditorScheduleBoardMock, applyAnimeEditorScheduleMock } = vi.hoisted(() => {
  const getAnimeEditorRecordMock = vi.fn();
  const getAnimeEditorScheduleBoardMock = vi.fn();
  const applyAnimeEditorScheduleMock = vi.fn();
  const expectedScheduleEntries = [
    { animeId: 'youjo-senki-ii', baseModifiedAt: 103, placements: [{ day: 'Sin ver', order: 1 }] },
    { animeId: 'bang-dream', baseModifiedAt: 104, placements: [{ day: 'Visto', order: 1 }] },
    { animeId: 'yani-neko', baseModifiedAt: 102, placements: [{ day: 'Visto', order: 2 }] },
    { animeId: 'sayonara-lara', baseModifiedAt: 101, placements: [{ day: 'Visto', order: 3 }] },
    { animeId: 'futsutsuka', baseModifiedAt: 105, placements: [{ day: 'Visto', order: 4 }] },
    { animeId: 'iwamoto', baseModifiedAt: 106, placements: [{ day: 'Visto', order: 5 }] },
    { animeId: 'tai-ari', baseModifiedAt: 107, placements: [{ day: 'Visto', order: 6 }] },
    { animeId: 'tenmaku', baseModifiedAt: 108, placements: [{ day: 'Visto', order: 7 }] },
  ] as const;
  const noop = () => Promise.resolve(undefined);
  const fakeSource = {
    getAnimes: vi.fn().mockResolvedValue([
      { id: 'bang-dream', name: 'BanG Dream! YumemoMita', status: 0, episodesWatched: 0, active: 1, days: [{ day: 'Sin ver', order: 4 }], genres: [], hasDownloadPage: true, hasFolder: true },
      { id: 'sayonara-lara', name: 'Sayonara Lara', status: 0, episodesWatched: 0, active: 1, days: [{ day: 'Sin ver', order: 1 }], genres: [], hasDownloadPage: true, hasFolder: true },
      { id: 'yani-neko', name: 'Yani Neko', status: 0, episodesWatched: 0, active: 1, days: [{ day: 'Sin ver', order: 2 }], genres: [], hasDownloadPage: true, hasFolder: true },
    ]),
    getAnimeEditorRecord: getAnimeEditorRecordMock,
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: getAnimeEditorScheduleBoardMock,
    applyAnimeEditorSchedule: applyAnimeEditorScheduleMock,
    pickFolder: vi.fn().mockResolvedValue(''),
    pickFile: vi.fn().mockResolvedValue(''),
  };
  return {
    expectedScheduleEntries,
    fakeSource: new Proxy(fakeSource, { get: (target, key) => Reflect.get(target, key) ?? noop }),
    getAnimeEditorRecordMock,
    getAnimeEditorScheduleBoardMock,
    applyAnimeEditorScheduleMock,
  };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: fakeSource,
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';
import { createEmptyEpisodeDurationSource } from './episode-duration-source.test-support';

/** The Episodes section's in-memory source, so no render waits on a Wails binding. */
const episodeSource = createEmptyEpisodeDurationSource();

/**
 * Builds the editor record the workspace loads under test.
 * @returns A minimal valid editor record.
 */
function makeRecord(): AnimeEditorRecord {
  return {
    animeId: 'bang-dream',
    modifiedAt: 104,
    frequent: {
      name: 'BanG Dream! YumemoMita',
      status: 0,
      progress: 0,
      totalEpisodes: 13,
      active: true,
      kind: 1,
      page: '',
      folder: '',
      placements: [
        { day: 'Sin ver', order: 4 },
      ],
    },
    details: { genres: [], studios: { kind: 'missing', values: [] } },
  };
}

/**
 * Builds a schedule board stamped with a given modification time, so staleness
 * paths can be driven deterministically.
 * @param boardModifiedAt The board modification timestamp.
 * @returns A schedule board fixture.
 */
function makeBoard(boardModifiedAt: number): AnimeEditorScheduleBoard {
  return {
    originAnimeId: 'bang-dream',
    boardModifiedAt,
    destinations: [
      { id: 'Domingo', label: 'Domingo', kind: 'weekday' },
      { id: 'Sin ver', label: 'Sin ver', kind: 'special' },
      { id: 'Visto', label: 'Visto', kind: 'special' },
    ],
    entries: [
      {
        animeId: 'sayonara-lara',
        name: 'Sayonara Lara',
        active: true,
        modifiedAt: 101,
        placements: [{ day: 'Sin ver', order: 1 }],
        status: 0,
        progress: 0,
        originHighlighted: false,
      },
      {
        animeId: 'yani-neko',
        name: 'Yani Neko',
        active: true,
        modifiedAt: 102,
        placements: [{ day: 'Sin ver', order: 2 }],
        status: 0,
        progress: 0,
        originHighlighted: false,
      },
      {
        animeId: 'youjo-senki-ii',
        name: 'Youjo Senki II',
        active: true,
        modifiedAt: 103,
        placements: [{ day: 'Sin ver', order: 3 }],
        status: 0,
        progress: 0,
        originHighlighted: false,
      },
      {
        animeId: 'bang-dream',
        name: 'BanG Dream! YumemoMita',
        active: true,
        modifiedAt: 104,
        placements: [{ day: 'Sin ver', order: 4 }],
        status: 0,
        progress: 0,
        originHighlighted: true,
      },
      {
        animeId: 'futsutsuka',
        name: 'Futsutsuka...',
        active: true,
        modifiedAt: 105,
        placements: [{ day: 'Visto', order: 1 }],
        status: 1,
        progress: 12,
        originHighlighted: false,
      },
      {
        animeId: 'iwamoto',
        name: 'Iwamoto...',
        active: true,
        modifiedAt: 106,
        placements: [{ day: 'Visto', order: 2 }],
        status: 1,
        progress: 12,
        originHighlighted: false,
      },
      {
        animeId: 'tai-ari',
        name: 'Tai-Ari...',
        active: true,
        modifiedAt: 107,
        placements: [{ day: 'Visto', order: 3 }],
        status: 1,
        progress: 12,
        originHighlighted: false,
      },
      {
        animeId: 'tenmaku',
        name: 'Tenmaku...',
        active: true,
        modifiedAt: 108,
        placements: [{ day: 'Visto', order: 4 }],
        status: 1,
        progress: 12,
        originHighlighted: false,
      },
      {
        animeId: 'domingo-legacy',
        name: 'Sunday Legacy',
        active: true,
        modifiedAt: 109,
        placements: [{ day: 'Domingo', order: 2 }],
        status: 0,
        progress: 1,
        originHighlighted: false,
      },
    ],
  };
}

describe('AnimeEditorWorkspace schedule feedback (integration)', () => {
  beforeEach(() => {
    getAnimeEditorRecordMock.mockReset();
    getAnimeEditorScheduleBoardMock.mockReset();
    applyAnimeEditorScheduleMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows the season section the selected anime sits in on the Schedule card, ranked when it is on the board', async () => {
    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: makeRecord() });
    getAnimeEditorScheduleBoardMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', board: makeBoard(300) });

    render(<MemoryRouter><AnimeEditorWorkspace episodeSource={episodeSource} /></MemoryRouter>);

    const season = await screen.findByRole('list', { name: 'Season placement' }, { timeout: 4000 });
    expect(within(season).getByRole('listitem', { name: 'Sin ver: 4 of 4' })).toBeInTheDocument();
    expect(within(season).getByRole('listitem', { name: 'Visto: not scheduled' })).toBeInTheDocument();
  });

  it('paints the saved season section of an anime the board leaves out, such as a history anime', async () => {
    const withoutSelected = makeBoard(300);
    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: makeRecord() });
    getAnimeEditorScheduleBoardMock.mockResolvedValue({
      outcome: 'applied',
      message: 'loaded',
      board: { ...withoutSelected, entries: withoutSelected.entries.filter((item) => item.animeId !== 'bang-dream') },
    });

    render(<MemoryRouter><AnimeEditorWorkspace episodeSource={episodeSource} /></MemoryRouter>);

    const season = await screen.findByRole('list', { name: 'Season placement' }, { timeout: 4000 });
    expect(await within(season).findByRole('listitem', { name: 'Sin ver: scheduled' })).toBeInTheDocument();
  });

  it('renders failure feedback after a rejected apply and hides the Schedule feedback alert after success', async () => {
    const initialBoard = makeBoard(300);
    const conflictBoard = makeBoard(301);
    const appliedBoard = makeBoard(302);
    const scheduleTestDriverRef: AnimeScheduleOrderingTestDriverRef = {};

    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: makeRecord() });
    getAnimeEditorScheduleBoardMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', board: initialBoard });
    applyAnimeEditorScheduleMock
      .mockResolvedValueOnce({ outcome: 'conflict', message: 'board changed', modifiedAt: 301, board: conflictBoard })
      .mockResolvedValueOnce({ outcome: 'applied', message: 'apply_schedule applied', modifiedAt: 302, board: appliedBoard });

    render(<MemoryRouter><AnimeEditorWorkspace episodeSource={episodeSource} scheduleTestDriverRef={scheduleTestDriverRef} /></MemoryRouter>);

    // This is the workspace's whole async bootstrap -- list fetch, selection,
    // then the detail form -- landing behind one assertion. The default second
    // is enough alone and not while the rest of the gate runs beside it, which
    // is why this test failed only inside the hook. The wait is widened, not
    // the test's own budget, which `no-restricted-syntax` rightly forbids.
    expect(await screen.findByDisplayValue('BanG Dream! YumemoMita', undefined, { timeout: 4000 })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open schedule editor' }));

    const dialog = await screen.findByRole('dialog');

    expect(within(dialog).getByRole('heading', { name: 'Anime schedule' })).toBeVisible();
    expect(within(dialog).getByText('Sin ver')).toBeVisible();
    expect(within(dialog).getByText('Visto')).toBeVisible();
    expect(within(dialog).getByText('Sayonara Lara')).toBeVisible();
    expect(within(dialog).getByText('Yani Neko')).toBeVisible();
    expect(within(dialog).getByText('BanG Dream! YumemoMita')).toBeVisible();
    expect(within(dialog).getByText('Futsutsuka...')).toBeVisible();
    expect(within(dialog).getByText('Tenmaku...')).toBeVisible();

    await waitFor(() => expect(scheduleTestDriverRef.current).toBeDefined());

    act(() => scheduleTestDriverRef.current?.moveAnime({ animeId: 'bang-dream', destinationId: 'Visto', order: 1 }));
    act(() => scheduleTestDriverRef.current?.moveAnime({ animeId: 'yani-neko', destinationId: 'Visto', order: 2 }));
    act(() => scheduleTestDriverRef.current?.moveAnime({ animeId: 'sayonara-lara', destinationId: 'Visto', order: 3 }));

    expect(within(dialog).getByText('8 schedule changes')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Apply schedule' }));

    expect(await within(dialog).findByText('Schedule feedback')).toBeVisible();
    expect(within(dialog).getByText('board changed')).toBeVisible();
    expect(applyAnimeEditorScheduleMock).toHaveBeenNthCalledWith(1, {
      boardModifiedAt: 300,
      entries: expectedScheduleEntries,
    });

    // The rejected apply also swaps the board, and the draft resets to it from
    // an effect. Driving the next batch before that reset lands discards its
    // first move, so wait for the board's own zero-change draft first.
    await waitFor(() => expect(within(dialog).getByText('0 schedule changes')).toBeVisible());

    act(() => scheduleTestDriverRef.current?.moveAnime({ animeId: 'bang-dream', destinationId: 'Visto', order: 1 }));
    act(() => scheduleTestDriverRef.current?.moveAnime({ animeId: 'yani-neko', destinationId: 'Visto', order: 2 }));
    act(() => scheduleTestDriverRef.current?.moveAnime({ animeId: 'sayonara-lara', destinationId: 'Visto', order: 3 }));

    fireEvent.click(screen.getByRole('button', { name: 'Apply schedule' }));

    await waitFor(() => expect(within(dialog).queryByText('Schedule feedback')).not.toBeInTheDocument());
    expect(within(dialog).queryByText('board changed')).not.toBeInTheDocument();
    expect(applyAnimeEditorScheduleMock).toHaveBeenNthCalledWith(2, {
      boardModifiedAt: 301,
      entries: expectedScheduleEntries,
    });
  });
});
