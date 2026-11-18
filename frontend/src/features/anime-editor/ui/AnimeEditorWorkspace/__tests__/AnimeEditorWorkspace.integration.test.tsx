import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';

// Drives the real composed workspace (list -> record -> draft -> validation ->
// form UI) against a faked bridge source, so the whole editor chain runs
// exactly as it does in the app. Each describe installs its own fake as the
// workspace's default ports.

/** The fakes each describe installs, and the port the bridge-runtime mock serves. */
const { port, selectionSource, typeFieldSource, getAnimeEditorRecordMock } = vi.hoisted(() => {
  /**
   * Builds one catalog row.
   * @param id The anime id.
   * @param name The display name.
   * @returns The row.
   */
  function makeAnime(id: string, name: string) {
    return { id, name, status: 0, active: 1, episodesWatched: 1, days: ['Lunes'] };
  }
  /**
   * Builds one editor record.
   * @param id The anime id.
   * @param name The display name.
   * @returns The record.
   */
  function makeRecord(id: string, name: string) {
    return {
      animeId: id, modifiedAt: 1,
      frequent: { name, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
      details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, cover: null },
    };
  }
  const names: Record<string, string> = { 'anime-1': 'Alpha Show', 'anime-2': 'Beta Show', 'anime-3': 'Gamma Show' };
  const selectionSource = {
    getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha Show'), makeAnime('anime-2', 'Beta Show'), makeAnime('anime-3', 'Gamma Show')]),
    getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id, names[id] ?? id) })),
    saveAnimeEditor: vi.fn(), deactivateAnime: vi.fn(), getAnimeEditorScheduleBoard: vi.fn(), applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn().mockResolvedValue(''),
  };

  const getAnimeEditorRecordMock = vi.fn();
  /** Answers any optional call the composed hooks make that the fake does not program. */
  const noop = () => Promise.resolve(undefined);
  const typeFieldTarget = {
    getAnimes: vi.fn().mockResolvedValue([
      { id: 'anime-1', name: 'BanG Dream! Yume∞Mita', status: 0, episodesWatched: 1, active: 1, days: [] },
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
  const typeFieldSource = new Proxy(typeFieldTarget, { get: (target, key) => Reflect.get(target, key) ?? noop });
  return { port: { current: selectionSource as object }, selectionSource, typeFieldSource, getAnimeEditorRecordMock };
});

/** Renders of each counted component, by name. */
const renders: Record<string, number> = {};

/**
 * Replaces one component export with a wrapper that counts its renders and
 * then renders the real component, so every other case sees the real tree.
 * The wrapper is applied to the module's export, so a `memo` around the real
 * component still decides whether the counted function runs.
 * @param load Loads the real module.
 * @param name The export to count.
 * @param inner Whether to count inside the export's `memo` wrapper.
 * @returns The module with the counted export.
 */
async function countRenders(load: () => Promise<Record<string, unknown>>, name: string, inner: boolean) {
  const actual = await load();
  const component = actual[name] as { type?: (props: unknown) => unknown } & ((props: unknown) => unknown);
  /** Counts one render, then renders the real component. */
  const counted = (props: unknown) => {
    renders[name] = (renders[name] ?? 0) + 1;
    return (component.type ?? component)(props);
  };
  if (inner && component.type !== undefined) {
    return { ...actual, [name]: { ...component, type: counted } };
  }
  return { ...actual, [name]: counted };
}

// The Episodes card's reload debounce is guarded in use-episode-durations-load.test.ts;
// here every render would otherwise wait it out before the card reads.
vi.mock('../../EpisodeDurationsSection/episode-durations-section.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** No settle wait: the card reads on the next task. */
  EPISODE_DURATIONS_RELOAD_DELAY_MS: 0,
}));

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The workspace's default anime-module Editor port: the current describe's fake. */
  get BRIDGE_ANIME_EDITOR_SOURCE() {
    return port.current;
  },
  /** The workspace's default shell pickers: the current describe's fake. */
  get BRIDGE_PICKER_SOURCE() {
    return port.current;
  },
  /** The workspace's default anime-module cover port: the current describe's fake. */
  get BRIDGE_ANIME_SOURCE() {
    return port.current;
  },
}));
vi.mock('../AnimeEditorListPanel', (load) => countRenders(load, 'AnimeEditorListPanel', true));
vi.mock('../AnimeEditorFormPanel', (load) => countRenders(load, 'AnimeEditorFormPanel', true));
vi.mock('../AnimeEditorDialogs', (load) => countRenders(load, 'AnimeEditorDialogs', false));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';
import { createEmptyEpisodeDurationSource, createEpisodesReadyWrapper } from './episode-duration-source.test-support';

/** The Episodes section's in-memory source, so no render waits on a Wails binding. */
const episodeSource = createEmptyEpisodeDurationSource();

afterEach(cleanup);

/** Renders the workspace route for one test. */
function renderWorkspace() {
  return render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor" />
        <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor/:id" />
      </Routes>
    </MemoryRouter>,
  { wrapper: createEpisodesReadyWrapper() },
  );
}

/**
 * Builds the editor record of anime-1 with the given stored type, or none.
 * @param kind The stored type, or undefined for none.
 * @returns The record.
 */
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

describe('AnimeEditorWorkspace consecutive selection (integration)', () => {
  beforeEach(() => {
    port.current = selectionSource;
  });

  it('loads each clicked anime into the form, not just the first', async () => {
    renderWorkspace();

    // Initial auto-selection.
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Alpha Show/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Beta Show/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Beta Show/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Gamma Show/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Gamma Show/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Alpha Show/ }));
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Alpha Show/ })).toBeInTheDocument());
  });
});

/**
 * Selects one anime in the rail and waits for its record in the form.
 * @param name The anime's display name.
 */
async function selectAnime(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: new RegExp(name) })).toBeInTheDocument());
}

describe('AnimeEditorWorkspace render scope', () => {
  beforeEach(() => {
    port.current = selectionSource;
    for (const name of Object.keys(renders)) delete renders[name];
  });

  it('re-renders the list and form panels only when what they show changes, not on every workspace step', async () => {
    renderWorkspace();
    await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: /Alpha Show/ })).toBeInTheDocument());
    await selectAnime('Beta Show');
    await selectAnime('Gamma Show');

    // The unmemoized dialogs render on every workspace step (15), so they count the steps.
    // The list re-renders when its rows or the selection callback change (7); the form
    // when the record loads or its save callback follows the selection (10). Before the
    // panel slices, both rendered on all 15 steps.
    expect(renders.AnimeEditorDialogs).toBeGreaterThanOrEqual(12);
    expect(renders.AnimeEditorListPanel).toBeLessThanOrEqual(7);
    expect(renders.AnimeEditorFormPanel).toBeLessThanOrEqual(10);
  });
});

// End-to-end regression for the Type field. Guards the reported bug: an anime
// whose tipo=0 ("Anime (TV)") loaded with an empty Type, showed "Type is
// required", and looped on "save made no changes" because the zero was dropped
// at the serialization boundary.
describe('AnimeEditorWorkspace Type field (e2e)', () => {
  beforeEach(() => {
    port.current = typeFieldSource;
    getAnimeEditorRecordMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('treats a concrete tipo=0 as a satisfied Type — no "Type is required" alarm', async () => {
    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: recordWithKind(0) });

    render(<MemoryRouter><AnimeEditorWorkspace episodeSource={episodeSource} /></MemoryRouter>, { wrapper: createEpisodesReadyWrapper() });

    // Wait for the record to finish loading into the form.
    expect(await screen.findByDisplayValue('BanG Dream! Yume∞Mita')).toBeInTheDocument();
    // Under the bug tipo=0 was dropped to an empty draft, raising this exact
    // banner (see the report) and blocking a clean save. It must stay silent.
    expect(screen.queryByText('Type is required.')).not.toBeInTheDocument();
  });

  it('still demands a Type for an anime that genuinely has none (contrast)', async () => {
    getAnimeEditorRecordMock.mockResolvedValue({ outcome: 'applied', message: 'loaded', record: recordWithKind(undefined) });

    render(<MemoryRouter><AnimeEditorWorkspace episodeSource={episodeSource} /></MemoryRouter>, { wrapper: createEpisodesReadyWrapper() });

    // A truly absent type is the ONLY case that should surface the requirement,
    // proving the fix distinguishes a real 0 from a missing value.
    expect(await screen.findByText('Type is required.')).toBeInTheDocument();
  });
});
