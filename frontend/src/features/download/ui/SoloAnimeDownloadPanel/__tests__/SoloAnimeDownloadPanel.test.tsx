import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoloAnimeDownloadPanel } from '../SoloAnimeDownloadPanel';
import { useSoloAnimeDownloadPanel } from '../use-solo-anime-download-panel';

vi.mock('../use-solo-anime-download-panel', () => ({ useSoloAnimeDownloadPanel: vi.fn() }));

const mockedUseSoloAnimeDownloadPanel = vi.mocked(useSoloAnimeDownloadPanel);

function mockHook(overrides: Partial<ReturnType<typeof useSoloAnimeDownloadPanel>> = {}): void {
  mockedUseSoloAnimeDownloadPanel.mockReturnValue({
    status: 'ready',
    query: '',
    options: [
      { id: 'blocked', name: 'Blocked Anime', ready: false, reasonLabels: ['Download destination could not be resolved.'] },
      { id: 'ready', name: 'Ready Anime', ready: true, reasonLabels: [] },
    ],
    selected: undefined,
    errorMessage: undefined,
    canTrigger: false,
    onQueryChange: vi.fn(),
    onSelectAnime: vi.fn(),
    onTriggerDownload: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  });
}

describe('SoloAnimeDownloadPanel', () => {
  afterEach(() => cleanup());

  it('renders full-catalog readiness rows without an episode-progress label', () => {
    mockHook();
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByRole('button', { name: /blocked anime/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ready anime/i })).toBeInTheDocument();
    expect(screen.getByText('Download destination could not be resolved.')).toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
    expect(screen.queryByText(/episode progress/i)).not.toBeInTheDocument();
  });

  it('shows the selected blocker and disables Download', () => {
    const onTriggerDownload = vi.fn();
    mockHook({
      selected: { id: 'blocked', name: 'Blocked Anime', ready: false, reasonLabels: ['Download destination could not be resolved.'] },
      onTriggerDownload,
    });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('Blocked Anime cannot start a download check.')).toBeInTheDocument();
    expect(screen.getAllByText('Download destination could not be resolved.')).toHaveLength(2);
    const button = screen.getByRole('button', { name: 'Download missing episodes' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onTriggerDownload).not.toHaveBeenCalled();
  });

  it('enables Download for a ready selection', () => {
    const onTriggerDownload = vi.fn();
    mockHook({
      selected: { id: 'ready', name: 'Ready Anime', ready: true, reasonLabels: [] },
      canTrigger: true,
      onTriggerDownload,
    });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('Ready for download check')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Download missing episodes' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onTriggerDownload).toHaveBeenCalledTimes(1);
  });

  it('renders a retryable top-level readiness failure', () => {
    const onRetry = vi.fn();
    mockHook({ status: 'readiness-error', errorMessage: 'readiness failed', onRetry });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('Download readiness unavailable')).toBeInTheDocument();
    expect(screen.getByText('readiness failed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a download-start failure without a readiness retry', () => {
    mockHook({ status: 'trigger-error', errorMessage: 'JDownloader is unavailable', canTrigger: true });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('Download could not start')).toBeInTheDocument();
    expect(screen.getByText('JDownloader is unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download missing episodes' })).toBeEnabled();
  });
});
