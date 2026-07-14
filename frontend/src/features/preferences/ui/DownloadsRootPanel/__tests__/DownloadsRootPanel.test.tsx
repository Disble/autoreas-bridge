import { toast } from '@heroui/react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DownloadsRootPanel } from '../DownloadsRootPanel';

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

describe('DownloadsRootPanel', () => {
  it('shows the loaded root and persists an edit on Save', async () => {
    const source = {
      getDownloadsRoot: vi.fn().mockResolvedValue('D:/Anime'),
      setDownloadsRoot: vi.fn().mockResolvedValue('ok'),
      pickFolder: vi.fn(),
    };

    render(<DownloadsRootPanel source={source} />);

    const input = await screen.findByLabelText('Downloads root');
    await waitFor(() => expect(input).toHaveValue('D:/Anime'));

    fireEvent.change(input, { target: { value: 'E:/Media/Anime' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(source.setDownloadsRoot).toHaveBeenCalledWith('E:/Media/Anime'));
  });

  it('fills the root from the folder picker', async () => {
    const source = {
      getDownloadsRoot: vi.fn().mockResolvedValue(''),
      setDownloadsRoot: vi.fn().mockResolvedValue('ok'),
      pickFolder: vi.fn().mockResolvedValue('F:/Chosen'),
    };

    render(<DownloadsRootPanel source={source} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Browse' }));

    await waitFor(() => expect(screen.getByLabelText('Downloads root')).toHaveValue('F:/Chosen'));
  });
});
