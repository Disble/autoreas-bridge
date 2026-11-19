import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpisodeScheduleCard } from '../EpisodeScheduleCard';
import type { EpisodeScheduleRow } from '../episode-schedule-panel.types';

// The season grade action is verified in its own suite; stub it here so the card
// test stays isolated from the season store and Wails runtime.
vi.mock('../../../../season/ui/SeasonRateAction/SeasonRateAction', () => ({
  SeasonRateAction: () => null,
}));

/**
 * Builds one schedule row carrying every field the card reads, with any override applied on top, so a
 * test states only the fact it is about.
 */
function createRow(overrides: Partial<EpisodeScheduleRow> = {}): EpisodeScheduleRow {
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

/** Builds the callback set the card calls, each one a spy resolving immediately. */
function createCallbacks() {
  return {
    adjustWatchedEpisodes: vi.fn().mockResolvedValue(undefined),
    copyAnimeFolder: vi.fn().mockResolvedValue(undefined),
    copyAnimePage: vi.fn().mockResolvedValue(undefined),
    openAnimeFolder: vi.fn().mockResolvedValue(undefined),
    openAnimePage: vi.fn().mockResolvedValue(undefined),
    setAnimeState: vi.fn().mockResolvedValue(undefined),
  };
}

afterEach(() => cleanup());

describe('EpisodeScheduleCard', () => {
  it('renders a plain row: placeholder cover, progress swap, button hierarchy, no optional actions', () => {
    const { container } = render(<EpisodeScheduleCard row={createRow()} {...createCallbacks()} />);

    const scene = screen.getByRole('img', { name: 'No cover art' });
    expect(scene).toHaveClass('absolute', 'inset-0', 'size-full');
    expect(screen.getByTestId('episode-schedule-cover-slot').parentElement).toHaveClass('gap-4', 'min-h-24');
    expect(screen.getByText('10.5 watched')).toHaveClass('group-hover:hidden');
    expect(screen.getByText('17.5 remaining')).toHaveClass('group-hover:inline');

    // A gray minus below the primary plus.
    const minusButton = screen.getByRole('button', { name: 'Subtract one episode for Frieren. Secondary click subtracts half episode.' });
    const plusButton = screen.getByRole('button', { name: 'Add one episode for Frieren. Secondary click adds half episode.' });
    expect(minusButton.className).toContain('button--tertiary');
    expect(minusButton.className).not.toContain('danger');
    expect(plusButton.className).toContain('button--primary');

    // Folder and page actions stay hidden while their literal string is empty.
    expect(screen.queryByRole('button', { name: /Open page for/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open folder for/ })).not.toBeInTheDocument();

    // A row with no long-episode mark renders no chip, placeholder or extra label.
    expect(screen.queryByText(/Ep\.\s?\d/)).not.toBeInTheDocument();
    expect(screen.getByText('Viendo')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="chip"]')).toHaveLength(1);
  });

  it('renders the resolved cover filling the same fixed-size slot that bleeds through the card padding', () => {
    const { unmount } = render(<EpisodeScheduleCard row={createRow({ showCoverPlaceholder: true })} {...createCallbacks()} />);
    const placeholderWrapper = screen.getByTestId('episode-schedule-cover-slot');
    expect(placeholderWrapper).toHaveClass('w-24', 'relative', '-ml-4', '-my-4');
    unmount();

    render(<EpisodeScheduleCard row={createRow({ coverDataUrl: 'data:image/png;base64,abc', showCoverPlaceholder: false })} {...createCallbacks()} />);
    const imageWrapper = screen.getByTestId('episode-schedule-cover-slot');
    expect(imageWrapper).toHaveClass('w-24', 'relative', '-ml-4', '-my-4');
    expect(screen.queryByRole('img', { name: 'No cover art' })).not.toBeInTheDocument();
    const image = screen.getByTestId('episode-schedule-cover-image');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,abc');
    expect(image).toHaveClass('absolute', 'inset-0', 'object-cover');
  });

  it.each([
    { name: 'Subtract one episode for Frieren. Secondary click subtracts half episode.', lines: ['Subtract one episode', 'Right-click subtracts half'] },
    { name: 'Add one episode for Frieren. Secondary click adds half episode.', lines: ['Add one episode', 'Right-click adds half'] },
    { name: 'Change status for Frieren. Current status: Viendo.', lines: ['Change status'] },
  ])('names $lines.0 in a tooltip on keyboard focus', ({ name, lines }) => {
    render(<EpisodeScheduleCard row={createRow()} {...createCallbacks()} />);

    fireEvent.keyDown(document.body, { key: 'Tab' });
    act(() => screen.getByRole('button', { name }).focus());

    const shown = screen.getByRole('tooltip').querySelectorAll('span > span');
    expect([...shown].map((line) => line.textContent)).toEqual(lines);
  });

  it('tints the folder, page and status actions and shows the literal path and URL in tooltips', async () => {
    const row = createRow({ folderPath: '/anime/frieren', hasFolder: true, hasPage: true, pageUrl: 'https://example.com/frieren' });
    render(<EpisodeScheduleCard row={row} {...createCallbacks()} />);

    const folderButton = screen.getByRole('button', { name: 'Open folder for Frieren. Secondary click copies folder path.' });
    const pageButton = screen.getByRole('button', { name: 'Open page for Frieren. Secondary click copies page URL.' });
    const statusButton = screen.getByRole('button', { name: 'Change status for Frieren. Current status: Viendo.' });
    expect(folderButton.className).toContain('hover:text-success');
    expect(pageButton.className).toContain('hover:text-accent');
    expect(statusButton.className).toContain('hover:text-warning');
    expect(statusButton.className).toContain('button--tertiary');

    pageButton.focus();
    expect(await screen.findByText('https://example.com/frieren')).toBeInTheDocument();
    pageButton.blur();

    folderButton.focus();
    expect(await screen.findByText('/anime/frieren')).toBeInTheDocument();
  });

  it('adjusts progress by whole and half steps and delegates a status change from its modal', () => {
    const adjustWatchedEpisodes = vi.fn().mockResolvedValue(undefined);
    const setAnimeState = vi.fn().mockResolvedValue(undefined);
    render(<EpisodeScheduleCard row={createRow()} {...createCallbacks()} adjustWatchedEpisodes={adjustWatchedEpisodes} setAnimeState={setAnimeState} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add one episode for Frieren. Secondary click adds half episode.' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Add one episode for Frieren. Secondary click adds half episode.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Subtract one episode for Frieren. Secondary click subtracts half episode.' }));
    fireEvent.contextMenu(screen.getByRole('button', { name: 'Subtract one episode for Frieren. Secondary click subtracts half episode.' }));

    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 1, 1000);
    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', 0.5, 1000);
    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', -1, 1000);
    expect(adjustWatchedEpisodes).toHaveBeenCalledWith('anime-1', -0.5, 1000);

    fireEvent.click(screen.getByRole('button', { name: 'Change status for Frieren. Current status: Viendo.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Set Frieren as Finalizado' }));

    expect(setAnimeState).toHaveBeenCalledWith('anime-1', 1, 1000);
  });

  it('disables the progress buttons when isProgressBlocked is true', () => {
    render(<EpisodeScheduleCard row={createRow({ isProgressBlocked: true })} {...createCallbacks()} />);

    expect(screen.getByRole('button', { name: 'Add one episode for Frieren. Secondary click adds half episode.' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Subtract one episode for Frieren. Secondary click subtracts half episode.' })).toBeDisabled();
  });
});

// The Today long-episode mark (ODD 4 U1c): the chip sits next to the anime
// name beside the status chip; a row with no mark renders exactly as before.
describe('EpisodeScheduleCard long-episode chip', () => {
  it('renders the NEXT-episode chip beside the status chip and reveals its whole-sentence tooltip on focus', async () => {
    const row = createRow({ longEpisodeChip: { label: 'Ep. 7 · 45 min', tooltip: 'El próximo capítulo dura 45 minutos' } });
    render(<EpisodeScheduleCard row={row} {...createCallbacks()} />);

    expect(screen.getByText('Ep. 7 · 45 min')).toBeInTheDocument();
    expect(screen.getByText('Viendo')).toBeInTheDocument();

    screen.getByLabelText('El próximo capítulo dura 45 minutos').focus();
    expect(await screen.findByText('El próximo capítulo dura 45 minutos')).toBeInTheDocument();
  });
});
