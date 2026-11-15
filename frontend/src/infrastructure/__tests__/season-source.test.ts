import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeasonSource } from '../../shared/contracts/season.types';

/** The coded failure exactly as Wails rejects a season binding while the module starts. */
const SEASON_STARTING_REJECTION = '{"code":"unavailable","message":"season is starting"}';

/** Every season command: the binding it calls and how the source invokes it. */
const SEASON_COMMANDS: readonly (readonly [string, (source: SeasonSource) => Promise<string>])[] = [
  ['CreateSeason', (source) => source.createSeason('Julio 2026')],
  ['SetSeasonMinApprovalGrade', (source) => source.setMinApprovalGrade(4)],
  ['SetSeasonSlots', (source) => source.setSlots(12)],
  ['CloseSeason', (source) => source.closeSeason()],
  ['SetSeasonAnimeMetadata', (source) => source.setSeasonAnimeMetadata('sa-1', '')],
  ['ReconcileSeasonIntake', (source) => source.reconcileIntake('Naruto')],
  ['RunSeasonMatching', (source) => source.runMatching()],
  ['ResolveSeasonMatch', (source) => source.resolveMatch('sa-1', 'https://jkanime.net/naruto/')],
  ['DiscardSeasonName', (source) => source.discardName('sa-1')],
  ['RestoreSeasonName', (source) => source.restoreName('sa-1')],
  ['SetSeasonGrade', (source) => source.setGrade('anime-1', 5)],
  ['SkipSeasonGrading', (source) => source.skipGrading('sa-1')],
  ['SetSeasonConsideration', (source) => source.setConsideration('sa-1', 'none')],
  ['CreateSeasonAnimes', (source) => source.createSeasonAnimes(['sa-1'], {}, {})],
  ['SaveSeasonOrderingDraft', (source) => source.saveOrderingDraft('{}')],
  ['ReopenSeasonOrdering', (source) => source.reopenOrdering()],
  ['RecheckSeasonAvailability', (source) => source.recheckAvailability()],
];

/** Every season read: the binding it calls, how the source invokes it, and the fallback its consumers read. */
const SEASON_READS: readonly (readonly [string, (source: SeasonSource) => Promise<unknown>, unknown])[] = [
  ['GetSeason', (source) => source.getSeason(), null],
  ['GetSeasonAnimes', (source) => source.getSeasonAnimes(), []],
  ['ListSeasons', (source) => source.listSeasons(), []],
  ['GetPastSeason', (source) => source.getPastSeason('season-1'), null],
  ['GetPastSeasonAnimes', (source) => source.getPastSeasonAnimes('season-1'), []],
  ['GetSeasonOrderingBoard', (source) => source.getOrderingBoard(), { rail: [], grid: [] }],
  ['GetSeasonOrderingSnapshot', (source) => source.getSeasonOrderingSnapshot!('season-1'), { recorded: false, rail: [], grid: [] }],
];

/** Every season binding whose result carries a status: how the source invokes it, and its runtime-unavailable result. */
const SEASON_OUTCOMES: readonly (readonly [string, (source: SeasonSource) => Promise<unknown>, Record<string, unknown>])[] = [
  ['ApplySeasonSchedule', (source) => source.applySchedule(), { applied: 0, failed: [] }],
  ['ConfirmSeasonSelection', (source) => source.confirmSelection(), { approved: 0, rejected: 0, quotaExceeded: false }],
  ['SearchSeasonProviders', (source) => source.searchProviders!('Naruto'), { pages: [] }],
];

/** The ordering board's query reads: the binding each calls and how the source invokes it. */
const SEASON_ORDERING_QUERY_READS: readonly (readonly [string, (source: SeasonSource) => Promise<unknown>])[] = [
  ['GetSeasonOrderingBoard', (source) => source.fetchOrderingBoard!()],
  ['GetSeasonOrderingSnapshot', (source) => source.fetchSeasonOrderingSnapshot!('season-1')],
];

describe('season-source', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(window, 'go');
    Reflect.deleteProperty(window, 'runtime');
  });

  it('degrades read methods to safe defaults when the runtime is unavailable', async () => {
    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    const seasonPromise = source.getSeason();
    const animesPromise = source.getSeasonAnimes();
    const seasonsPromise = source.listSeasons();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(seasonPromise).resolves.toBeNull();
    await expect(animesPromise).resolves.toEqual([]);
    await expect(seasonsPromise).resolves.toEqual([]);
  });

  it('degrades mutators without calling a missing Wails binding', async () => {
    const createSeasonMock = vi.fn().mockResolvedValue('created');
    window.go = { desktop: { App: { CreateSeason: createSeasonMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const { SEASON_RUNTIME_UNAVAILABLE } = await import('../season-source/season-source.constants');
    const source = createSeasonSource();

    const resultPromise = source.closeSeason();

    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toBe(SEASON_RUNTIME_UNAVAILABLE);
    expect(createSeasonMock).not.toHaveBeenCalled();
  });

  it('forwards getSeason to the live Wails binding once it becomes ready', async () => {
    const season = {
      id: 'season-1',
      name: 'Winter 2026',
      minApprovalGrade: 4,
      slots: 12,
      status: 'open',
      createdAt: 1000,
    };
    const getSeasonMock = vi.fn().mockResolvedValue(season);

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    const resultPromise = source.getSeason();

    window.go = { desktop: { App: { GetSeason: getSeasonMock } } } as never;
    await vi.advanceTimersByTimeAsync(50);

    await expect(resultPromise).resolves.toEqual(season);
    expect(getSeasonMock).toHaveBeenCalledTimes(1);
  });

  it('preserves Wails collection and historical snapshot payloads once their bindings are ready', async () => {
    const season = {
      id: 'season-2025-fall',
      name: 'Fall 2025',
      minApprovalGrade: 3,
      slots: 10,
      status: 'closed',
      createdAt: 2000,
    };
    const seasonAnimes = [{ id: 'anime-1', name: 'Dandadan' }];
    const getSeasonAnimesMock = vi.fn().mockResolvedValue(seasonAnimes);
    const getPastSeasonMock = vi.fn().mockResolvedValue(season);
    const listSeasonsMock = vi.fn().mockResolvedValue([season]);
    window.go = {
      desktop: {
        App: {
          GetPastSeason: getPastSeasonMock,
          GetSeasonAnimes: getSeasonAnimesMock,
          ListSeasons: listSeasonsMock,
        },
      },
    } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    await expect(source.getSeasonAnimes()).resolves.toEqual(seasonAnimes);
    await expect(source.getPastSeason('season-2025-fall')).resolves.toEqual(season);
    await expect(source.listSeasons()).resolves.toEqual([season]);
    expect(getSeasonAnimesMock).toHaveBeenCalledTimes(1);
    expect(getPastSeasonMock).toHaveBeenCalledWith('season-2025-fall');
    expect(listSeasonsMock).toHaveBeenCalledTimes(1);
  });

  it('forwards getSeasonOrderingSnapshot to the live Wails binding and preserves the recorded payload', async () => {
    const snapshot = {
      recorded: true,
      capturedAt: 1_700_000_000_000,
      appliedAt: 1_699_000_000_000,
      rail: [{ animeId: 'anime-1', name: 'Dandadan', dia: '', orden: 0, section: 'Visto', isNewcomer: true }],
      grid: [],
    };
    const getSnapshotMock = vi.fn().mockResolvedValue(snapshot);
    window.go = { desktop: { App: { GetSeasonOrderingSnapshot: getSnapshotMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();
    const readSnapshot = source.getSeasonOrderingSnapshot;
    expect(readSnapshot).toBeDefined();

    await expect(readSnapshot!('season-2025-fall')).resolves.toEqual(snapshot);
    expect(getSnapshotMock).toHaveBeenCalledWith('season-2025-fall');
  });

  it('degrades getSeasonOrderingSnapshot to an unrecorded snapshot when the runtime is unavailable', async () => {
    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();
    const readSnapshot = source.getSeasonOrderingSnapshot;
    expect(readSnapshot).toBeDefined();

    const resultPromise = readSnapshot!('season-2025-fall');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toEqual({ recorded: false, rail: [], grid: [] });
  });

  it('forwards the create call with the picked rows, their folders and their metadata', async () => {
    const createMock = vi.fn().mockResolvedValue('ok');
    window.go = { desktop: { App: { CreateSeasonAnimes: createMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    const resultPromise = source.createSeasonAnimes(['sa-1', 'sa-2'], { 'sa-2': 'E:/Anime/Bleach' }, { 'sa-1': { totalEpisodes: 24, genres: ['Action'] } });

    await vi.advanceTimersByTimeAsync(5000);

    await expect(resultPromise).resolves.toBe('ok');
    // The metadata must travel as its own argument: dropping it here would silently
    // create animes without the fields the user confirmed.
    expect(createMock).toHaveBeenCalledWith(
      ['sa-1', 'sa-2'],
      { 'sa-2': 'E:/Anime/Bleach' },
      { 'sa-1': { totalEpisodes: 24, genres: ['Action'] } },
    );
  });

  it('degrades the create call to its runtime-unavailable message when no binding exists', async () => {
    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const { SEASON_RUNTIME_UNAVAILABLE } = await import('../season-source/season-source.constants');
    const source = createSeasonSource();

    const resultPromise = source.createSeasonAnimes(['sa-1'], {}, { 'sa-1': { totalEpisodes: 24 } });

    await vi.advanceTimersByTimeAsync(5000);

    // The caller shows this message: resolving to undefined would report success
    // for a creation that never happened.
    await expect(resultPromise).resolves.toBe(SEASON_RUNTIME_UNAVAILABLE);
  });

  it('agrees with the Go create-metadata contract on every field name it can emit', () => {
    // Wails never registers a `map[string]Struct` value type in models.ts, and the
    // generated .d.ts is skipped by skipLibCheck, so nothing machine-checks the two
    // sides. This reads the Go struct's own json tags: a Go-side rename is exactly
    // the drift that would silently drop a confirmed field from the created anime.
    const portsPath = join(process.cwd(), '..', 'internal', 'season', 'ports.go');
    const portsText = readFileSync(portsPath, 'utf8');
    const structBody = portsText.slice(portsText.indexOf('type AnimeCreateMetadata struct {'));
    const tags = [...structBody.slice(0, structBody.indexOf('\n}')).matchAll(/json:"([^",]+)/g)].map((match) => match[1]);

    // The canonical anime create vocabulary, not the legacy Spanish wire names and
    // not the intake row's own held shape: the title is identity (never metadata),
    // and the cover travels as the typed {type, path} shape, so its key is `cover`.
    expect(tags).toEqual(['kind', 'totalEpisodes', 'durationMinutes', 'origin', 'genres', 'studios', 'cover']);
  });

  it('stores or clears one row session metadata through the live binding', async () => {
    const setMock = vi.fn().mockResolvedValue('ok');
    window.go = { desktop: { App: { SetSeasonAnimeMetadata: setMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    const write = source.setSeasonAnimeMetadata('sa-1', '{"kind":0}');
    const clear = source.setSeasonAnimeMetadata('sa-1', '');

    await vi.advanceTimersByTimeAsync(5000);

    await expect(write).resolves.toBe('ok');
    await expect(clear).resolves.toBe('ok');
    expect(setMock).toHaveBeenNthCalledWith(1, 'sa-1', '{"kind":0}');
    // An empty payload is how the row's metadata is cleared, so it must reach Go as empty.
    expect(setMock).toHaveBeenNthCalledWith(2, 'sa-1', '');
  });

  it('degrades the metadata write to its runtime-unavailable message when no binding exists', async () => {
    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const { SEASON_RUNTIME_UNAVAILABLE } = await import('../season-source/season-source.constants');

    const write = createSeasonSource().setSeasonAnimeMetadata('sa-1', '{"kind":0}');

    await vi.advanceTimersByTimeAsync(5000);

    // The store surfaces this message, so a write with no runtime cannot pass as saved.
    await expect(write).resolves.toBe(SEASON_RUNTIME_UNAVAILABLE);
  });

  it('maps the settings module SetSeasonCheckTime back to the status string the check-time control reads', async () => {
    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const setSeasonCheckTime = vi.fn().mockResolvedValue(undefined);
    window.go = { desktop: { App: { SetSeasonCheckTime: setSeasonCheckTime } } } as never;

    await expect(createSeasonSource().setCheckTime('07:30')).resolves.toBe('ok');
    expect(setSeasonCheckTime).toHaveBeenCalledWith('07:30');

    window.go = {
      desktop: {
        App: { SetSeasonCheckTime: vi.fn().mockRejectedValue(new Error('{"code":"invalid_argument","message":"invalid time \\"9:00\\": use HH:MM (00:00-23:59)"}')) },
      },
    } as never;
    await expect(createSeasonSource().setCheckTime('9:00')).resolves.toBe('invalid time "9:00": use HH:MM (00:00-23:59)');
  });

  it.each(SEASON_COMMANDS)('reads %s as "ok" once it resolves and as its failure message once it rejects', async (binding, invoke) => {
    const bindingMock = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error(SEASON_STARTING_REJECTION));
    window.go = { desktop: { App: { [binding]: bindingMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    // The season consumers still read a status string until they migrate, so a void
    // success is "ok" and a coded rejection is the message they show.
    await expect(invoke(source)).resolves.toBe('ok');
    await expect(invoke(source)).resolves.toBe('season is starting');
    expect(bindingMock).toHaveBeenCalledTimes(2);
  });

  it('reads an uncoded season refusal, which Wails rejects as a bare string, as its message', async () => {
    window.go = { desktop: { App: { CloseSeason: vi.fn().mockRejectedValue('no active season') } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');

    await expect(createSeasonSource().closeSeason()).resolves.toBe('no active season');
  });

  it.each(SEASON_READS)('reads a rejected %s as the fallback its consumers read before', async (binding, invoke, fallback) => {
    const bindingMock = vi.fn().mockRejectedValue(new Error(SEASON_STARTING_REJECTION));
    window.go = { desktop: { App: { [binding]: bindingMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');

    await expect(invoke(createSeasonSource())).resolves.toEqual(fallback);
    expect(bindingMock).toHaveBeenCalledTimes(1);
  });

  it.each(SEASON_OUTCOMES)('reads a rejected %s as its unavailable result carrying the failure message', async (binding, invoke, rest) => {
    const bindingMock = vi.fn().mockRejectedValue(new Error(SEASON_STARTING_REJECTION));
    window.go = { desktop: { App: { [binding]: bindingMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');

    await expect(invoke(createSeasonSource())).resolves.toEqual({ ...rest, status: 'season is starting' });
    expect(bindingMock).toHaveBeenCalledTimes(1);
  });

  it.each(SEASON_ORDERING_QUERY_READS)('answers %s with the binding payload and rejects its coded failure', async (binding, invoke) => {
    const payload = { recorded: true, rail: [], grid: [{ animeId: 'a' }] };
    const bindingMock = vi.fn().mockResolvedValueOnce(payload).mockRejectedValueOnce(new Error(SEASON_STARTING_REJECTION));
    window.go = { desktop: { App: { [binding]: bindingMock } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const source = createSeasonSource();

    await expect(invoke(source)).resolves.toBe(payload);
    await expect(invoke(source)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: 'season is starting' });
  });

  it.each(SEASON_ORDERING_QUERY_READS)('rejects %s as unavailable, never a fallback, when its binding never attaches', async (binding, invoke) => {
    const { createSeasonSource } = await import('../season-source/season-source.helpers');
    const settled = invoke(createSeasonSource()).catch((error: unknown) => error);

    await vi.advanceTimersByTimeAsync(5000);

    await expect(settled).resolves.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: `the ${binding} binding is not attached` });
  });

  it('uses the shared Wails binding readiness helper instead of local duplicate plumbing', () => {
    const seasonSourcePath = join(process.cwd(), 'src/infrastructure/season-source/season-source.helpers.ts');
    const sourceText = readFileSync(seasonSourcePath, 'utf8');

    expect(sourceText).toContain("from '../wails-bindings.helpers'");
    expect(sourceText).not.toMatch(/function hasGoBinding\s*\(/);
    expect(sourceText).not.toMatch(/function waitForBindings\s*\(/);
  });

  it('keeps the season port types in shared contracts and the adapter in its own module', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/season-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(process.cwd(), 'src/shared/contracts/season.types.ts');
    const helperPath = join(sourceRoot, 'season-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/season-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
