import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeEditorWorkspaceViewModel } from '../anime-editor-workspace.types';
import { AnimeEditorDialogs } from '../AnimeEditorDialogs';

/** Stands in for the workspace hook so this suite asserts composition only. */
const useAnimeEditorWorkspaceMock = vi.fn();

vi.mock('../use-anime-editor-workspace', () => ({
  useAnimeEditorWorkspace: () => useAnimeEditorWorkspaceMock(),
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';
import { createEpisodesReadyWrapper } from './episode-duration-source.test-support';

/**
 * Renders the workspace over a complete stub view model.
 * @param overrides View-model fields the case replaces.
 * @returns The render result.
 */
function renderWorkspace(overrides: Record<string, unknown> = {}) {
  const viewModel = {
    query: '',
    filter: 'watching',
    facets: { statuses: [], kinds: [] },
    activeFacetCount: 0,
    items: [{ id: 'anime-1', animeId: 'anime-1', nombre: 'Frieren', subtitle: '12 watched', selected: true, hasCover: false, cover: { status: 'placeholder' } }],
    listEmptyState: 'none',
    listWindow: { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 1 },
    selectedRecord: { frequent: { name: 'Frieren' } },
    cover: { status: 'placeholder' },
    draft: { name: 'Frieren', status: 0, progress: '12', totalEpisodes: '28', kind: '', page: '', folder: '', origin: '', duration: '', genres: '', studios: '', coverPath: '' },
    isLoadingList: false,
    isLoadingRecord: false,
    isSaving: false,
    isApplyingSchedule: false,
    isDirty: true,
    isScheduleModalOpen: false,
    scheduleBoard: undefined,
    recordLoadError: undefined,
    validationMessage: undefined,
    scheduleFeedback: undefined,
    isDetailsOpen: false,
    isGuardOpen: false,
    lifecycleConfirmation: undefined,
    canSave: true,
    onQueryChange: vi.fn(),
    onFilterChange: vi.fn(),
    onStatusSelectionChange: vi.fn(),
    onKindSelectionChange: vi.fn(),
    onFacetsReset: vi.fn(),
    onClearCriteria: vi.fn(),
    onSelectAnime: vi.fn(),
    onDraftChange: vi.fn(),
    onCoverImageError: vi.fn(),
    onToggleDetails: vi.fn(),
    onDiscardChanges: vi.fn(),
    onSave: vi.fn(),
    onDeactivate: vi.fn(),
    onRequestLifecycleAction: vi.fn(),
    onCancelLifecycleAction: vi.fn(),
    onConfirmLifecycleAction: vi.fn(),
    onOpenSchedule: vi.fn(),
    onCloseSchedule: vi.fn(),
    onApplySchedule: vi.fn(),
    onStayWithCurrentEditor: vi.fn(),
    onDiscardAndContinue: vi.fn(),
    onSaveAndContinue: vi.fn(),
    episodes: { view: 'idle' },
    coverPreviewSource: {},
    scheduleWeek: { status: 'ready', days: [{ id: 'Lunes', label: 'Lunes', isScheduled: true, position: { order: 1, total: 2 }, ariaLabel: 'Lunes: 1 of 2' }], seasonDays: [] },
    ...overrides,
  };
  // The panels read their memoized slices; the full view model carries every field they read.
  useAnimeEditorWorkspaceMock.mockReturnValue({ ...viewModel, listPanel: viewModel, formPanel: viewModel });

  return render(<MemoryRouter><AnimeEditorWorkspace /></MemoryRouter>, { wrapper: createEpisodesReadyWrapper() });
}

describe('AnimeEditorWorkspace', () => {
  it('renders the split-pane editor shell with no alert when nothing persists on the surface', () => {
    const { container } = renderWorkspace();

    // The Editor title belongs to the route's page header, above the Library | Create tabs.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate anime' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Lunes: 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open schedule editor' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="alert-root"]')).toBeNull();
  });

  it('keeps a record load failure on the surface as a danger alert', () => {
    const { container } = renderWorkspace({ recordLoadError: 'The editor record could not be loaded.' });

    const alert = container.querySelector('[data-slot="alert-root"]');
    expect(alert).toHaveTextContent('The editor record could not be loaded.');
    expect(alert).toHaveClass('alert--danger');
  });
});

/**
 * Builds the view model the dialogs read, with the unsaved-changes guard open.
 * @param overrides Fields to replace on the default fixture.
 * @returns The view model.
 */
function createDialogsViewModel(overrides: Partial<AnimeEditorWorkspaceViewModel> = {}): AnimeEditorWorkspaceViewModel {
  return {
    isGuardOpen: true, isGuardSaving: false, isGuardSaveBlocked: false, isSaving: false, lifecycleConfirmation: undefined, isScheduleModalOpen: false, scheduleBoard: undefined,
    onStayWithCurrentEditor: vi.fn(), onDiscardAndContinue: vi.fn(), onSaveAndContinue: vi.fn(),
    onCancelLifecycleAction: vi.fn(), onConfirmLifecycleAction: vi.fn(), onCloseSchedule: vi.fn(), onApplySchedule: vi.fn(),
    ...overrides,
  } as unknown as AnimeEditorWorkspaceViewModel;
}

describe('AnimeEditorDialogs unsaved-changes guard', () => {
  it('keeps its copy and answers Discard changes and Save and continue through the guard handlers', async () => {
    const viewModel = createDialogsViewModel();
    render(<AnimeEditorDialogs viewModel={viewModel} />);

    expect(await screen.findByText('Save and continue, discard and continue, or stay on the current editor state.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(viewModel.onDiscardAndContinue).toHaveBeenCalledTimes(1);
    expect(viewModel.onSaveAndContinue).toHaveBeenCalledTimes(1);
  });

  it('blocks only Save and continue while a re-analysis runs', async () => {
    render(<AnimeEditorDialogs viewModel={createDialogsViewModel({ isGuardSaveBlocked: true })} />);

    expect(await screen.findByRole('button', { name: 'Save and continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stay' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeEnabled();
  });

  it('waits on any card save in flight, the Episodes card included', async () => {
    render(<AnimeEditorDialogs viewModel={createDialogsViewModel({ isGuardSaving: true })} />);

    expect(await screen.findByRole('button', { name: 'Stay' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });
});
