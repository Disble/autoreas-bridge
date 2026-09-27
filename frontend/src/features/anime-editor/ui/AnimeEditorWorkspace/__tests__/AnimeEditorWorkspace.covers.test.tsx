import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A 150-anime catalog backed by mutable stored covers, so the suite can drive
 * the real editor flow and watch the covers follow: `anime-000`, `anime-005`,
 * ... start coverless, only the first 30 animes start with one, plus
 * `anime-149` -- covered, but far outside the first window. The served art is
 * tagged with a per-anime revision, so a refetch after a saved cover change is
 * observable in the rendered `src`.
 */
const { mockSource, resetMockSource } = vi.hoisted(() => {
  /** The catalog id of one index. */
  function animeId(index: number) {
    return `anime-${String(index).padStart(3, '0')}`;
  }

  /** Stored cover source per anime: the single source of truth for presence. */
  const coverPathById = new Map<string, string>();

  /** Art revision per anime, bumped on every saved cover write. */
  const coverRevisionById = new Map<string, number>();

  /** Builds the catalog the backend list binding returns. */
  function buildAnimes() {
    return Array.from({ length: 150 }, (_, index) => ({
      id: animeId(index),
      name: `Anime ${String(index).padStart(3, '0')}`,
      status: 0,
      active: 1,
      episodesWatched: index,
      days: ['Lunes'],
      hasCover: coverPathById.has(animeId(index)),
    }));
  }

  /** Builds the saved editor record the backend would return for one anime. */
  function makeRecord(id: string) {
    const coverPath = coverPathById.get(id);
    return {
      animeId: id,
      modifiedAt: 1,
      frequent: { name: id, status: 0, progress: 1, totalEpisodes: null, active: true, kind: 1, page: '', folder: '', placements: [] },
      details: {
        genres: [],
        studios: { kind: 'values', values: [] },
        origin: '',
        duration: null,
        premieredAt: null,
        cover: coverPath === undefined ? null : { type: 'url', path: coverPath },
      },
    };
  }

  /** The art the binding serves for one anime, tagged with its current revision. */
  function coverArt(id: string) {
    return `data:image/jpeg;base64,${id}#${coverRevisionById.get(id) ?? 0}`;
  }

  /** Applies the frontend's cover patch exactly as the save binding would. */
  function applyCoverPatch(id: string, cover: { readonly present?: boolean; readonly clear?: boolean; readonly path?: string } | undefined) {
    if (cover?.present !== true) {
      return;
    }
    if (cover.clear === true || cover.path === undefined || cover.path.length === 0) {
      coverPathById.delete(id);
    } else {
      coverPathById.set(id, cover.path);
    }
    coverRevisionById.set(id, (coverRevisionById.get(id) ?? 0) + 1);
  }

  const source = {
    getAnimes: vi.fn(),
    getAnimeEditorRecord: vi.fn(),
    getAnimeCover: vi.fn(),
    saveAnimeEditor: vi.fn(),
    deactivateAnime: vi.fn(),
    getAnimeEditorScheduleBoard: vi.fn(),
    applyAnimeEditorSchedule: vi.fn(),
    pickFolder: vi.fn(),
  };

  /** Restores every binding, and the stored covers, to their default state. */
  function resetMockSource() {
    coverPathById.clear();
    coverRevisionById.clear();
    for (let index = 0; index < 30; index += 1) {
      if (index % 5 !== 0) {
        coverPathById.set(animeId(index), `https://example.com/${animeId(index)}.jpg`);
      }
    }
    coverPathById.set('anime-149', 'https://example.com/anime-149.jpg');

    source.getAnimes.mockReset().mockResolvedValue(buildAnimes());
    source.getAnimeEditorRecord.mockReset().mockImplementation((id: string) => Promise.resolve({ record: makeRecord(id) }));
    source.getAnimeCover.mockReset().mockImplementation((id: string) => Promise.resolve(coverPathById.has(id) ? { dataUrl: coverArt(id), source: 'cover' } : { source: 'placeholder' }));
    source.saveAnimeEditor.mockReset().mockImplementation((command: { readonly animeId: string; readonly patch: { readonly cover?: { readonly present?: boolean; readonly clear?: boolean; readonly path?: string } } }) => {
      applyCoverPatch(command.animeId, command.patch.cover);
      return Promise.resolve({ outcome: 'applied', message: 'Saved.', modifiedAt: 2, record: makeRecord(command.animeId) });
    });
    source.pickFolder.mockReset().mockResolvedValue('');
  }

  return { mockSource: source, resetMockSource };
});

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: mockSource,
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';

beforeEach(resetMockSource);

afterEach(cleanup);

/** Mounts the workspace on the editor routes, optionally deep-linked to one anime. */
function renderWorkspace(entry = '/editor') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<AnimeEditorWorkspace />} path="/editor" />
        <Route element={<AnimeEditorWorkspace />} path="/editor/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

/** Counts the rail's rendered anime buttons. */
function countRows() {
  return screen.queryAllByRole('button', { name: /watched/ }).length;
}

/** The rail cover images whose rendered source carries the given fragment. */
function railCoverImagesWith(fragment: string) {
  return screen.queryAllByTestId('anime-editor-list-cover-image').filter((image) => image.getAttribute('src')?.includes(fragment) === true);
}

/** Writes one new cover source into the open editor, through the details section. */
function saveCoverSource(value: string) {
  fireEvent.click(screen.getByRole('button', { name: 'More details' }));
  fireEvent.change(screen.getByLabelText('Cover image URL'), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
}

describe('AnimeEditorWorkspace cover thumbnails', () => {
  it('keeps the rail skeleton-only while the list request is unresolved', async () => {
    mockSource.getAnimes.mockReturnValue(new Promise(() => undefined));

    renderWorkspace();

    expect(await screen.findByRole('status', { name: 'Loading anime list...' })).toBeInTheDocument();
    expect(countRows()).toBe(0);
    expect(screen.queryByTestId('anime-editor-list-cover-image')).toBeNull();
    expect(screen.getAllByTestId('anime-editor-skeleton-cover')).toHaveLength(6);
    expect(mockSource.getAnimeCover).not.toHaveBeenCalled();
  });

  it('holds the loading slot, and neither an image nor the placeholder, in a row whose cover lookup has not resolved', async () => {
    mockSource.getAnimeCover.mockReturnValue(new Promise(() => undefined));

    renderWorkspace();

    await screen.findByText('Anime 000');
    // Of the first 20 rows, the 16 the DTO reports a cover for keep the loading
    // slot until their lookup lands, and the 4 coverless ones go straight to the
    // placeholder -- so neither slot leaks into the other row's branch.
    await waitFor(() => expect(screen.getAllByTestId('anime-editor-list-cover-loading')).toHaveLength(16));
    expect(screen.queryAllByTestId('anime-editor-list-cover-image')).toHaveLength(0);
    expect(screen.getAllByTestId('anime-editor-list-cover-placeholder')).toHaveLength(4);
  });

  it('resolves only the visible window rows, and never a row the DTO reports as coverless', async () => {
    renderWorkspace();

    await screen.findByText('Anime 000');
    expect(countRows()).toBe(20);

    // 20 rows, of which 0/5/10/15 carry no cover: 16 lookups, no more.
    await waitFor(() => expect(screen.getAllByTestId('anime-editor-list-cover-image')).toHaveLength(16));
    expect(mockSource.getAnimeCover).toHaveBeenCalledTimes(16);
    expect(mockSource.getAnimeCover).not.toHaveBeenCalledWith('anime-000');
    expect(screen.getAllByTestId('anime-editor-list-cover-placeholder')).toHaveLength(4);

    // Growing the window buys exactly the newly visible covers (rows 20-39 hold
    // 8 covered animes, because only the first 30 of the catalog has one), and
    // never a second lookup for the 16 already cached.
    fireEvent.scroll(screen.getByTestId('anime-editor-list-scroll'));

    await waitFor(() => expect(countRows()).toBe(40));
    await waitFor(() => expect(mockSource.getAnimeCover).toHaveBeenCalledTimes(24));
    expect(screen.getAllByTestId('anime-editor-list-cover-image')).toHaveLength(24);
  });

  it('degrades a row whose image fails to decode to the shared placeholder', async () => {
    renderWorkspace();

    await screen.findByText('Anime 000');
    await waitFor(() => expect(screen.getAllByTestId('anime-editor-list-cover-image')).toHaveLength(16));
    const [firstImage] = screen.getAllByTestId('anime-editor-list-cover-image');
    fireEvent.error(firstImage as HTMLImageElement);

    await waitFor(() => expect(screen.getAllByTestId('anime-editor-list-cover-image')).toHaveLength(15));
    expect(screen.getAllByTestId('anime-editor-list-cover-placeholder')).toHaveLength(5);
  });

  it('shows the saved cover in the detail header, and moves both thumbnails on selection', async () => {
    renderWorkspace();

    await screen.findByText('Anime 000');
    // The first selected anime has no saved cover, so the header shows the placeholder.
    expect(await screen.findByTestId('anime-editor-header-cover-placeholder')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Anime 001/ }));

    const headerImage = await screen.findByTestId('anime-editor-header-cover-image');
    expect(headerImage).toHaveAttribute('src', 'data:image/jpeg;base64,anime-001#0');
    expect(railCoverImagesWith('anime-001#0')).toHaveLength(1);
    // One anime, one lookup: the header reads the row's cached entry.
    expect(mockSource.getAnimeCover.mock.calls.filter(([animeId]) => animeId === 'anime-001')).toHaveLength(1);
  });

  it('resolves the selected saved cover even when its row sits outside the window', async () => {
    renderWorkspace('/editor/anime-149');

    expect(await screen.findByText('Anime 000')).toBeInTheDocument();

    const headerImage = await screen.findByTestId('anime-editor-header-cover-image');
    expect(headerImage).toHaveAttribute('src', 'data:image/jpeg;base64,anime-149#0');
    // The row itself was never rendered, so the header is the only holder.
    expect(railCoverImagesWith('anime-149')).toHaveLength(0);
    expect(mockSource.getAnimeCover).toHaveBeenCalledWith('anime-149');
  });

  it('refetches a saved cover change for the same anime, and drops both thumbnails when it is removed', async () => {
    renderWorkspace();

    await screen.findByText('Anime 000');
    fireEvent.click(screen.getByRole('button', { name: /Anime 001/ }));
    expect(await screen.findByTestId('anime-editor-header-cover-image')).toHaveAttribute('src', 'data:image/jpeg;base64,anime-001#0');

    // A NEW cover source for the SAME anime, saved through the real editor
    // flow: the authoritative record and the rail both reload, and both
    // thumbnails must follow the new art rather than keep the cached one.
    saveCoverSource('https://example.com/anime-001-v2.jpg');

    await waitFor(() => expect(screen.getByTestId('anime-editor-header-cover-image')).toHaveAttribute('src', 'data:image/jpeg;base64,anime-001#1'));
    expect(railCoverImagesWith('anime-001#1')).toHaveLength(1);
    expect(railCoverImagesWith('anime-001#0')).toHaveLength(0);

    // Clearing the saved cover leaves the list reporting `hasCover: false`, and
    // BOTH thumbnails fall back to the shared placeholder despite the art still
    // sitting in the cache from a moment ago.
    saveCoverSource('');

    await waitFor(() => expect(screen.getByTestId('anime-editor-header-cover-placeholder')).toBeInTheDocument());
    expect(railCoverImagesWith('anime-001')).toHaveLength(0);
    expect(screen.getAllByTestId('anime-editor-list-cover-placeholder')).toHaveLength(5);
  });
});
