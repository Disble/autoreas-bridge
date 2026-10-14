import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EpisodeReanalysisRow } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';
import { toEpisodeDurationRowViews } from '../episode-durations-section.helpers';
import type { EpisodeDurationsSectionViewModel } from '../episode-durations-section.types';
import { toEpisodeReviewView } from '../episode-reanalysis-review.helpers';
import { EpisodeDurationsDialogs } from '../EpisodeDurationsDialogs';
import { EpisodeDurationsSection } from '../EpisodeDurationsSection';

afterEach(cleanup);

/** A progressive window that shows every row. */
const WINDOW = { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 20 };

/** Episode 1 measured at 24 min, and episode 2 listed with no value. */
const ROWS = toEpisodeDurationRowViews({
  outcome: 'ok', folderStatus: 'found', beyondTotal: [], tv: true,
  rows: [
    { episode: 1, durationMs: 24 * 60_000, minutes: 24, long: false, source: 'measured' },
    { episode: 2, durationMs: 0, minutes: 0, long: false, source: 'not_measured' },
  ],
}, []);

/**
 * Builds a section view model with every modal closed and spies for every action.
 * @param overrides Fields to replace.
 * @returns The view model.
 */
function viewModel(overrides: Partial<EpisodeDurationsSectionViewModel> = {}): EpisodeDurationsSectionViewModel {
  return {
    isOpen: true, toggleLabel: 'Hide episodes', view: 'table', summary: undefined, banner: undefined, notes: [],
    isDirty: false, isSaving: false, saveError: undefined,
    footer: { isVisible: true, unsavedLabel: 'No unsaved changes', canSave: false, canDiscard: false },
    onSave: vi.fn().mockResolvedValue(undefined), onDiscard: vi.fn(),
    reanalyzeButton: { isDisabled: false, ariaLabel: 'Re-analyze folder', tooltip: 'Re-analyze folder' },
    progress: undefined, emptyCopy: undefined, failureMessage: undefined, visibleRows: [...ROWS], showsAddRow: true, isEditingLocked: false,
    listWindow: WINDOW, review: undefined, visibleReviewRows: [], reviewWindow: WINDOW,
    editView: undefined, editForm: undefined, addView: undefined, addForm: undefined,
    onToggle: vi.fn(), onReanalyze: vi.fn().mockResolvedValue(undefined), onCancelAnalysis: vi.fn(), onCloseReview: vi.fn(), onConfirmReview: vi.fn(),
    onOpenEdit: vi.fn(), onEditMinutesChange: vi.fn(), onCloseEdit: vi.fn(), onApplyEdit: vi.fn(), onClearEdit: vi.fn(),
    onOpenAdd: vi.fn(), onAddEpisodeChange: vi.fn(), onAddMinutesChange: vi.fn(), onCloseAdd: vi.fn(), onApplyAdd: vi.fn(), onEditInstead: vi.fn(),
    ...overrides,
  };
}

/**
 * Builds one review row in whole minutes.
 * @param episode The episode number.
 * @param measured Measured minutes.
 * @param result What confirming would do.
 * @returns The row.
 */
function reviewRow(episode: number, measured: number, result: EpisodeReanalysisRow['result']): EpisodeReanalysisRow {
  return { episode, basename: `e${episode}.mkv`, currentMs: 24 * 60_000, currentMinutes: 24, currentSource: 'measured', measuredMs: measured * 60_000, measuredMinutes: measured, result };
}

describe('EpisodeDurationsDialogs edit modal', () => {
  it('shows the typed minutes and offers Clear and Apply when the episode allows them', () => {
    const model = viewModel({ editView: { title: 'Episode 01 duration', minutes: '23', sourceLine: 'Measured from the file', canApply: true, canClear: true } });
    render(<EpisodeDurationsDialogs viewModel={model} />);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText('Minutes')).toHaveValue(23);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear duration' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));

    expect(model.onClearEdit).toHaveBeenCalledTimes(1);
    expect(model.onApplyEdit).toHaveBeenCalledTimes(1);
  });

  it('disables Clear and Apply when there is nothing to clear and no valid minutes', () => {
    render(<EpisodeDurationsDialogs viewModel={viewModel({ editView: { title: 'Episode 02 duration', minutes: '0', sourceLine: 'Not measured yet', canApply: false, canClear: false } })} />);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByRole('button', { name: 'Clear duration' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('renders no modal while nothing is open', () => {
    render(<EpisodeDurationsDialogs viewModel={viewModel()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('EpisodeDurationsDialogs add modal', () => {
  it('shows the long hint and Edit instead for a duplicate, with Add disabled', () => {
    const model = viewModel({
      addView: {
        episode: '1', minutes: '45', episodeHint: 'Next after episode 2', duplicateMessage: 'Episode 1 already has 24 min.', duplicateEpisode: 1,
        editInsteadLabel: 'Edit episode 1 instead', isLongHintVisible: true, canAdd: false,
      },
    });
    render(<EpisodeDurationsDialogs viewModel={model} />);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByLabelText('Episode')).toHaveValue(1);
    expect(within(dialog).getByLabelText('Minutes')).toHaveValue(45);
    expect(within(dialog).getByText('Above 30 min: marked as long')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit episode 1 instead' }));
    expect(model.onEditInstead).toHaveBeenCalledTimes(1);
  });

  it('adds a valid new episode, without the long hint or Edit instead', () => {
    const model = viewModel({ addView: { episode: '3', minutes: '24', episodeHint: 'Next after episode 2', isLongHintVisible: false, canAdd: true } });
    render(<EpisodeDurationsDialogs viewModel={model} />);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByText('Above 30 min: marked as long')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /instead/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    expect(model.onApplyAdd).toHaveBeenCalledTimes(1);
  });
});

describe('EpisodeReanalysisReviewModal', () => {
  it('shows the chips and rows of a review, and tries again from an interruption', () => {
    const review = toEpisodeReviewView({ folder: 'D:/Anime/X', review: { outcome: 'ok', status: 'interrupted', filesRecognized: 2, rows: [reviewRow(1, 46, 'update')] } });
    const model = viewModel({ review, visibleReviewRows: [...review.rows] });
    render(<EpisodeDurationsDialogs viewModel={model} />);
    const dialog = screen.getByRole('dialog');

    expect(within(within(dialog).getByTestId('episode-review-chips')).getByText('1 measured')).toBeInTheDocument();
    expect(within(dialog).getAllByTestId('episode-review-row')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(model.onReanalyze).toHaveBeenCalledTimes(1);
  });

  it('shows neither chips, a table, nor Try again for a review that only closes', () => {
    const review = toEpisodeReviewView({ folder: 'D:/Anime/X', review: { outcome: 'ok', status: 'no_folder', filesRecognized: 0, rows: [] } });
    render(<EpisodeDurationsDialogs viewModel={viewModel({ review })} />);
    const dialog = screen.getByRole('dialog');

    expect(within(dialog).queryByTestId('episode-review-chips')).toBeNull();
    expect(within(dialog).queryByRole('grid')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Try again' })).toBeNull();
  });
});

describe('EpisodeDurationsSection body', () => {
  it('keeps the tooltip trigger out of the tab order, mutes a row with no value, and shows the notes', () => {
    const { container } = render(<EpisodeDurationsSection viewModel={viewModel({ notes: ['Long-episode marks apply to TV series only.'] })} />);
    const [measured, empty] = screen.getAllByTestId('episode-durations-row');

    expect(container.querySelector('[data-slot="tooltip-trigger"]')).toHaveAttribute('tabindex', '-1');
    expect(within(measured as HTMLElement).getByText('24 min')).toHaveClass('text-foreground');
    expect(within(empty as HTMLElement).getByText('—')).toHaveClass('text-muted');
    expect(screen.getByText('Long-episode marks apply to TV series only.')).toBeInTheDocument();
  });
});
