import { describe, expect, it } from 'vitest';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import {
  formatAnimeDetailDate,
  formatAnimeDetailProgress,
  toAnimeDetailViewModel,
  toAnimeRepeticionViewModel,
} from '../anime-detail.helpers';

const baseDetail: AnimeDetail = {
  _id: 'anime-1',
  nombre: 'Frieren',
  estado: 2,
  nrocapvisto: 12,
  totalcap: 28,
  activo: 1,
  primeravez: 1,
  dias: [],
  generos: ['Fantasy', 'Adventure'],
  modified_at: 0,
};

describe('formatAnimeDetailProgress', () => {
  it('includes totalcap when present', () => {
    expect(formatAnimeDetailProgress(12, 28)).toBe('12 / 28');
  });

  it('shows a placeholder when totalcap is missing', () => {
    expect(formatAnimeDetailProgress(5)).toBe('5 / ?');
  });
});

describe('formatAnimeDetailDate', () => {
  it('formats epoch millis to a YYYY-MM-DD label', () => {
    expect(formatAnimeDetailDate(Date.UTC(2024, 0, 15))).toBe('2024-01-15');
  });

  it('returns undefined when millis are missing', () => {
    expect(formatAnimeDetailDate(undefined)).toBeUndefined();
  });
});

describe('toAnimeRepeticionViewModel', () => {
  it('maps a repetition entry with a known repeated-on date', () => {
    const viewModel = toAnimeRepeticionViewModel(
      {
        numrepeticion: 1,
        nrocapvisto: 24,
        estado: 1,
        fechaRepeticion: Date.UTC(2023, 5, 1),
      },
      0,
    );

    expect(viewModel).toEqual({
      key: '1-0',
      numRepeticion: 1,
      progressLabel: '24 / ?',
      repeatedOnLabel: '2023-06-01',
    });
  });

  it('degrades a null fechaRepeticion to the Unknown label', () => {
    const viewModel = toAnimeRepeticionViewModel(
      { numrepeticion: 2, nrocapvisto: 10, estado: 1 },
      1,
    );

    expect(viewModel.repeatedOnLabel).toBe('Unknown');
  });
});

describe('toAnimeDetailViewModel', () => {
  it('maps a detail with no repetition history to an empty timeline', () => {
    const viewModel = toAnimeDetailViewModel(baseDetail);

    expect(viewModel).toEqual({
      id: 'anime-1',
      nombre: 'Frieren',
      progressLabel: '12 / 28',
      genres: ['Fantasy', 'Adventure'],
      studios: 'Unknown',
      origin: 'Unknown',
      isFirstWatch: true,
      repetitions: [],
      hasRepetitionHistory: false,
    });
  });

  it('maps a populated repetir timeline', () => {
    const detail: AnimeDetail = {
      ...baseDetail,
      repetir: [
        { numrepeticion: 1, nrocapvisto: 24, estado: 1, fechaRepeticion: Date.UTC(2022, 0, 1) },
        { numrepeticion: 2, nrocapvisto: 10, estado: 0 },
      ],
    };

    const viewModel = toAnimeDetailViewModel(detail);

    expect(viewModel.hasRepetitionHistory).toBe(true);
    expect(viewModel.repetitions).toHaveLength(2);
    expect(viewModel.repetitions[0].repeatedOnLabel).toBe('2022-01-01');
    expect(viewModel.repetitions[1].repeatedOnLabel).toBe('Unknown');
  });

  it('uses studios and origin when present', () => {
    const viewModel = toAnimeDetailViewModel({
      ...baseDetail,
      estudios: 'Madhouse',
      origen: 'Manga',
    });

    expect(viewModel.studios).toBe('Madhouse');
    expect(viewModel.origin).toBe('Manga');
  });

  it('reports isFirstWatch false when primeravez is not 1', () => {
    const viewModel = toAnimeDetailViewModel({ ...baseDetail, primeravez: 0 });

    expect(viewModel.isFirstWatch).toBe(false);
  });
});
