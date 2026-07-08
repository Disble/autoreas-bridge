import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DownloadsRootPanel } from '../DownloadsRootPanel';

afterEach(cleanup);

vi.mock('@heroui/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@heroui/react')>();
  return { ...actual, toast: { success: vi.fn(), danger: vi.fn() } };
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
