import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChapterScheduleCard } from '../ChapterScheduleCard';
import type { ChapterScheduleRow } from '../chapter-schedule-panel.types';

// The season grade action is verified in its own suite; stub it here so the card
// test stays isolated from the season store and Wails runtime.
vi.mock('../../../../season/ui/SeasonRateAction/SeasonRateAction', () => ({
  SeasonRateAction: () => null,
}));

function createRow(overrides: Partial<ChapterScheduleRow> = {}): ChapterScheduleRow {
  return {
    id: 'anime-1',
    name: 'Frieren',
    stateLabel: 'Viendo',
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
  it('renders the full-bleed placeholder scene when showCoverPlaceholder is true', () => {
    const row = createRow({ showCoverPlaceholder: true });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    const scene = screen.getByRole('img', { name: 'No cover art' });
    expect(scene).toBeInTheDocument();
    expect(scene).toHaveClass('absolute', 'inset-0', 'size-full');
  });

  it('renders the resolved cover image filling the slot without affecting card height', () => {
    const row = createRow({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    expect(screen.queryByRole('img', { name: 'No cover art' })).not.toBeInTheDocument();
    const image = screen.getByTestId('chapter-schedule-cover-image');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,abc');
    expect(image).toHaveClass('absolute', 'inset-0', 'object-cover');
  });

  it('bleeds the cover slot through the card padding inside the same fixed-size wrapper', () => {
    const { unmount } = render(<ChapterScheduleCard row={createRow({ showCoverPlaceholder: true })} {...createCallbacks()} />);
    const placeholderWrapper = screen.getByTestId('chapter-schedule-cover-slot');
    expect(placeholderWrapper).toHaveClass('w-24', 'relative', '-ml-4', '-my-4');
    unmount();

    render(<ChapterScheduleCard row={createRow({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false })} {...createCallbacks()} />);
    const imageWrapper = screen.getByTestId('chapter-schedule-cover-slot');
    expect(imageWrapper).toHaveClass('w-24', 'relative', '-ml-4', '-my-4');
  });

  it('separates the cover slot from the text block with a breathing gap and a minimum row height', () => {
    render(<ChapterScheduleCard row={createRow()} {...createCallbacks()} />);

    const slot = screen.getByTestId('chapter-schedule-cover-slot');
    expect(slot.parentElement).toHaveClass('gap-4', 'min-h-24');
  });

  it('renders watched and remaining as sibling spans with the group-hover swap classes', () => {
    const row = createRow({ remainingLabel: '17.5 remaining', watchedLabel: '10.5 watched' });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    const watched = screen.getByText('10.5 watched');
    const remaining = screen.getByText('17.5 remaining');
    expect(watched).toHaveClass('group-hover:hidden');
    expect(remaining).toHaveClass('group-hover:inline');
  });

  it('renders the progress pair with the bridge theme roles: minus secondary, plus primary', () => {
    render(<ChapterScheduleCard row={createRow()} {...createCallbacks()} />);

    const minusButton = screen.getByRole('button', { name: 'Subtract one chapter for Frieren. Secondary click subtracts half chapter.' });
    const plusButton = screen.getByRole('button', { name: 'Add one chapter for Frieren. Secondary click adds half chapter.' });

    expect(minusButton.className).toContain('button--secondary');
    expect(minusButton.className).not.toContain('danger');
    expect(plusButton.className).toContain('button--primary');
  });

  it('tints the utility actions with intent colors on hover', () => {
    const row = createRow({ folderPath: '/anime/frieren', hasFolder: true, hasPage: true, pageUrl: 'https://example.com/frieren' });
    render(<ChapterScheduleCard row={row} {...createCallbacks()} />);

    const folderButton = screen.getByRole('button', { name: 'Open folder for Frieren. Secondary click copies folder path.' });
    const pageButton = screen.getByRole('button', { name: 'Open page for Frieren. Secondary click copies page URL.' });
    const statusButton = screen.getByRole('button', { name: 'Change status for Frieren. Current status: Viendo.' });

    expect(folderButton.className).toContain('hover:text-success');
    expect(pageButton.className).toContain('hover:text-accent');
    expect(statusButton.className).toContain('hover:text-warning');
    expect(statusButton.className).toContain('button--tertiary');
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

    fireEvent.click(screen.getByRole('button', { name: 'Change status for Frieren. Current status: Viendo.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Frieren as Finalizado' }));

    expect(setAnimeState).toHaveBeenCalledWith('anime-1', 1, 1000);
  });

  it('disables the progress buttons when isProgressBlocked is true', () => {
    render(<ChapterScheduleCard row={createRow({ isProgressBlocked: true })} {...createCallbacks()} />);

    expect(screen.getByRole('button', { name: 'Add one chapter for Frieren. Secondary click adds half chapter.' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subtract one chapter for Frieren. Secondary click subtracts half chapter.' })).toBeDisabled();
  });
});
