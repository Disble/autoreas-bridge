import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeEditorWorkspaceViewModel } from '../anime-editor-workspace.types';
import { AnimeEditorDialogs } from '../AnimeEditorDialogs';

afterEach(cleanup);

/**
 * Builds the view model the dialogs read, with the unsaved-changes guard open.
 * @param overrides Fields to replace on the default fixture.
 * @returns The view model.
 */
function createViewModel(overrides: Partial<AnimeEditorWorkspaceViewModel> = {}): AnimeEditorWorkspaceViewModel {
  return {
    isGuardOpen: true, isGuardSaving: false, isGuardSaveBlocked: false, isSaving: false, lifecycleConfirmation: undefined, isScheduleModalOpen: false, scheduleBoard: undefined,
    onStayWithCurrentEditor: vi.fn(), onDiscardAndContinue: vi.fn(), onSaveAndContinue: vi.fn(),
    onCancelLifecycleAction: vi.fn(), onConfirmLifecycleAction: vi.fn(), onCloseSchedule: vi.fn(), onApplySchedule: vi.fn(),
    ...overrides,
  } as unknown as AnimeEditorWorkspaceViewModel;
}

describe('AnimeEditorDialogs unsaved-changes guard', () => {
  it('keeps its copy and answers Discard changes and Save and continue through the guard handlers', async () => {
    const viewModel = createViewModel();
    render(<AnimeEditorDialogs viewModel={viewModel} />);

    expect(await screen.findByText('Save and continue, discard and continue, or stay on the current editor state.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(viewModel.onDiscardAndContinue).toHaveBeenCalledTimes(1);
    expect(viewModel.onSaveAndContinue).toHaveBeenCalledTimes(1);
  });

  it('blocks only Save and continue while a re-analysis runs', async () => {
    render(<AnimeEditorDialogs viewModel={createViewModel({ isGuardSaveBlocked: true })} />);

    expect(await screen.findByRole('button', { name: 'Save and continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();
  });

  it('waits on any card save in flight, the Episodes card included', async () => {
    render(<AnimeEditorDialogs viewModel={createViewModel({ isGuardSaving: true })} />);

    expect(await screen.findByRole('button', { name: 'Stay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });
});
