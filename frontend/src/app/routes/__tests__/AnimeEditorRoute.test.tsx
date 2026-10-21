import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimeEditorRoute } from '../AnimeEditorRoute';

/** Mounts the route on the editor paths it serves in production. */
function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/editor']}>
      <Routes>
        <Route element={<AnimeEditorRoute />} path="/editor" />
        <Route element={<AnimeEditorRoute />} path="/editor/:id" />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AnimeEditorRoute', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the Library tab by default with a Create tab available', () => {
    renderRoute();

    expect(screen.getByRole('tab', { name: 'Library' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Create' })).toHaveAttribute('aria-selected', 'false');
    const title = screen.getByRole('heading', { level: 1, name: 'Editor' });
    // The title sits above the Library | Create tabs, as on every other screen.
    expect(title.compareDocumentPosition(screen.getByRole('tablist', { name: 'Anime editor' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('opens the Create tab without a modal', () => {
    renderRoute();

    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));

    expect(screen.getByRole('heading', { level: 2, name: 'Create anime' })).toBeInTheDocument();
    // The Editor title stays the page's only h1 on the Create tab too.
    expect(screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent)).toEqual(['Editor']);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
describe('AnimeEditorRoute initial tab', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens on Create when the route supplies it, instead of reading create as an anime id', () => {
    render(
      <MemoryRouter initialEntries={['/editor/create']}>
        <Routes>
          <Route element={<AnimeEditorRoute initialTab="create" />} path="/editor/create" />
          <Route element={<AnimeEditorRoute />} path="/editor/:id" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Create anime' })).toBeInTheDocument();
  });

  it('still opens on Library when the route supplies no tab', () => {
    render(
      <MemoryRouter initialEntries={['/editor/anime-1']}>
        <Routes>
          <Route element={<AnimeEditorRoute initialTab="create" />} path="/editor/create" />
          <Route element={<AnimeEditorRoute />} path="/editor/:id" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Create anime' })).toBeNull();
  });
});
