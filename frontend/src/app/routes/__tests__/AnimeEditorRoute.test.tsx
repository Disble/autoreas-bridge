import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimeEditorRoute } from '../AnimeEditorRoute';

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

    expect(screen.getByRole('tab', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Create' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
  });

  it('opens the Create tab without a modal', () => {
    renderRoute();

    fireEvent.click(screen.getByRole('tab', { name: 'Create' }));

    expect(screen.getByRole('heading', { name: 'Create anime' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
