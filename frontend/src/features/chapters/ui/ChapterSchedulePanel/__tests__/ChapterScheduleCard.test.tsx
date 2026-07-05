import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterScheduleCard } from '../ChapterScheduleCard';
import type { ChapterScheduleRow } from '../chapter-schedule-panel.types';

function createRow(overrides: Partial<ChapterScheduleRow> = {}): ChapterScheduleRow {
  return {
    id: 'anime-1',
    name: 'Frieren',
    stateLabel: 'Watching',
    isProgressBlocked: false,
    watchedLabel: '10.5 watched',
    remainingLabel: '17.5 remaining',
    progressTitle: '10.5 watched of 28 · 17.5 remaining',
    totalLabel: 'of 28',
    modifiedAt: 1000,
    hasPage: false,
    hasFolder: false,
    folderPath: '',
    pageUrl: '',
    coverDataUrl: undefined,
    showCoverPlaceholder: true,
    ...overrides,
  };
}

function createCallbacks() {
  return {
    adjustWatchedChapters: vi.fn().mockResolvedValue(undefined),
    copyAnimeFolder: vi.fn().mockResolvedValue(undefined),
    copyAnimePage: vi.fn().mockResolvedValue(undefined),
    openAnimeFolder: vi.fn().mockResolvedValue(undefined),
    openAnimePage: vi.fn().mockResolvedValue(undefined),
    setAnimeState: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => cleanup());

describe('ChapterScheduleCard', () => {
  it('renders the shared placeholder when showCoverPlaceholder is true', () => {
    const row = createRow({ showCoverPlaceholder: true });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    expect(screen.getByRole('img', { name: 'No cover art' })).toBeInTheDocument();
  });

  it('renders the resolved cover image when showCoverPlaceholder is false and a coverDataUrl is present', () => {
    const row = createRow({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    expect(screen.queryByRole('img', { name: 'No cover art' })).not.toBeInTheDocument();
    const image = screen.getByTestId('chapter-schedule-cover-image');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,abc');
  });

  it('renders both cover states inside the same fixed-size wrapper', () => {
    const { unmount } = render(<ChapterScheduleCard row={createRow({ showCoverPlaceholder: true })} {...createCallbacks()} />);
    const placeholderWrapper = screen.getByTestId('chapter-schedule-cover-slot');
    expect(placeholderWrapper).toHaveClass('w-24');
    unmount();

    render(<ChapterScheduleCard row={createRow({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false })} {...createCallbacks()} />);
    const imageWrapper = screen.getByTestId('chapter-schedule-cover-slot');
    expect(imageWrapper).toHaveClass('w-24');
  });

  it('renders watched and remaining as sibling spans with the group-hover swap classes', () => {
    const row = createRow({ remainingLabel: '17.5 remaining', watchedLabel: '10.5 watched' });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    const watched = screen.getByText('10.5 watched');
    const remaining = screen.getByText('17.5 remaining');
    expect(watched).toHaveClass('group-hover:hidden');
    expect(remaining).toHaveClass('group-hover:inline');
  });

  it('renders the minus button with the danger treatment and the plus button as primary', () => {
    render(<ChapterScheduleCard row={createRow()} {...createCallbacks()} />);

    const minusButton = screen.getByRole('button', { name: 'Subtract one chapter for Frieren. Secondary click subtracts half chapter.' });
    const plusButton = screen.getByRole('button', { name: 'Add one chapter for Frieren. Secondary click adds half chapter.' });

    expect(minusButton.className).toContain('danger');
    expect(plusButton.className).toContain('primary');
  });

  it('shows the literal folder path and page URL in the action tooltips', async () => {
    const row = createRow({ folderPath: '/anime/frieren', hasFolder: true, hasPage: true, pageUrl: 'https://example.com/frieren' });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    const pageButton = screen.getByRole('button', { name: 'Open page for Frieren. Secondary click copies page URL.' });
    pageButton.focus();
    expect(await screen.findByText('https://example.com/frieren')).toBeInTheDocument();
    pageButton.blur();

    const folderButton = screen.getByRole('button', { name: 'Open folder for Frieren. Secondary click copies folder path.' });
    folderButton.focus();
    expect(await screen.findByText('/anime/frieren')).toBeInTheDocument();
  });

  it('keeps folder and page actions hidden when the underlying literal string is empty', () => {
    render(<ChapterScheduleCard row={createRow({ folderPath: '', hasFolder: false, hasPage: false, pageUrl: '' })} {...createCallbacks()} />);

    expect(screen.queryByRole('button', { name: /Open page for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open folder for/ })).not.toBeInTheDocument();
  });

  it('keeps the plus/minus press and secondary-click half-step behavior intact', async () => {
    const adjustWatchedChapters = vi.fn().mockResolvedValue(undefined);
    render(<ChapterScheduleCard row={createRow()} {...createCallbacks()} adjustWatchedChapters={adjustWatchedChapters} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add one chapter for Frieren. Secondary click adds half chapter.' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Add one chapter for Frieren. Secondary click adds half chapter.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subtract one chapter for Frieren. Secondary click subtracts half chapter.' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Subtract one chapter for Frieren. Secondary click subtracts half chapter.' }));

    expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', 1, 1000);
    expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', 0.5, 1000);
    expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', -1, 1000);
    expect(adjustWatchedChapters).toHaveBeenCalledWith('anime-1', -0.5, 1000);
  });

  it('opens the status modal and delegates the selected state change', async () => {
    const setAnimeState = vi.fn().mockResolvedValue(undefined);
    render(<ChapterScheduleCard row={createRow()} {...createCallbacks()} setAnimeState={setAnimeState} />);

    fireEvent.click(screen.getByRole('button', { name: 'Change status for Frieren. Current status: Watching.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Frieren as Completed' }));

    expect(setAnimeState).toHaveBeenCalledWith('anime-1', 1, 1000);
  });

  it('disables the progress buttons when isProgressBlocked is true', () => {
    render(<ChapterScheduleCard row={createRow({ isProgressBlocked: true })} {...createCallbacks()} />);

    expect(screen.getByRole('button', { name: 'Add one chapter for Frieren. Secondary click adds half chapter.' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subtract one chapter for Frieren. Secondary click subtracts half chapter.' })).toBeDisabled();
  });
});
