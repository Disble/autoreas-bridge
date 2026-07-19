import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoloAnimeDownloadPanel } from '../SoloAnimeDownloadPanel';
import { useSoloAnimeDownloadPanel } from '../use-solo-anime-download-panel';

vi.mock('../use-solo-anime-download-panel', () => ({
  useSoloAnimeDownloadPanel: vi.fn(),
}));

const mockedUseSoloAnimeDownloadPanel = vi.mocked(useSoloAnimeDownloadPanel);

describe('SoloAnimeDownloadPanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders search results and triggers the selected anime download', () => {
    const onSelectAnime = vi.fn();
    const onTriggerDownload = vi.fn();
    mockedUseSoloAnimeDownloadPanel.mockReturnValue({
      status: 'ready',
      query: '',
      options: [{ id: 'anime-1', name: 'Frieren', progressLabel: '12 / 28', canDownload: true, gapLabel: undefined }],
      selected: { id: 'anime-1', name: 'Frieren', progressLabel: '12 / 28', canDownload: true, gapLabel: undefined },
      errorMessage: undefined,
      canTrigger: true,
      onQueryChange: vi.fn(),
      onSelectAnime,
      onTriggerDownload,
    });

    render(<SoloAnimeDownloadPanel />);

    fireEvent.click(screen.getByRole('button', { name: /frieren/i }));
    fireEvent.click(screen.getByRole('button', { name: /download missing episodes/i }));

    expect(onSelectAnime).toHaveBeenCalledWith('anime-1');
    expect(onTriggerDownload).toHaveBeenCalledTimes(1);
  });

  it('disables the trigger while no downloadable anime is selected', () => {
    mockedUseSoloAnimeDownloadPanel.mockReturnValue({
      status: 'ready',
      query: '',
      options: [],
      selected: undefined,
      errorMessage: undefined,
      canTrigger: false,
      onQueryChange: vi.fn(),
      onSelectAnime: vi.fn(),
      onTriggerDownload: vi.fn(),
    });

    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByRole('button', { name: /download missing episodes/i })).toBeDisabled();
  });
});
