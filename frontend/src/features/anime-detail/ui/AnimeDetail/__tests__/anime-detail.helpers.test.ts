import { describe, expect, it } from 'vitest';
import type { AnimeDetail } from '../../../../../shared/contracts/anime.types';
import {
  formatAnimeDetailDurationLabel,
  formatAnimeDetailLongDate,
  formatAnimeDetailProgressRatio,
  formatAnimeDetailSubtitle,
  formatAnimeDetailTotalLabel,
  getAnimeDetailEstadoColor,
  getAnimeDetailEstadoLabel,
  getAnimeDetailStatusColor,
  getAnimeDetailStatusLabel,
  getAnimeDetailTipoLabel,
  hasPreviousHistoryEntry,
  toAnimeDetailViewModel,
} from '../anime-detail.helpers';

/** Minimal detail fixture (no optional fields) reused and overridden per case. */
const baseDetail: AnimeDetail = {
  id: 'anime-1',
  name: 'Frieren',
  status: 2,
  episodesWatched: 12,
  totalEpisodes: 28,
  active: 1,
  firstCycle: 1,
  days: [],
  genres: ['Fantasy', 'Adventure'],
  modified_at: 0,
};

describe('formatAnimeDetailLongDate', () => {
  it('formats epoch millis as a long-form local date', () => {
    expect(formatAnimeDetailLongDate(Date.UTC(2026, 5, 30, 12))).toBe('June 30, 2026');
  });

  it('returns undefined when millis are missing', () => {
    expect(formatAnimeDetailLongDate(undefined)).toBeUndefined();
  });
});

describe('getAnimeDetailEstadoLabel', () => {
  it.each([
    [0, 'Viendo'],
    [1, 'Finalizado'],
    [2, 'No me gusto'],
    [3, 'En pausa'],
  ])('maps estado %i to %s', (estado, label) => {
    expect(getAnimeDetailEstadoLabel(estado)).toBe(label);
  });

  it('falls back to the raw value for an unrecognized estado', () => {
    expect(getAnimeDetailEstadoLabel(9)).toBe('9');
  });
});

describe('getAnimeDetailEstadoColor', () => {
  it.each([
    [0, 'accent'],
    [1, 'success'],
    [2, 'danger'],
    [3, 'warning'],
  ])('maps estado %i to chip color %s', (estado, color) => {
    expect(getAnimeDetailEstadoColor(estado)).toBe(color);
  });

  it('falls back to the default color for an unrecognized estado', () => {
    expect(getAnimeDetailEstadoColor(9)).toBe('default');
  });
});

describe('getAnimeDetailTipoLabel', () => {
  // Domain verified against the real fixture (2026-07-04 scan): distinct tipo
  // values are 0 (626), 1 (49), 2 (11), 3 (27) + null (82), matching Legacy's
  // dropdown order Anime (TV) / Película / Especial / OVA. The previous
  // Serie/Película/OVA(=2) mapping mislabeled Especial animes as OVA.
  it.each([
    [0, 'Anime (TV)'],
    [1, 'Película'],
    [2, 'Especial'],
    [3, 'OVA'],
  ])('maps tipo %i to %s', (tipo, label) => {
    expect(getAnimeDetailTipoLabel(tipo)).toBe(label);
  });

  it('falls back to Unknown when tipo is absent', () => {
    expect(getAnimeDetailTipoLabel(undefined)).toBe('Unknown');
  });

  it('falls back to the raw value for an unrecognized tipo', () => {
    expect(getAnimeDetailTipoLabel(9)).toBe('9');
  });
});

describe('formatAnimeDetailSubtitle', () => {
  it('joins estado and tipo labels with a bullet separator', () => {
    expect(formatAnimeDetailSubtitle('Viendo', 'Serie')).toBe('Viendo • Serie');
  });
});

describe('getAnimeDetailStatusLabel / getAnimeDetailStatusColor', () => {
  it('reports Active/success when activo is 1', () => {
    expect(getAnimeDetailStatusLabel(1)).toBe('Active');
    expect(getAnimeDetailStatusColor(1)).toBe('success');
  });

  it('reports Inactive/danger when activo is 0', () => {
    expect(getAnimeDetailStatusLabel(0)).toBe('Inactive');
    expect(getAnimeDetailStatusColor(0)).toBe('danger');
  });
});

describe('formatAnimeDetailTotalLabel', () => {
  it('renders the total when present', () => {
    expect(formatAnimeDetailTotalLabel(28)).toBe('28');
  });

  it('renders an explicit fallback when total is missing', () => {
    expect(formatAnimeDetailTotalLabel(undefined)).toBe('No total episodes data');
  });
});

describe('formatAnimeDetailDurationLabel', () => {
  it('renders the duration in minutes when present', () => {
    expect(formatAnimeDetailDurationLabel(24)).toBe('24 min');
  });

  it('renders an explicit fallback when duration is missing', () => {
    expect(formatAnimeDetailDurationLabel(undefined)).toBe('No episode duration data');
  });
});

describe('formatAnimeDetailProgressRatio', () => {
  it('computes a 0-100 ratio when total is known', () => {
    expect(formatAnimeDetailProgressRatio(12, 24)).toBe(50);
  });

  it('clamps at 100 when watched exceeds total', () => {
    expect(formatAnimeDetailProgressRatio(30, 24)).toBe(100);
  });

  it('returns undefined when total is missing', () => {
    expect(formatAnimeDetailProgressRatio(12, undefined)).toBeUndefined();
  });

  it('returns undefined when total is zero', () => {
    expect(formatAnimeDetailProgressRatio(0, 0)).toBeUndefined();
  });
});

describe('hasPreviousHistoryEntry', () => {
  it('returns false when the history state is null', () => {
    expect(hasPreviousHistoryEntry(null)).toBe(false);
  });

  it('returns false when the history state has no idx', () => {
    expect(hasPreviousHistoryEntry({})).toBe(false);
  });

  it('returns false when idx is 0', () => {
    expect(hasPreviousHistoryEntry({ idx: 0 })).toBe(false);
  });

  it('returns true when idx is greater than 0', () => {
    expect(hasPreviousHistoryEntry({ idx: 2 })).toBe(true);
  });

  it('returns false for a non-object history state even with a positive idx', () => {
    const state = Object.assign(() => undefined, { idx: 2 });
    expect(hasPreviousHistoryEntry(state as never)).toBe(false);
  });

  it('returns false for a non-numeric idx', () => {
    expect(hasPreviousHistoryEntry({ idx: '2' } as never)).toBe(false);
  });
});

describe('toAnimeDetailViewModel', () => {
  it('maps a minimal detail (no optional fields) with explicit fallbacks throughout', () => {
    const viewModel = toAnimeDetailViewModel(baseDetail);

    expect(viewModel).toEqual({
      id: 'anime-1',
      nombre: 'Frieren',
      hasStoredCover: false,
      estadoLabel: 'No me gusto',
      tipoLabel: 'Unknown',
      subtitleLabel: 'No me gusto • Unknown',
      statusLabel: 'Active',
      statusColor: 'success',
      modifiedAt: 0,
      canRepeat: true,
      canRestore: false,
      statTiles: [
        { label: 'Watched', value: '12' },
        { label: 'Total episodes', value: '28' },
        { label: 'Duration', value: 'No episode duration data' },
      ],
      paginaUrl: undefined,
      carpetaLabel: 'Unknown',
      estrenoLabel: 'Unknown',
      creacionLabel: 'Unknown',
      ultCapVistoLabel: 'Unknown',
      genres: ['Fantasy', 'Adventure'],
      hasGenres: true,
      studios: 'Unknown',
      origin: 'Unknown',
      isFirstWatch: true,
    });
  });

  it('maps a fully populated detail', () => {
    const detail: AnimeDetail = {
      ...baseDetail,
      status: 0,
      kind: 1,
      active: 0,
      totalEpisodes: undefined,
      durationMinutes: 24,
      genres: [],
      cover: 'C:/legacy/portadas/frieren.jpg',
      sourceUrl: 'https://example.com/frieren',
      folder: 'D:/anime/Frieren',
      studios: 'Madhouse',
      origin: 'Manga',
      premieredAt: Date.UTC(2023, 8, 29, 12),
      createdAt: Date.UTC(2023, 0, 1, 12),
      lastWatchedAt: Date.UTC(2024, 2, 22, 12),
      repetitions: [
        { numRepetitions: 1, episodesWatched: 24, status: 1, repeatedAt: Date.UTC(2022, 0, 1) },
      ],
    };

    const viewModel = toAnimeDetailViewModel(detail);

    expect(viewModel.hasStoredCover).toBe(true);
    expect(viewModel.estadoLabel).toBe('Viendo');
    expect(viewModel.tipoLabel).toBe('Película');
    expect(viewModel.subtitleLabel).toBe('Viendo • Película');
    expect(viewModel.statusLabel).toBe('Inactive');
    expect(viewModel.statusColor).toBe('danger');
    expect(viewModel.canRepeat).toBe(false);
    expect(viewModel.canRestore).toBe(true);
    expect(viewModel.statTiles).toEqual([
      { label: 'Watched', value: '12' },
      { label: 'Total episodes', value: 'No total episodes data' },
      { label: 'Duration', value: '24 min' },
    ]);
    expect(viewModel.paginaUrl).toBe('https://example.com/frieren');
    expect(viewModel.carpetaLabel).toBe('D:/anime/Frieren');
    expect(viewModel.estrenoLabel).toBe('September 29, 2023');
    expect(viewModel.creacionLabel).toBe('January 1, 2023');
    expect(viewModel.ultCapVistoLabel).toBe('March 22, 2024');
    expect(viewModel.hasGenres).toBe(false);
    expect(viewModel).not.toHaveProperty('watches');
    expect(viewModel).not.toHaveProperty('hasWatches');
  });

  // Real fixture: 793/795 records carry portada.path === '' and one carries
  // the literal string 'null'. Neither is a renderable cover, so the view
  // model must never expose a raw path at all -- only whether a cover is
  // stored, gating whether the cover binding is called (design D1/D2).
  it.each([[''], ['   '], ['null']])(
    'maps the blank/sentinel portada path %j to hasStoredCover: false',
    (portada) => {
      const viewModel = toAnimeDetailViewModel({ ...baseDetail, cover: portada });

      expect(viewModel.hasStoredCover).toBe(false);
    },
  );

  it('reports hasStoredCover: true for a surrounding-whitespace portada path', () => {
    const viewModel = toAnimeDetailViewModel({
      ...baseDetail,
      cover: '  C:/legacy/portadas/frieren.jpg  ',
    });

    expect(viewModel.hasStoredCover).toBe(true);
  });

  it('uses studios and origin when present', () => {
    const viewModel = toAnimeDetailViewModel({
      ...baseDetail,
      studios: 'Madhouse',
      origin: 'Manga',
    });

    expect(viewModel.studios).toBe('Madhouse');
    expect(viewModel.origin).toBe('Manga');
  });

  it('reports isFirstWatch false when primeravez is not 1', () => {
    const viewModel = toAnimeDetailViewModel({ ...baseDetail, firstCycle: 0 });

    expect(viewModel.isFirstWatch).toBe(false);
  });

  it.each([
    { name: 'finished inactive', status: 1, active: 0, canRepeat: true, canRestore: true },
    { name: 'watching active', status: 0, active: 1, canRepeat: false, canRestore: false },
    { name: 'finished active', status: 2, active: 1, canRepeat: true, canRestore: false },
    { name: 'watching inactive', status: 0, active: 0, canRepeat: false, canRestore: true },
  ])('derives Repeat and Restore visibility for $name', ({ status, active, canRepeat, canRestore }) => {
    const viewModel = toAnimeDetailViewModel({ ...baseDetail, status, active });

    expect(viewModel.canRepeat).toBe(canRepeat);
    expect(viewModel.canRestore).toBe(canRestore);
  });

  it('preserves the displayed authoritative modified token including zero', () => {
    expect(toAnimeDetailViewModel({ ...baseDetail, modified_at: 0 }).modifiedAt).toBe(0);
    expect(toAnimeDetailViewModel({ ...baseDetail, modified_at: 9876 }).modifiedAt).toBe(9876);
  });
});
