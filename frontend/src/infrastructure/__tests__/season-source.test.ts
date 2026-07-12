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
    const { createSeasonSource } = await import('../season-source');
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
    window.go = { main: { App: { CreateSeason: createSeasonMock } } } as never;

    const { createSeasonSource, SEASON_RUNTIME_UNAVAILABLE } = await import('../season-source');
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

    const { createSeasonSource } = await import('../season-source');
    const source = createSeasonSource();

    const resultPromise = source.getSeason();

    window.go = { main: { App: { GetSeason: getSeasonMock } } } as never;
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
      main: {
        App: {
          GetPastSeason: getPastSeasonMock,
          GetSeasonAnimes: getSeasonAnimesMock,
          ListSeasons: listSeasonsMock,
        },
      },
    } as never;

    const { createSeasonSource } = await import('../season-source');
    const source = createSeasonSource();

    await expect(source.getSeasonAnimes()).resolves.toEqual(seasonAnimes);
    await expect(source.getPastSeason('season-2025-fall')).resolves.toEqual(season);
    await expect(source.listSeasons()).resolves.toEqual([season]);
    expect(getSeasonAnimesMock).toHaveBeenCalledTimes(1);
    expect(getPastSeasonMock).toHaveBeenCalledWith('season-2025-fall');
    expect(listSeasonsMock).toHaveBeenCalledTimes(1);
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
    const helperPath = join(sourceRoot, 'season-source.helpers.ts');
    const sourceText = readFileSync(indexPath, 'utf8');
    const helperText = readFileSync(helperPath, 'utf8');

    expect(existsSync(indexPath)).toBe(true);
    expect(existsSync(join(process.cwd(), 'src/infrastructure/season-source.ts'))).toBe(false);
    expect(sourceText).toContain("from './season-source.types'");
    expect(sourceText).toContain("from './season-source.helpers'");
    expect(sourceText).toContain("from './season-source.constants'");
    expect(sourceText).not.toMatch(/export interface\s+(SeasonSnapshot|SeasonAnimeCandidate|SeasonAnimeRow|OrderingCard|OrderingBoard|ApplyScheduleResult|SendToVerHoyResult|ConfirmSelectionResult|SeasonSource)\b/);
    expect(sourceText).not.toMatch(/export const\s+SEASON_RUNTIME_UNAVAILABLE\b/);
    expect(sourceText).not.toMatch(/export function\s+/);
    expect(helperText).toContain("from '../wails-bindings.helpers'");
  });
});
