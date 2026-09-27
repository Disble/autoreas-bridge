import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('uses the shared Wails binding readiness helper instead of local duplicate plumbing', () => {
    const seasonSourcePath = join(process.cwd(), 'src/infrastructure/season-source/season-source.helpers.ts');
    const sourceText = readFileSync(seasonSourcePath, 'utf8');

    expect(sourceText).toContain("from '../wails-bindings.helpers'");
    expect(sourceText).not.toMatch(/function hasGoBinding\s*\(/);
    expect(sourceText).not.toMatch(/function waitForBindings\s*\(/);
  });

  it('keeps source-adapter declarations in colocated sibling modules', () => {
    const sourceRoot = join(process.cwd(), 'src/infrastructure/season-source');
    const indexPath = join(sourceRoot, 'index.ts');
    const typesPath = join(sourceRoot, 'season-source.types.ts');
    const helperPath = join(sourceRoot, 'season-source.helpers.ts');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(false);
    expect(existsSync(typesPath)).toBe(true);
    expect(existsSync(helperPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/season-source.ts'))).toBe(false);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
