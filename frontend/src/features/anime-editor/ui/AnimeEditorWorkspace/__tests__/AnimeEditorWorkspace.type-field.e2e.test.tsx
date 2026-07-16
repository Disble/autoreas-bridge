import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';

// End-to-end regression for the anime editor Type field. Drives the real
// composed workspace (list -> record -> draft -> validation -> form UI) against
// a faked bridge source, so the whole editor chain runs exactly as it does in
// the app. Guards the reported bug: an anime whose tipo=0 ("Anime (TV)") loaded
// with an empty Type, showed "Type is required", and looped on "save made no
// changes" because the zero was dropped at the serialization boundary.

const { fakeSource, getAnimeEditorRecordMock } = vi.hoisted(() => {
  const getAnimeEditorRecordMock = vi.fn();
  const noop = () => Promise.resolve(undefined);
  const fakeSource = {
    getAnimes: vi.fn().mockResolvedValue([
      { id: 'anime-1', nombre: 'BanG Dream! Yume∞Mita', estado: 0, nrocapvisto: 1, activo: 1 },
    ]),
    getAnimeEditorRecord: getAnimeEditorRecordMock,
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn().mockResolvedValue({
      outcome: 'applied',
      message: 'loaded',
      board: { originAnimeId: 'anime-1', boardModifiedAt: 1, destinations: [], entries: [] },
    }),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
    pickFile: vi.fn().mockResolvedValue(''),
  };
  // Silence any incidental optional calls the composed hooks may make.
  return { fakeSource: new Proxy(fakeSource, { get: (target, key) => Reflect.get(target, key) ?? noop }), getAnimeEditorRecordMock };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: fakeSource,
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';

function recordWithKind(kind: number | undefined): AnimeEditorRecord {
  return {
    animeId: 'anime-1',
    modifiedAt: 1,
    frequent: {
      name: 'BanG Dream! Yume∞Mita',
      status: 0,
      progress: 1,
      active: true,
      placements: [],
      page: 'https://jkanime.net/bang-dream-yumemita/',
      folder: 'D:/Anime/BanG Dream! Yume∞Mita',
      ...(kind === undefined ? {} : { kind }),
    },
    details: { genres: [], studios: { kind: 'missing', values: [] } },
  };
}

describe('AnimeEditorWorkspace Type field (e2e)', () => {
  beforeEach(() => {
    getAnimeEditorRecordMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('treats a concrete tipo=0 as a satisfied Type — no "Type is required" alarm', async () => {
    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: recordWithKind(0) });

    render(<MemoryRouter><AnimeEditorWorkspace /></MemoryRouter>);

    // Wait for the record to finish loading into the form.
    expect(await screen.findByDisplayValue('BanG Dream! Yume∞Mita')).toBeInTheDocument();
    // Under the bug tipo=0 was dropped to an empty draft, raising this exact
    // banner (see the report) and blocking a clean save. It must stay silent.
    expect(screen.queryByText('Type is required.')).not.toBeInTheDocument();
  });

  it('still demands a Type for an anime that genuinely has none (contrast)', async () => {
    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: recordWithKind(undefined) });

    render(<MemoryRouter><AnimeEditorWorkspace /></MemoryRouter>);

    // A truly absent type is the ONLY case that should surface the requirement,
    // proving the fix distinguishes a real 0 from a missing value.
    expect(await screen.findByText('Type is required.')).toBeInTheDocument();
  });
});
