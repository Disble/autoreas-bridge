import { describe, expect, it, vi } from 'vitest';
import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** One catalog row as the anime module's strict `getAnimes` answers it. */
const FRIEREN_ROW = { id: 'anime-1', name: 'Frieren' } as never;

/**
 * Builds a fresh Editor adapter from a fresh module graph, over a catalog read
 * that answers one row.
 */
async function importEditorSource() {
  const { createAnimeEditorSource } = await import('../anime-editor-source.helpers');
  return createAnimeEditorSource({ getAnimes: () => Promise.resolve([FRIEREN_ROW]) });
}

/** Builds a fresh desktop-actions adapter from a fresh module graph. */
async function importDesktopActionsSource() {
  const { createAnimeDesktopActionsSource } = await import('../anime-editor-source.helpers');
  return createAnimeDesktopActionsSource();
}

/** The empty patch a save carries when no field changed. */
const EMPTY_PATCH = {
  page: { present: false, clear: false, value: '' },
  folder: { present: false, clear: false, value: '' },
  origin: { present: false, clear: false, value: '' },
  duration: { present: false, clear: false, value: '' },
  kind: { present: false, clear: false, value: '' },
  cover: { present: false, clear: false, type: '', path: '' },
};

/** Calls every Editor and create binding of the adapter once. */
function callEveryEditorBinding(source: Awaited<ReturnType<typeof importEditorSource>>) {
  return [
    source.getAnimeEditorRecord('anime-1'),
    source.saveAnimeEditor({ animeId: 'anime-1', baseModifiedAt: 1, patch: EMPTY_PATCH }),
    source.deactivateAnime('anime-1', 1),
    source.getAnimeEditorScheduleBoard('anime-1'),
    source.applyAnimeEditorSchedule({ boardModifiedAt: 1, entries: [] }),
    source.createAnime({ creates: [], changedNeighbors: [] }),
  ];
}

/** Calls every desktop action of the adapter once. */
function callEveryDesktopAction(source: Awaited<ReturnType<typeof importDesktopActionsSource>>) {
  return [source.openAnimePage('anime-1'), source.copyAnimePage('anime-1'), source.openAnimeFolder('anime-1'), source.copyAnimeFolder('anime-1')];
}

describe('createAnimeEditorSource', () => {
  useIsolatedWailsRuntime();

  it('lists the catalog through the anime module read it was built over', async () => {
    await expect((await importEditorSource()).getAnimes()).resolves.toEqual([FRIEREN_ROW]);
  });

  it('rejects every call as unavailable when the bindings never attach, never with an error outcome', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const calls = callEveryEditorBinding(await importEditorSource()).map((call) =>
      expect(call).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) }),
    );
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await Promise.all(calls);
  });

  it('rejects every call with the module failure the binding rejected with', async () => {
    const failed = () => vi.fn().mockRejectedValue(new Error('{"code":"failed_precondition","message":"anime: db closed"}'));
    window.go = {
      desktop: {
        App: {
          GetAnimeEditorRecord: failed(), SaveAnimeEditor: failed(), DeactivateAnime: failed(),
          GetAnimeEditorScheduleBoard: failed(), ApplyAnimeEditorSchedule: failed(), CreateAnime: failed(),
        },
      },
    } as never;

    for (const call of callEveryEditorBinding(await importEditorSource())) {
      await expect(call).rejects.toMatchObject({ name: 'BridgeError', code: 'failed_precondition', message: 'anime: db closed' });
    }
  });

  it('calls the anime editor bindings once Go bindings become ready', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = await importEditorSource();
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
          duration: { kind: 'missing' }, origin: { kind: 'missing' },
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
          duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });
    const deactivateAnimeMock = vi.fn().mockResolvedValue({ animeId: 'anime-1', outcome: 'applied', message: 'deactivated', modifiedAt: 201 });
    const getBoardMock = vi.fn().mockResolvedValue({ outcome: 'applied', message: 'loaded', board: { originAnimeId: 'anime-1', boardModifiedAt: 123, destinations: [], entries: [] } });
    const refreshedBoard = { originAnimeId: 'anime-1', boardModifiedAt: 202, destinations: [], entries: [] };
    const applyBoardMock = vi.fn().mockResolvedValue({ outcome: 'conflict', message: 'board changed', modifiedAt: 202, board: refreshedBoard });

    const recordPromise = source.getAnimeEditorRecord('anime-1');
    const savePromise = source.saveAnimeEditor({
      animeId: 'anime-1',
      baseModifiedAt: 100,
      patch: {
        page: { present: false, clear: false, value: '' },
        folder: { present: false, clear: false, value: '' },
        origin: { present: false, clear: false, value: '' },
        duration: { present: false, clear: false, value: '' },
        kind: { present: false, clear: false, value: '' },
        cover: { present: false, clear: false, type: '', path: '' },
      },
    });
    const deactivatePromise = source.deactivateAnime('anime-1', 100);
    const boardPromise = source.getAnimeEditorScheduleBoard('anime-1');
    const applyPromise = source.applyAnimeEditorSchedule({ boardModifiedAt: 123, entries: [] });

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
    // The wire DTO must not carry an authored premieredAt at all: the backend
    // derives it from watched-progress transitions and ignores any writer value.
    const [wireSaveCommand] = saveAnimeEditorMock.mock.calls[0] as [{ readonly patch: Record<string, unknown> }];
    expect(wireSaveCommand.patch).not.toHaveProperty('premieredAt');
    expect(deactivateAnimeMock).toHaveBeenCalledWith('anime-1', 100);
    expect(getBoardMock).toHaveBeenCalledWith('anime-1');
    expect(applyBoardMock).toHaveBeenCalledWith({ boardModifiedAt: 123, entries: [] });
  });

  it('passes every reindexed schedule entry to the Wails binding', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = await importEditorSource();
    const applyBoardMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'apply_schedule applied',
      modifiedAt: 310,
      board: { originAnimeId: 'bang-dream', boardModifiedAt: 310, destinations: [], entries: [] },
    });

    const applyPromise = source.applyAnimeEditorSchedule({
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
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = await importEditorSource();
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
          duration: { kind: 'missing' }, origin: { kind: 'missing' },
          genres: { kind: 'value', values: [] }, studios: { kind: 'missing', values: [] }, cover: { kind: 'missing' },
        },
      },
    });

    const recordPromise = source.getAnimeEditorRecord('anime-1');

    window.go = { desktop: { App: { GetAnimeEditorRecord: getAnimeEditorRecordMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    const result = await recordPromise;
    expect(result.record?.frequent.kind).toBe(0);
    expect(result.record?.frequent.totalEpisodes).toBe(0);
    // The wire record still carries the key, but the frontend record drops it:
    // nothing in the editor reads or displays this value anymore.
    expect(result.record?.details).not.toHaveProperty('premieredAt');
  });

  it('calls CreateAnime once Go bindings become ready and maps the wire DTO', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const source = await importEditorSource();
    const createAnimeMock = vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'created',
      animeIds: ['anime-new-1'],
      modifiedAt: 555,
    });

    const createPromise = source.createAnime({
      creates: [
        {
          name: 'Frieren',
          page: 'https://example.test/frieren',
          placements: [{ day: 'Miércoles', order: 1 }],
          folder: 'D:/Anime/Frieren',
          kind: 0,
          episodesWatched: 2,
          totalEpisodes: 12,
          durationMinutes: 24,
          origin: 'Light novel',
          genres: ['Adventure', 'Drama'],
          studios: ['Madhouse'],
          cover: { type: 'image', path: 'D:/Anime/Frieren/cover.jpg' },
        },
      ],
      changedNeighbors: [
        { animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Miércoles', order: 2 }] },
      ],
    });

    window.go = { desktop: { App: { CreateAnime: createAnimeMock } } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(createPromise).resolves.toEqual({
      outcome: 'applied',
      message: 'created',
      animeIds: ['anime-new-1'],
      modifiedAt: 555,
    });
    expect(createAnimeMock).toHaveBeenCalledWith({
      creates: [
        {
          nombre: 'Frieren',
          pagina: 'https://example.test/frieren',
          dias: [{ day: 'Miércoles', order: 1 }],
          carpeta: 'D:/Anime/Frieren',
          tipo: 0,
          episodesWatched: 2,
          totalEpisodes: 12,
          durationMinutes: 24,
          origin: 'Light novel',
          genres: ['Adventure', 'Drama'],
          studios: ['Madhouse'],
          cover: { type: 'image', path: 'D:/Anime/Frieren/cover.jpg' },
        },
      ],
      changedNeighbors: [
        { animeId: 'existing-1', baseModifiedAt: 100, placements: [{ day: 'Miércoles', order: 2 }] },
      ],
    });
  });
});

describe('createAnimeDesktopActionsSource', () => {
  useIsolatedWailsRuntime();

  it('answers what each desktop action binding answers once it attaches', async () => {
    const { WAILS_BINDINGS_POLL_MS } = await import('../../wails-bindings.helpers');
    const ok = () => vi.fn().mockResolvedValue({ status: 'ok' });
    const bindings = { OpenAnimePage: ok(), CopyAnimePage: ok(), OpenAnimeFolder: ok(), CopyAnimeFolder: ok() };
    const calls = callEveryDesktopAction(await importDesktopActionsSource());
    window.go = { desktop: { App: bindings } } as never;

    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_POLL_MS);

    await expect(Promise.all(calls)).resolves.toEqual([{ status: 'ok' }, { status: 'ok' }, { status: 'ok' }, { status: 'ok' }]);
    for (const binding of Object.values(bindings)) expect(binding).toHaveBeenCalledExactlyOnceWith('anime-1');
  });

  it('rejects every action as unavailable when the bindings never attach', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const calls = callEveryDesktopAction(await importDesktopActionsSource()).map((call) =>
      expect(call).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) }),
    );
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await Promise.all(calls);
  });

  it('rejects every action with the BridgeError the binding rejected with', async () => {
    const missing = () => vi.fn().mockRejectedValue(new Error('{"code":"invalid_argument","message":"anime anime-1 has no folder"}'));
    window.go = { desktop: { App: { OpenAnimePage: missing(), CopyAnimePage: missing(), OpenAnimeFolder: missing(), CopyAnimeFolder: missing() } } } as never;

    for (const call of callEveryDesktopAction(await importDesktopActionsSource())) {
      await expect(call).rejects.toMatchObject({ name: 'BridgeError', code: 'invalid_argument', message: 'anime anime-1 has no folder' });
    }
  });
});
