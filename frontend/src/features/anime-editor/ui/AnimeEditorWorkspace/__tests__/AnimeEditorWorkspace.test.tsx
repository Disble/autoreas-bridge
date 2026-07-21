import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

const useAnimeEditorWorkspaceMock = vi.fn();

vi.mock('../use-anime-editor-workspace', () => ({
  useAnimeEditorWorkspace: () => useAnimeEditorWorkspaceMock(),
}));

import { AnimeEditorWorkspace } from '../AnimeEditorWorkspace';

describe('AnimeEditorWorkspace', () => {
  it('renders the split-pane editor shell', () => {
    useAnimeEditorWorkspaceMock.mockReturnValue({
      query: '',
      filter: 'watching',
      items: [{ id: 'anime-1', animeId: 'anime-1', nombre: 'Frieren', subtitle: '12 watched', selected: true }],
      listWindow: { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 1 },
      selectedRecord: { frequent: { name: 'Frieren' } },
      draft: { name: 'Frieren', status: 0, progress: '12', totalEpisodes: '28', kind: '', page: '', folder: '', premieredAt: '', origin: '', duration: '', genres: '', studios: '', coverPath: '' },
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
      isDeactivateConfirmOpen: false,
      canSave: true,
      onQueryChange: vi.fn(),
      onFilterChange: vi.fn(),
      onSelectAnime: vi.fn(),
      onDraftChange: vi.fn(),
      onToggleDetails: vi.fn(),
      onDiscardChanges: vi.fn(),
      onSave: vi.fn(),
      onDeactivate: vi.fn(),
      onRequestDeactivate: vi.fn(),
      onCancelDeactivate: vi.fn(),
      onConfirmDeactivate: vi.fn(),
      onOpenSchedule: vi.fn(),
      onCloseSchedule: vi.fn(),
      onApplySchedule: vi.fn(),
      onStayWithCurrentEditor: vi.fn(),
      onDiscardAndContinue: vi.fn(),
      onSaveAndContinue: vi.fn(),
    });

    render(<MemoryRouter><AnimeEditorWorkspace /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate anime' })).toBeInTheDocument();
  });
});
