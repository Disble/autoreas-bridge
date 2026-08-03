import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bridgeRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers';
import { AnimeCreate } from '../AnimeCreate';

vi.mock('../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.helpers', () => ({
  bridgeRuntimeSource: {
    getAnimeEditorScheduleBoard: vi.fn(),
    createAnime: vi.fn(),
    pickFolder: vi.fn(),
  },
}));

vi.mock('../../../../../infrastructure/preferences-source/preferences-source.helpers', () => ({
  preferencesSource: { getDownloadsRoot: vi.fn().mockResolvedValue('D:\\Anime') },
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

  it('renders the compact form and keeps placement gated until a row has a name and page', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);

    expect(screen.getByRole('heading', { name: 'Create anime' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Download page')).toBeInTheDocument();
    // The board is not dumped inline — it lives behind the placement action.
    expect(screen.queryByRole('heading', { name: 'Place your new anime' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place on schedule…' })).toBeDisabled();
  });

  it('shows the entered title in the card header instead of the row number', () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Tengen Toppa Gurren Lagann' } });

    expect(screen.getByText('Tengen Toppa Gurren Lagann')).toBeInTheDocument();
  });

  it('opens the create-scoped board only after the row is filled, keeping create disabled while the draft is unplaced', async () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Frieren' } });
    fireEvent.change(screen.getByLabelText('Download page'), { target: { value: 'https://example.test/frieren' } });

    const placeButton = screen.getByRole('button', { name: 'Place on schedule…' });
    await waitFor(() => expect(placeButton).toBeEnabled());
    fireEvent.click(placeButton);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Place your new anime' })).toBeInTheDocument());
    expect(screen.getAllByText('Frieren').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Create anime' })).toBeDisabled();
    expect(bridgeRuntimeSource.createAnime).not.toHaveBeenCalled();
  });

  it('removes an empty row directly, but confirms before removing one with data', () => {
    vi.mocked(bridgeRuntimeSource.getAnimeEditorScheduleBoard).mockResolvedValue(boardResult as never);

    render(<AnimeCreate />);

    fireEvent.click(screen.getByRole('button', { name: 'Add another anime' }));
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);

    // An empty row removes with no confirmation.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getAllByLabelText('Name')).toHaveLength(1);
    expect(screen.queryByText('Remove this anime?')).not.toBeInTheDocument();

    // A row with entered data asks for confirmation and stays until confirmed.
    fireEvent.click(screen.getByRole('button', { name: 'Add another anime' }));
    fireEvent.change(screen.getAllByLabelText('Name')[0], { target: { value: 'Frieren' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]);
    expect(screen.getByText('Remove this anime?')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Name')).toHaveLength(2);
  });
});
