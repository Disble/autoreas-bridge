import { toast } from '@heroui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { LIBRARY_ROOT_LOADING_LABEL, LIBRARY_ROOT_UNAVAILABLE_TITLE } from '../library-root-panel.constants';
import type { PickerSource } from '../../../../../shared/contracts/picker.types';
import type { LibraryRootSource } from '../library-root-panel.types';
import { LibraryRootPanel } from '../LibraryRootPanel';

/** A preview where no active anime moves, so the root saves straight away. */
const NO_MOVES = { oldRoot: 'D:/Anime', moves: [], kept: [] };

/** A folder picker the user cancels, for the cases that never browse. */
const CANCELLING_PICKER: PickerSource = { pickFolder: vi.fn().mockResolvedValue(''), pickFile: vi.fn() };

/**
 * Renders the panel under a query wrapper whose `settings` module is `state`.
 * @param source The Settings port.
 * @param state The settings module's state.
 * @param pickerSource The folder picker port.
 * @returns The render result.
 */
function renderPanel(source: LibraryRootSource, state: 'starting' | 'ready' = 'ready', pickerSource: PickerSource = CANCELLING_PICKER) {
  const { wrapper } = createModulesTestWrapper(status('settings', state));
  return render(<LibraryRootPanel source={source} pickerSource={pickerSource} />, { wrapper });
}

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
      setLibraryRoot: vi.fn().mockResolvedValue(undefined),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
    };

    renderPanel(source);

    const input = await screen.findByLabelText('Library root');
    await waitFor(() => expect(input).toHaveValue('D:/Anime'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();

    fireEvent.change(input, { target: { value: 'E:/Media/Anime' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(source.setLibraryRoot).toHaveBeenCalledWith('E:/Media/Anime'));
  });

  it('fills the root from the folder picker', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue(''),
      setLibraryRoot: vi.fn().mockResolvedValue(undefined),
      previewLibraryRootChange: vi.fn().mockResolvedValue(NO_MOVES),
    };

    renderPanel(source, 'ready', { pickFolder: vi.fn().mockResolvedValue('F:/Chosen'), pickFile: vi.fn() });

    fireEvent.click(await screen.findByRole('button', { name: 'Browse' }));

    await waitFor(() => expect(screen.getByLabelText('Library root')).toHaveValue('F:/Chosen'));
  });

  it('confirms a root change that moves active animes, then saves', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockResolvedValue('D:\\Anime'),
      setLibraryRoot: vi.fn().mockResolvedValue(undefined),
      previewLibraryRootChange: vi.fn().mockResolvedValue({
        oldRoot: 'D:\\Anime',
        moves: [
          { animeId: 'y', name: 'Yani Neko', from: 'D:\\Anime\\Yani Neko', to: 'F:\\Anime\\Yani Neko', baseModifiedAt: 1 },
          { animeId: 'o', name: 'One Pace', from: 'D:\\Anime\\One Pace\\Wano', to: 'F:\\Anime\\One Pace\\Wano', baseModifiedAt: 2 },
        ],
        kept: [{ animeId: 'e', name: 'Eureka', folder: 'E:\\Anime\\Eureka' }],
      }),
    };

    renderPanel(source);
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

  it('shows a labelled skeleton and no field while the settings module starts', () => {
    const source = { getLibraryRoot: vi.fn().mockResolvedValue('D:/Anime'), setLibraryRoot: vi.fn(), previewLibraryRootChange: vi.fn() };

    renderPanel(source, 'starting');

    expect(screen.getByRole('status', { name: LIBRARY_ROOT_LOADING_LABEL })).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByText('Library root')).toBeInTheDocument();
    expect(screen.queryByLabelText('Library root')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    expect(source.getLibraryRoot).not.toHaveBeenCalled();
  });

  it('shows the read failure instead of an empty field', async () => {
    const source = {
      getLibraryRoot: vi.fn().mockRejectedValue(createBridgeError('internal', 'settings disk I/O error')),
      setLibraryRoot: vi.fn(),
      previewLibraryRootChange: vi.fn(),
    };

    renderPanel(source);

    expect(await screen.findByText(LIBRARY_ROOT_UNAVAILABLE_TITLE)).toBeInTheDocument();
    expect(screen.getByText('settings disk I/O error')).toBeInTheDocument();
    expect(screen.queryByLabelText('Library root')).not.toBeInTheDocument();
  });
});
