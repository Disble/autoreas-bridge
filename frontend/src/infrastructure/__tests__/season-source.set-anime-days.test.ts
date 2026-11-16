import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The answer the episodes binding gives when the anime changed since the board was read. */
const SET_ANIME_DAYS_CONFLICT = { message: 'anime-1 changed since the board was read', modifiedAt: 2000, outcome: 'conflict', status: '' };

describe('season source SetAnimeDays', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(window, 'go');
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'go');
  });

  it('reads a conflict answer as the move outcome `ok` the season store keeps', async () => {
    const binding = vi.fn().mockResolvedValue(SET_ANIME_DAYS_CONFLICT);
    window.go = { desktop: { App: { SetAnimeDays: binding } } } as never;

    const { createSeasonSource } = await import('../season-source/season-source.helpers');

    await expect(createSeasonSource().setAnimeDays('anime-1', ['Ver hoy'])).resolves.toBe('ok');
    expect(binding).toHaveBeenCalledExactlyOnceWith('anime-1', ['Ver hoy'], 0);
  });
});
