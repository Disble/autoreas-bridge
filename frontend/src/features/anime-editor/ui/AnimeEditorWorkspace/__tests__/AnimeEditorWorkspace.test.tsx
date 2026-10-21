import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

/** Stands in for the workspace hook so this suite asserts composition only. */
const useAnimeEditorWorkspaceMock = vi.fn();

vi.mock('../use-anime-editor-workspace', () => ({
  useAnimeEditorWorkspace: () => useAnimeEditorWorkspaceMock(),
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';

describe('AnimeEditorWorkspace', () => {
  it('renders the split-pane editor shell', () => {
    const viewModel = {
      query: '',
      filter: 'watching',
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
      feedback: undefined,
      validationMessage: undefined,
      scheduleFeedback: undefined,
      isDetailsOpen: false,
      isGuardOpen: false,
      lifecycleConfirmation: undefined,
      canSave: true,
      onQueryChange: vi.fn(),
      onFilterChange: vi.fn(),
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
      scheduleWeek: { status: 'ready', days: [{ id: 'Lunes', label: 'Lunes', position: { order: 1, total: 2 }, ariaLabel: 'Lunes: 1 of 2' }] },
    };
    // The panels read their memoized slices; the full view model carries every field they read.
    useAnimeEditorWorkspaceMock.mockReturnValue({ ...viewModel, listPanel: viewModel, formPanel: viewModel });

    render(<MemoryRouter><AnimeEditorWorkspace /></MemoryRouter>);

    // The Editor title belongs to the route's page header, above the Library | Create tabs.
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate anime' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Lunes: 1 of 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open schedule editor' })).toBeInTheDocument();
  });
});
