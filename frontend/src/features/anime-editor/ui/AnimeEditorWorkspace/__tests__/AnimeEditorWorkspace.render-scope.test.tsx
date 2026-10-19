import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Mock source the editor workspace receives through the vi.mock factory. */
const { mockSource } = vi.hoisted(() => {
  /** One list row. */
  function makeAnime(id: string, name: string) {
    return { id, name, status: 0, active: 1, episodesWatched: 1, days: ['Lunes'] };
  }
  /** One editor record. */
  function makeRecord(id: string, name: string) {
    return {
      animeId: id, modifiedAt: 1,
      frequent: { name, status: 0, progress: 1, totalEpisodes: null, active: true, kind: null, page: '', folder: '', placements: [] },
      details: { genres: [], studios: { kind: 'values', values: [] }, origin: '', duration: null, cover: null },
    };
  }
  /** Display names by id. */
  const names: Record<string, string> = { 'anime-1': 'Alpha Show', 'anime-2': 'Beta Show', 'anime-3': 'Gamma Show' };
  return {
    mockSource: {
      getAnimes: vi.fn().mockResolvedValue([makeAnime('anime-1', 'Alpha Show'), makeAnime('anime-2', 'Beta Show'), makeAnime('anime-3', 'Gamma Show')]),
      getAnimeEditorRecord: vi.fn((id: string) => Promise.resolve({ record: makeRecord(id, names[id] ?? id) })),
      saveAnimeEditor: vi.fn(), deactivateAnime: vi.fn(), getAnimeEditorScheduleBoard: vi.fn(), applyAnimeEditorSchedule: vi.fn(),
      pickFolder: vi.fn().mockResolvedValue(''),
    },
  };
});

/** Renders of each counted component, by name. */
const renders: Record<string, number> = {};

/**
 * Replaces one component export with a wrapper that counts its renders. The
 * wrapper is applied to the module's export, so a `memo` around the real
 * component still decides whether the counted function runs.
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

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({ bridgeRuntimeSource: mockSource }));
vi.mock('../AnimeEditorListPanel', (load) => countRenders(load, 'AnimeEditorListPanel', true));
vi.mock('../AnimeEditorFormPanel', (load) => countRenders(load, 'AnimeEditorFormPanel', true));
vi.mock('../AnimeEditorDialogs', (load) => countRenders(load, 'AnimeEditorDialogs', false));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';
import { createEmptyEpisodeDurationSource } from './episode-duration-source.test-support';

/** The Episodes section's in-memory source, so no render waits on a Wails binding. */
const episodeSource = createEmptyEpisodeDurationSource();

afterEach(cleanup);

/** Selects one anime in the rail and waits for its record in the form. */
async function selectAnime(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(name) }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 4, name: new RegExp(name) })).toBeInTheDocument());
}

describe('AnimeEditorWorkspace render scope', () => {
  it('re-renders the list and form panels only when what they show changes, not on every workspace step', async () => {
    render(
      <MemoryRouter initialEntries={['/editor']}>
        <Routes>
          <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor" />
          <Route element={<AnimeEditorWorkspace episodeSource={episodeSource} />} path="/editor/:id" />
        </Routes>
      </MemoryRouter>,
    );
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
