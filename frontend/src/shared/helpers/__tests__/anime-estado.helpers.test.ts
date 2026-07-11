import { describe, expect, it } from 'vitest';
import { getAnimeEstadoLabel } from '../anime-estado.helpers';

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
