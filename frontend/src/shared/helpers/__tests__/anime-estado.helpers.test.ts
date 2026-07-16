import { describe, expect, it } from 'vitest';
import { getAnimeEstadoLabel, isWatchingAnime, isValidAnimeEstado } from '../anime-estado.helpers';

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

describe('isWatchingAnime', () => {
  it('returns true when activo is 1 and estado is 0 (Viendo)', () => {
    expect(isWatchingAnime({ activo: 1, estado: 0 })).toBe(true);
  });

  it('returns false when activo is 0 even if estado is 0', () => {
    expect(isWatchingAnime({ activo: 0, estado: 0 })).toBe(false);
  });

  it('returns false when estado is not 0 (Finalizado) even if active', () => {
    expect(isWatchingAnime({ activo: 1, estado: 1 })).toBe(false);
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
