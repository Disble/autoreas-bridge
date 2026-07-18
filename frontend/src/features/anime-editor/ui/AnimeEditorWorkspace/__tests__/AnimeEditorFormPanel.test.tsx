import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnimeEditorFormPanel } from '../AnimeEditorFormPanel';
import type { AnimeEditorWorkspaceViewModel } from '../anime-editor-workspace.types';

afterEach(cleanup);

function createViewModel(overrides: Partial<AnimeEditorWorkspaceViewModel> = {}): AnimeEditorWorkspaceViewModel {
  return {
    query: '', filter: 'watching', items: [],
    listWindow: { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 0 },
    selectedAnimeId: 'anime-1',
    selectedRecord: { animeId: 'anime-1', modifiedAt: 1, frequent: { name: 'Frieren', status: 0, progress: 12, totalEpisodes: 28, active: true, kind: 1, page: 'https://x', folder: 'D:/a', placements: [] }, details: { genres: [], studios: { kind: 'values', values: [] }, origin: 'Manga', duration: 24, premieredAt: 1775968858358, cover: { type: 'url', path: 'https://c.jpg' } } } as unknown as AnimeEditorWorkspaceViewModel['selectedRecord'],
    draft: { name: 'Frieren', status: 0, progress: '12', totalEpisodes: '28', kind: '1', page: 'https://x', folder: 'D:/a', premieredAt: '1775968858358', origin: 'Manga', duration: '24', genres: '', studios: '', coverType: 'url', coverPath: 'https://c.jpg' },
    isLoadingList: false, isLoadingRecord: false, isSaving: false, isApplyingSchedule: false, isDirty: false,
    isScheduleModalOpen: false, scheduleBoard: undefined, feedback: undefined, validationMessage: undefined, scheduleFeedback: undefined,
    isDetailsOpen: false, isGuardOpen: false, canSave: false,
    onQueryChange: vi.fn(), onFilterChange: vi.fn(), onSelectAnime: vi.fn(), onDraftChange: vi.fn(),
    onToggleDetails: vi.fn(), onDiscardChanges: vi.fn(), onPickFolder: vi.fn(), onSave: vi.fn(), onDeactivate: vi.fn(),
    onOpenSchedule: vi.fn(), onCloseSchedule: vi.fn(), onApplySchedule: vi.fn(),
    onStayWithCurrentEditor: vi.fn(), onDiscardAndContinue: vi.fn(), onSaveAndContinue: vi.fn(),
    ...overrides,
  } as unknown as AnimeEditorWorkspaceViewModel;
}

describe('AnimeEditorFormPanel spurious-dirty guard', () => {
  it('does not emit any draft change while merely rendering a loaded record', async () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    await Promise.resolve();

    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('does not emit draft changes on mount even with the details section open', async () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange, isDetailsOpen: true });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    await Promise.resolve();

    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('does not emit draft changes when the record (and its status) is swapped', async () => {
    const onDraftChange = vi.fn();
    const first = createViewModel({ onDraftChange, draft: { ...createViewModel().draft, status: 0 } });
    const { rerender } = render(<AnimeEditorFormPanel viewModel={first} />);
    await Promise.resolve();

    const second = createViewModel({
      onDraftChange,
      selectedAnimeId: 'anime-2',
      draft: { ...createViewModel().draft, name: 'Beta', status: 1, coverType: 'image' },
    });
    rerender(<AnimeEditorFormPanel viewModel={second} />);
    await Promise.resolve();

    expect(onDraftChange).not.toHaveBeenCalled();
  });

  it('shows a loading skeleton (not the fields) while a record is loading', () => {
    const viewModel = createViewModel({ isLoadingRecord: true });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByTestId('anime-editor-form-skeleton')).toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });

  it('asks for confirmation instead of deactivating immediately', () => {
    const onRequestDeactivate = vi.fn();
    const onDeactivate = vi.fn();
    const viewModel = createViewModel({ onRequestDeactivate, onDeactivate });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate anime' }));

    expect(onRequestDeactivate).toHaveBeenCalledTimes(1);
    expect(onDeactivate).not.toHaveBeenCalled();
  });

  it('keeps the custom status chip options while changing status through the local select', () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange, draft: { ...createViewModel().draft, status: 0 } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: /Viendo Status/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Finalizado' }));

    expect(onDraftChange).toHaveBeenCalledWith('status', '1');
    expect(screen.getAllByText('Viendo').length).toBeGreaterThan(0);
  });

  it('changes the plain type select through the shared labeled-select semantics', () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange, draft: { ...createViewModel().draft, kind: '' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: /Type/i }));
    fireEvent.click(screen.getByRole('option', { name: 'OVA' }));

    expect(onDraftChange).toHaveBeenCalledWith('kind', '3');
  });

  it('changes the plain cover source select through the shared labeled-select semantics', () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    fireEvent.click(screen.getByLabelText('Cover source'));
    fireEvent.click(screen.getByRole('option', { name: 'Image' }));

    expect(onDraftChange).toHaveBeenCalledWith('coverType', 'image');
  });
});
