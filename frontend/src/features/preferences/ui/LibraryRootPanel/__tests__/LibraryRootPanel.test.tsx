import { toast } from '@heroui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryRootPanel } from '../LibraryRootPanel';

/** A preview where no active anime moves, so the root saves straight away. */
const NO_MOVES = { oldRoot: 'D:/Anime', moves: [], kept: [] };

// Spy instead of vi.mock: @heroui/react is pre-bundled by deps.optimizer,
// which does not support importOriginal-based partial mocks.
beforeEach(() => {
  vi.spyOn(toast, 'success').mockReturnValue(undefined as never);
  vi.spyOn(toast, 'danger').mockReturnValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

describe('LibraryRootPanel', () => {
  it('shows the loaded root and persists an edit on Save', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setLibraryRoot: vi.fn().mockResolvedValue('ok'),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn(),
    };

    render(<LibraryRootPanel source={source} />);

    const input = await screen.findByLabelText('Library root');
    await waitFor(() => expect(input).toHaveValue('D:/Anime'));

    fireEvent.change(input, { target: { value: 'E:/Media/Anime' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(source.setLibraryRoot).toHaveBeenCalledWith('E:/Media/Anime'));
  });

  it('fills the root from the folder picker', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue(''),
      setLibraryRoot: vi.fn().mockResolvedValue('ok'),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
      pickFolder: vi.fn().mockResolvedValue('F:/Chosen'),
    };

    render(<LibraryRootPanel source={source} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Browse' }));

    await waitFor(() => expect(screen.getByLabelText('Library root')).toHaveValue('F:/Chosen'));
  });

  it('confirms a root change that moves active animes, then saves', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:\\Anime'),
      setLibraryRoot: vi.fn().mockResolvedValue('ok'),
      previewLibraryRootChange: vi.fn().mockResolvedValue({
        oldRoot: 'D:\\Anime',
        moves: [
          { animeId: 'y', name: 'Yani Neko', from: 'D:\\Anime\\Yani Neko', to: 'F:\\Anime\\Yani Neko', baseModifiedAt: 1 },
          { animeId: 'o', name: 'One Pace', from: 'D:\\Anime\\One Pace\\Wano', to: 'F:\\Anime\\One Pace\\Wano', baseModifiedAt: 2 },
        ],
        kept: [{ animeId: 'e', name: 'Eureka', folder: 'E:\\Anime\\Eureka' }],
      }),
      pickFolder: vi.fn(),
    };

    render(<LibraryRootPanel source={source} />);
    const input = await screen.findByLabelText('Library root');
    await waitFor(() => expect(input).toHaveValue('D:\\Anime'));
    fireEvent.change(input, { target: { value: 'F:\\Anime' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('D:\\Anime → F:\\Anime');
    expect(dialog).toHaveTextContent('F:\\Anime\\One Pace\\Wano');
    expect(dialog).toHaveTextContent('Left unchanged');
    expect(dialog).toHaveTextContent('E:\\Anime\\Eureka');
    expect(source.setLibraryRoot).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Change root and update 2 animes' }));

    await waitFor(() => expect(source.setLibraryRoot).toHaveBeenCalledWith('F:\\Anime'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
