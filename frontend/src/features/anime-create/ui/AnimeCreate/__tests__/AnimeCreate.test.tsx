import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source';
import { AnimeCreate } from '../AnimeCreate';

vi.mock('../../../../../infrastructure/bridge-runtime-source', () => ({
  bridgeRuntimeSource: {
    getAnimeEditorScheduleBoard: vi.fn(),
    createAnime: vi.fn(),
    pickFolder: vi.fn(),
  },
}));

const boardResult = {
  outcome: 'applied',
  message: 'loaded',
  board: { originAnimeId: '', boardModifiedAt: 100, destinations: [{ id: 'Lunes', label: 'Lunes', kind: 'weekday' }], entries: [] },
};

describe('AnimeCreate', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders one row and the shared schedule board once loaded', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);

    expect(screen.getByText('Create anime')).toBeInTheDocument();
    expect(screen.getByLabelText('Anime 1 name')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Anime schedule' })).toBeInTheDocument());
  });

  it('keeps the single deferred submit disabled while the seeded draft is still parked, unplaced', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Anime schedule' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Anime 1 name'), { target: { value: 'Frieren' } });
    fireEvent.change(screen.getByLabelText('Page'), { target: { value: 'https://example.test/frieren' } });

    expect(screen.getByText('Frieren')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply schedule' })).toBeDisabled();
    expect(bridgeRuntimeSource.createAnime).not.toHaveBeenCalled();
  });

  it('adds and removes rows, seeding one draft card per row into the staging area', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Anime schedule' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Add another anime' }));

    expect(screen.getByLabelText('Anime 1 name')).toBeInTheDocument();
    expect(screen.getByLabelText('Anime 2 name')).toBeInTheDocument();
    expect(screen.getAllByText('New anime')).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove row' })[0]);

    expect(screen.queryByLabelText('Anime 2 name')).not.toBeInTheDocument();
  });
});
