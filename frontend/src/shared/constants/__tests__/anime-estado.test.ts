import { describe, expect, it } from 'vitest';
import { ANIME_ESTADO_FILTER_ENTRIES, ANIME_ESTADO_LABELS, getAnimeEstadoLabel } from '../anime-estado';

describe('anime estado canonical vocabulary', () => {
  it.each([
    [0, 'Viendo'],
    [1, 'Finalizado'],
    [2, 'No me gusto'],
    [3, 'En pausa'],
  ])('maps estado %i to the Legacy-truth label %s', (estado, label) => {
    expect(ANIME_ESTADO_LABELS[estado]).toBe(label);
    expect(getAnimeEstadoLabel(estado)).toBe(label);
  });

  it('falls back to the raw estado as string for unknown values', () => {
    expect(getAnimeEstadoLabel(99)).toBe('99');
  });

  it('exposes the four numeric estado values as filter entries in canonical order', () => {
    expect(ANIME_ESTADO_FILTER_ENTRIES).toEqual([
      { value: '0', label: 'Viendo' },
      { value: '1', label: 'Finalizado' },
      { value: '2', label: 'No me gusto' },
      { value: '3', label: 'En pausa' },
    ]);
  });
});
