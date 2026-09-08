import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SoloAnimeDownloadPanel } from '../SoloAnimeDownloadPanel';
import { useSoloAnimeDownloadPanel } from '../use-solo-anime-download-panel';

vi.mock('../use-solo-anime-download-panel', () => ({ useSoloAnimeDownloadPanel: vi.fn() }));

/** Typed handle onto the mocked hook so overrides get hook-return type checking. */
const mockedUseSoloAnimeDownloadPanel = vi.mocked(useSoloAnimeDownloadPanel);

/** A ready-to-download anime option with no blockers. */
const readyOption = { id: 'ready', name: 'Ready Anime', ready: true, reasonLabels: [], statusTag: undefined };
/** A blocked anime option carrying the reason it cannot start a download. */
const blockedOption = {
  id: 'blocked',
  name: 'Blocked Anime',
  ready: false,
  reasonLabels: ['Download destination could not be resolved.'],
  statusTag: 'No destination',
};

/** Configures the mocked hook with a ready default state, merging in each case's overrides. */
function mockHook(overrides: Partial<ReturnType<typeof useSoloAnimeDownloadPanel>> = {}): void {
  mockedUseSoloAnimeDownloadPanel.mockReturnValue({
    status: 'ready',
    query: '',
    filter: 'ready',
    options: [readyOption],
    counts: { ready: 1, blocked: 1 },
    emptyMessage: 'No anime is ready for a download check.',
    selected: undefined,
    errorMessage: undefined,
    canTrigger: false,
    listWindow: { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 20 },
    onQueryChange: vi.fn(),
    onFilterChange: vi.fn(),
    onSelectAnime: vi.fn(),
    onTriggerDownload: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  });
}

describe('SoloAnimeDownloadPanel', () => {
  afterEach(() => cleanup());

  it('gives a ready row no status marker, because every ready row would carry the same one', () => {
    mockHook();
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByRole('button', { name: /ready anime/i })).toBeInTheDocument();
    expect(screen.queryByText('Ready for download check')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs attention')).not.toBeInTheDocument();
  });

  it('shows a blocked row as a compact tag, never the full sentence', () => {
    mockHook({ filter: 'blocked', options: [blockedOption] });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('No destination')).toBeInTheDocument();
    expect(screen.queryByText('Download destination could not be resolved.')).not.toBeInTheDocument();
  });

  it('labels both tabs with their counts and switches on press', () => {
    const onFilterChange = vi.fn();
    mockHook({ onFilterChange });
    render(<SoloAnimeDownloadPanel />);

    const blockedTab = screen.getByRole('radio', { name: /blocked/i });
    expect(screen.getByRole('radio', { name: /ready/i })).toHaveTextContent('1');
    expect(blockedTab).toHaveTextContent('1');

    fireEvent.click(blockedTab);
    expect(onFilterChange).toHaveBeenCalledWith('blocked');
  });

  it('explains an empty rail instead of rendering nothing', () => {
    mockHook({
      options: [],
      query: 'oshi',
      emptyMessage: 'No ready anime match "oshi" — 3 blocked matches.',
    });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('No ready anime match "oshi" — 3 blocked matches.')).toBeInTheDocument();
  });

  it('grows the rail when the user scrolls near the bottom', () => {
    const onScroll = vi.fn();
    mockHook({ listWindow: { scrollRef: { current: null }, onScroll, visibleCount: 20 } });
    render(<SoloAnimeDownloadPanel />);

    fireEvent.scroll(screen.getByTestId('solo-anime-download-scroll'));
    expect(onScroll).toHaveBeenCalled();
  });

  it('spells out the blocker for the selection and disables Download', () => {
    const onTriggerDownload = vi.fn();
    mockHook({ selected: blockedOption, onTriggerDownload });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByText('Blocked Anime cannot start a download check.')).toBeInTheDocument();
    expect(screen.getByText('Download destination could not be resolved.')).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Download missing episodes' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onTriggerDownload).not.toHaveBeenCalled();
  });

  it('enables Download for a ready selection', () => {
    const onTriggerDownload = vi.fn();
    mockHook({ selected: readyOption, canTrigger: true, onTriggerDownload });
    render(<SoloAnimeDownloadPanel />);

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

  it('announces loading through a named status region while readiness resolves', () => {
    mockHook({ status: 'loading', options: [] });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getByRole('status', { name: 'Loading readiness...' })).toBeInTheDocument();
  });

  it('mirrors the rail row shape with placeholder rows while readiness resolves', () => {
    // `options` is deliberately NOT empty. With an empty list the rail returns
    // early on `options.length === 0`, so the loading guard is never the branch
    // that decides anything and a broken guard still passes. A reload keeps the
    // previous readiness list in state, so this is also the real prop shape.
    mockHook({ status: 'loading', options: [readyOption, blockedOption] });
    render(<SoloAnimeDownloadPanel />);

    expect(screen.getAllByTestId('solo-anime-download-skeleton-row').length).toBeGreaterThan(0);
    expect(screen.queryByText('Ready Anime')).toBeNull();
    expect(screen.queryByText('Blocked Anime')).toBeNull();
    expect(screen.queryByTestId('solo-anime-download-scroll')).toBeNull();
  });

  it('does not render the loading status region or the empty-selection message once resolved', () => {
    mockHook();
    render(<SoloAnimeDownloadPanel />);

    expect(screen.queryByRole('status', { name: 'Loading readiness...' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('solo-anime-download-skeleton-row')).not.toBeInTheDocument();
  });
});
