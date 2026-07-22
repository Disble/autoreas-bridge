import { describe, expect, it } from 'vitest';
import type { AnimeDetail, AnimeRepeticion } from '../../../../../shared/contracts/anime.types';
import {
  formatAnimeDetailDurationLabel,
  formatAnimeDetailLongDate,
  formatAnimeDetailProgressRatio,
  formatAnimeDetailRepetitionDate,
  formatAnimeDetailSubtitle,
  formatAnimeDetailTotalLabel,
  getAnimeDetailEstadoColor,
  getAnimeDetailEstadoLabel,
  getAnimeDetailStatusColor,
  getAnimeDetailStatusLabel,
  getAnimeDetailTipoLabel,
  hasPreviousHistoryEntry,
  sortAnimeRepeticionesMostRecentFirst,
  toAnimeDetailViewModel,
  toAnimeRepeticionViewModel,
} from '../anime-detail.helpers';

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

describe('formatAnimeDetailRepetitionDate', () => {
  it('formats epoch millis as a long-form local date', () => {
    expect(formatAnimeDetailRepetitionDate(Date.UTC(2023, 5, 1, 12))).toBe('June 1, 2023');
  });

  it('returns the explicit "No data" fallback when millis are missing', () => {
    expect(formatAnimeDetailRepetitionDate(undefined)).toBe('No data');
  });
});

describe('sortAnimeRepeticionesMostRecentFirst', () => {
  it('sorts entries descending by numrepeticion without mutating the input', () => {
    const entries: readonly AnimeRepeticion[] = [
      { numRepetitions: 0, episodesWatched: 12, status: 1 },
      { numRepetitions: 2, episodesWatched: 40, status: 3 },
      { numRepetitions: 1, episodesWatched: 24, status: 1 },
    ];

    const sorted = sortAnimeRepeticionesMostRecentFirst(entries);

    expect(sorted.map((entry) => entry.numRepetitions)).toEqual([2, 1, 0]);
    expect(entries.map((entry) => entry.numRepetitions)).toEqual([0, 2, 1]);
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
});

describe('toAnimeRepeticionViewModel', () => {
  it('maps a fully populated repetition entry', () => {
    const viewModel = toAnimeRepeticionViewModel(
      {
        numRepetitions: 1,
        episodesWatched: 24,
        status: 1,
        createdAt: Date.UTC(2022, 0, 1, 12),
        premieredAt: Date.UTC(2022, 0, 2, 12),
        lastWatchedAt: Date.UTC(2022, 0, 3, 12),
        deletedAt: Date.UTC(2022, 0, 4, 12),
        repeatedAt: Date.UTC(2023, 5, 1, 12),
      },
      0,
    );

    expect(viewModel).toEqual({
      key: '1-0',
      numRepeticion: 1,
      estadoLabel: 'Finalizado',
      estadoColor: 'success',
      episodesWatchedLabel: '24',
      creacionLabel: 'January 1, 2022',
      estrenoLabel: 'January 2, 2022',
      ultCapVistoLabel: 'January 3, 2022',
      eliminacionLabel: 'January 4, 2022',
      repeatedOnLabel: 'June 1, 2023',
    });
  });

  it('degrades every absent date to the explicit "No data" fallback', () => {
    const viewModel = toAnimeRepeticionViewModel(
      { numRepetitions: 2, episodesWatched: 10, status: 1 },
      1,
    );

    expect(viewModel.creacionLabel).toBe('No data');
    expect(viewModel.estrenoLabel).toBe('No data');
    expect(viewModel.ultCapVistoLabel).toBe('No data');
    expect(viewModel.eliminacionLabel).toBe('No data');
    expect(viewModel.repeatedOnLabel).toBe('No data');
  });
});

describe('toAnimeDetailViewModel', () => {
  it('maps a minimal detail (no optional fields) with explicit fallbacks throughout', () => {
    const viewModel = toAnimeDetailViewModel(baseDetail);

    expect(viewModel).toEqual({
      id: 'anime-1',
      nombre: 'Frieren',
      portadaUrl: undefined,
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
      progressRatio: Math.round((12 / 28) * 100),
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
      repetitions: [],
      hasRepetitionHistory: false,
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

    expect(viewModel.portadaUrl).toBe('C:/legacy/portadas/frieren.jpg');
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
    expect(viewModel.progressRatio).toBeUndefined();
    expect(viewModel.paginaUrl).toBe('https://example.com/frieren');
    expect(viewModel.carpetaLabel).toBe('D:/anime/Frieren');
    expect(viewModel.estrenoLabel).toBe('September 29, 2023');
    expect(viewModel.creacionLabel).toBe('January 1, 2023');
    expect(viewModel.ultCapVistoLabel).toBe('March 22, 2024');
    expect(viewModel.hasGenres).toBe(false);
    expect(viewModel.hasRepetitionHistory).toBe(true);
  });

  // Real fixture: 793/795 records carry portada.path === '' and one carries
  // the literal string 'null'. An <img src=""> never fires onError, so a
  // blank path must map to undefined (placeholder path), not an img render.
  it.each([[''], ['   '], ['null']])(
    'maps the blank/sentinel portada path %j to an undefined portadaUrl',
    (portada) => {
      const viewModel = toAnimeDetailViewModel({ ...baseDetail, cover: portada });

      expect(viewModel.portadaUrl).toBeUndefined();
    },
  );

  it('trims a surrounding-whitespace portada path before exposing it to the view', () => {
    const viewModel = toAnimeDetailViewModel({
      ...baseDetail,
      cover: '  C:/legacy/portadas/frieren.jpg  ',
    });

    expect(viewModel.portadaUrl).toBe('C:/legacy/portadas/frieren.jpg');
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

  it('orders repetitions most-recent-first regardless of the wire order', () => {
    const viewModel = toAnimeDetailViewModel({
      ...baseDetail,
      repetitions: [
        { numRepetitions: 0, episodesWatched: 12, status: 1 },
        { numRepetitions: 2, episodesWatched: 40, status: 3 },
        { numRepetitions: 1, episodesWatched: 24, status: 1 },
      ],
    });

    expect(viewModel.repetitions.map((entry) => entry.numRepeticion)).toEqual([2, 1, 0]);
  });
});
