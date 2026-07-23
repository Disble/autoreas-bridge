import { describe, expect, it } from 'vitest';
import { getAnimeEstadoLabel, isScheduledAnime, isValidAnimeEstado } from '../anime-estado.helpers';

describe('getAnimeEstadoLabel', () => {
  it.each([
    [0, 'Viendo'],
    [1, 'Finalizado'],
    [2, 'No me gusto'],
    [3, 'En pausa'],
  ])('maps estado %i to the Legacy-truth label %s', (estado, label) => {
    expect(getAnimeEstadoLabel(estado)).toBe(label);
  });

  it('falls back to the raw estado as string for unknown values', () => {
    expect(getAnimeEstadoLabel(99)).toBe('99');
  });
});

describe('isScheduledAnime', () => {
  it('includes a paused (En pausa) anime that is active and scheduled — the Daily-board set', () => {
    expect(isScheduledAnime({ active: 1, days: ['Domingo'] })).toBe(true);
  });

  it('includes an active Viendo anime with a scheduled day', () => {
    expect(isScheduledAnime({ active: 1, days: ['Lunes', 'Jueves'] })).toBe(true);
  });

  it('excludes an active anime with no scheduled day (never reaches the Daily board)', () => {
    expect(isScheduledAnime({ active: 1, days: [] })).toBe(false);
  });

  it('excludes an inactive (soft-deleted) anime even if it still has days', () => {
    expect(isScheduledAnime({ active: 0, days: ['Domingo'] })).toBe(false);
  });
});

describe('isValidAnimeEstado', () => {
  it.each([0, 1, 2, 3])('accepts canonical value %i', (estado) => {
    expect(isValidAnimeEstado(estado)).toBe(true);
  });

  it('rejects an out-of-range value', () => {
    expect(isValidAnimeEstado(4)).toBe(false);
  });

  it('rejects a negative value', () => {
    expect(isValidAnimeEstado(-1)).toBe(false);
  });
});
