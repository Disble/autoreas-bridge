import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from './bridge-runtime-source.test-support';

describe('bridge-runtime-source anime editor bindings', () => {
  useIsolatedWailsRuntime();

  it('calls the anime editor bindings once Go bindings become ready', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const record = {
      animeId: 'anime-1',
      modifiedAt: 123,
      frequent: { name: 'Frieren', status: 0, progress: 2, active: true, placements: [] },
      details: { genres: [], studios: { kind: 'missing', values: [] } },
    };
    const getAnimeEditorRecordMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'loaded',
      record: {
        animeId: 'anime-1',
        modifiedAt: 123,
        frequent: {
          name: 'Frieren', status: 0, progress: 2, active: true, placements: [],
          totalEpisodes: { kind: 'missing' }, kind: { kind: 'missing' }, sourceUrl: { kind: 'missing' }, folder: { kind: 'missing' },
        },
        details: {
          premieredAt: { kind: 'missing' }, duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });
    const saveAnimeEditorMock = vi.fn().mockResolvedValue({
      animeId: 'anime-1',
      outcome: 'conflict',
      message: 'current authority won',
      modifiedAt: 200,
      record: {
        animeId: 'anime-1', modifiedAt: 200,
        frequent: {
          name: 'Authority', status: 0, progress: 3, active: true, placements: [],
          totalEpisodes: { kind: 'missing' }, kind: { kind: 'missing' }, sourceUrl: { kind: 'missing' }, folder: { kind: 'missing' },
        },
        details: {
          premieredAt: { kind: 'missing' }, duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });
    const deactivateAnimeMock = vi.fn().mockResolvedValue({ animeId: 'anime-1', outcome: 'applied', message: 'deactivated', modifiedAt: 201 });
    const getBoardMock = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'loaded', board: { originAnimeId: 'anime-1', boardModifiedAt: 123, destinations: [], entries: [] } });
    const refreshedBoard = { originAnimeId: 'anime-1', boardModifiedAt: 202, destinations: [], entries: [] };
    const applyBoardMock = vi.fn().mockResolvedValue({ outcome: 'conflict', message: 'board changed', modifiedAt: 202, board: refreshedBoard });

    const recordPromise = source.getAnimeEditorRecord?.('anime-1');
    const savePromise = source.saveAnimeEditor?.({
      animeId: 'anime-1',
      baseModifiedAt: 100,
      patch: {
        page: { present: false, clear: false, value: '' },
        folder: { present: false, clear: false, value: '' },
        origin: { present: false, clear: false, value: '' },
        duration: { present: false, clear: false, value: '' },
        kind: { present: false, clear: false, value: '' },
        premieredAt: { present: false, clear: false, value: '' },
        cover: { present: false, clear: false, type: '', path: '' },
      },
    });
    const deactivatePromise = source.deactivateAnime?.('anime-1', 100);
    const boardPromise = source.getAnimeEditorScheduleBoard?.('anime-1');
    const applyPromise = source.applyAnimeEditorSchedule?.({ boardModifiedAt: 123, entries: [] });

    window.go = {
      desktop: {
        App: {
          ApplyAnimeEditorSchedule: applyBoardMock,
          DeactivateAnime: deactivateAnimeMock,
          GetAnimeEditorRecord: getAnimeEditorRecordMock,
          GetAnimeEditorScheduleBoard: getBoardMock,
          SaveAnimeEditor: saveAnimeEditorMock,
        },
      },
    } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(recordPromise).resolves.toEqual(expect.objectContaining({ outcome: 'applied', message: 'loaded', record }));
    await expect(savePromise).resolves.toEqual(expect.objectContaining({
      animeId: 'anime-1',
      outcome: 'conflict',
      message: 'current authority won',
      modifiedAt: 200,
      record: expect.objectContaining({ animeId: 'anime-1', modifiedAt: 200 }),
    }));
    await expect(deactivatePromise).resolves.toEqual(expect.objectContaining({ animeId: 'anime-1', outcome: 'applied', message: 'deactivated', modifiedAt: 201 }));
    await expect(boardPromise).resolves.toEqual({ outcome: 'applied', message: 'loaded', board: { originAnimeId: 'anime-1', boardModifiedAt: 123, destinations: [], entries: [] } });
    await expect(applyPromise).resolves.toEqual(expect.objectContaining({ outcome: 'conflict', message: 'board changed', modifiedAt: 202, board: refreshedBoard }));
    expect(getAnimeEditorRecordMock).toHaveBeenCalledWith('anime-1');
    expect(saveAnimeEditorMock).toHaveBeenCalledWith(expect.objectContaining({
      animeId: 'anime-1',
      patch: expect.objectContaining({ page: { present: false, clear: false, value: '' } }),
    }));
    expect(deactivateAnimeMock).toHaveBeenCalledWith('anime-1', 100);
    expect(getBoardMock).toHaveBeenCalledWith('anime-1');
    expect(applyBoardMock).toHaveBeenCalledWith({ boardModifiedAt: 123, entries: [] });
  });

  it('passes every reindexed schedule entry to the Wails binding', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    const applyBoardMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'apply_schedule applied',
      modifiedAt: 310,
      board: { originAnimeId: 'bang-dream', boardModifiedAt: 310, destinations: [], entries: [] },
    });

    const applyPromise = source.applyAnimeEditorSchedule?.({
      boardModifiedAt: 300,
      entries: [
        { animeId: 'youjo-senki-ii', baseModifiedAt: 103, placements: [{ day: 'Sin ver', order: 1 }] },
        { animeId: 'bang-dream', baseModifiedAt: 104, placements: [{ day: 'Visto', order: 1 }] },
        { animeId: 'yani-neko', baseModifiedAt: 102, placements: [{ day: 'Visto', order: 2 }] },
        { animeId: 'sayonara-lara', baseModifiedAt: 101, placements: [{ day: 'Visto', order: 3 }] },
        { animeId: 'futsutsuka', baseModifiedAt: 105, placements: [{ day: 'Visto', order: 4 }] },
        { animeId: 'iwamoto', baseModifiedAt: 106, placements: [{ day: 'Visto', order: 5 }] },
        { animeId: 'tai-ari', baseModifiedAt: 107, placements: [{ day: 'Visto', order: 6 }] },
        { animeId: 'tenmaku', baseModifiedAt: 108, placements: [{ day: 'Visto', order: 7 }] },
      ],
    });

    window.go = { desktop: { App: { ApplyAnimeEditorSchedule: applyBoardMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(applyPromise).resolves.toEqual(expect.objectContaining({
      outcome: 'applied',
      modifiedAt: 310,
      board: expect.objectContaining({ boardModifiedAt: 310 }),
    }));
    expect(applyBoardMock).toHaveBeenCalledWith({
      boardModifiedAt: 300,
      entries: [
        { animeId: 'youjo-senki-ii', baseModifiedAt: 103, placements: [{ day: 'Sin ver', order: 1 }] },
        { animeId: 'bang-dream', baseModifiedAt: 104, placements: [{ day: 'Visto', order: 1 }] },
        { animeId: 'yani-neko', baseModifiedAt: 102, placements: [{ day: 'Visto', order: 2 }] },
        { animeId: 'sayonara-lara', baseModifiedAt: 101, placements: [{ day: 'Visto', order: 3 }] },
        { animeId: 'futsutsuka', baseModifiedAt: 105, placements: [{ day: 'Visto', order: 4 }] },
        { animeId: 'iwamoto', baseModifiedAt: 106, placements: [{ day: 'Visto', order: 5 }] },
        { animeId: 'tai-ari', baseModifiedAt: 107, placements: [{ day: 'Visto', order: 6 }] },
        { animeId: 'tenmaku', baseModifiedAt: 108, placements: [{ day: 'Visto', order: 7 }] },
      ],
    });
  });

  it('maps a value-kind zero tipo to a concrete 0 across the wire boundary', async () => {
    const { createBridgeRuntimeSource } = await import('../bridge-runtime-source/bridge-runtime-source.helpers');
    const { WAILS_BINDINGS_POLL_MS } = await import('../wails-bindings.helpers');
    const source = createBridgeRuntimeSource();
    // Reproduces the reported bug's payload: the backend reports tipo=0
    // ("Anime (TV)") as an explicit value-kind zero. The mapper must surface it
    // as frequent.kind === 0, never drop it to undefined (which rendered the
    // Type field empty and forced an endless no_op save loop).
    const getAnimeEditorRecordMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'loaded',
      record: {
        animeId: 'anime-1',
        modifiedAt: 123,
        frequent: {
          name: 'BanG Dream', status: 0, progress: 1, active: true, placements: [],
          totalEpisodes: { kind: 'value', value: 0 }, kind: { kind: 'value', value: 0 },
          sourceUrl: { kind: 'value', value: 'https://example.test/x' }, folder: { kind: 'value', value: 'D:/Anime/x' },
        },
        details: {
          premieredAt: { kind: 'value', unixMilli: 0 }, duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });

    const recordPromise = source.getAnimeEditorRecord?.('anime-1');

    window.go = { desktop: { App: { GetAnimeEditorRecord: getAnimeEditorRecordMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    const result = await recordPromise;
    expect(result?.record?.frequent.kind).toBe(0);
    expect(result?.record?.frequent.totalEpisodes).toBe(0);
    expect(result?.record?.details.premieredAt).toBe(0);
  });
});
