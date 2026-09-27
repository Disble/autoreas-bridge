import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMetadataLookupSource } from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { AnimeEditorFormPanel } from '../AnimeEditorFormPanel';
import type { AnimeEditorWorkspaceViewModel } from '../anime-editor-workspace.types';

afterEach(cleanup);

/**
 * A fake lookup source resolving with no candidates by default, so a test
 * only overrides what it cares about instead of driving a real Wails call.
 * @returns A fake source suitable for the panel's injected lookup modal.
 */
function fakeMetadataLookupSource(): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '', candidates: [] }),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '' }),
  };
}

/**
 * Builds a fully-stubbed workspace view model for one rendered form panel case.
 * @param overrides Fields to replace on the default fixture.
 * @returns The view model.
 */
function createViewModel(overrides: Partial<AnimeEditorWorkspaceViewModel> = {}): AnimeEditorWorkspaceViewModel {
  return {
    query: '', filter: 'watching', items: [],
    listWindow: { scrollRef: { current: null }, onScroll: vi.fn(), visibleCount: 0 },
    selectedAnimeId: 'anime-1',
    selectedRecord: { animeId: 'anime-1', modifiedAt: 1, frequent: { name: 'Frieren', status: 0, progress: 12, totalEpisodes: 28, active: true, kind: 1, page: 'https://x', folder: 'D:/a', placements: [] }, details: { genres: [], studios: { kind: 'values', values: [] }, origin: 'Manga', duration: 24, premieredAt: 1775968858358, cover: { type: 'url', path: 'https://c.jpg' } } } as unknown as AnimeEditorWorkspaceViewModel['selectedRecord'],
    draft: { name: 'Frieren', status: 0, progress: '12', totalEpisodes: '28', kind: '1', page: 'https://x', folder: 'D:/a', premieredAt: '1775968858358', origin: 'Manga', duration: '24', genres: '', studios: '', coverType: 'url', coverPath: 'https://c.jpg' },
    appliedMetadata: undefined,
    cover: { status: 'placeholder' },
    metadataLookupSource: fakeMetadataLookupSource(),
    isLoadingList: false, isLoadingRecord: false, isSaving: false, isApplyingSchedule: false, isDirty: false,
    isScheduleModalOpen: false, scheduleBoard: undefined, feedback: undefined, validationMessage: undefined, scheduleFeedback: undefined,
    isDetailsOpen: false, isGuardOpen: false, canSave: false,
    onQueryChange: vi.fn(), onFilterChange: vi.fn(), onSelectAnime: vi.fn(), onDraftChange: vi.fn(),
    onCoverImageError: vi.fn(),
    onToggleDetails: vi.fn(), onDiscardChanges: vi.fn(), onPickFolder: vi.fn(), onSave: vi.fn(), onDeactivate: vi.fn(), onRestore: vi.fn(), onRepeat: vi.fn(),
    lifecycleConfirmation: undefined, onRequestLifecycleAction: vi.fn(), onCancelLifecycleAction: vi.fn(), onConfirmLifecycleAction: vi.fn(),
    onMetadataApplied: vi.fn(), onMetadataUndo: vi.fn(),
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
    const onRequestLifecycleAction = vi.fn();
    const onDeactivate = vi.fn();
    const viewModel = createViewModel({ onRequestLifecycleAction, onDeactivate });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate anime' }));

    expect(onRequestLifecycleAction).toHaveBeenCalledWith('deactivate');
    expect(onDeactivate).not.toHaveBeenCalled();
  });

  it('shows Restore (not Deactivate) for an already-deactivated anime', () => {
    const inactiveRecord = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, active: false } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
    const viewModel = createViewModel({ selectedRecord: inactiveRecord });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Restore' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate anime' })).not.toBeInTheDocument();
  });

  it('asks for confirmation instead of restoring immediately', () => {
    const onRequestLifecycleAction = vi.fn();
    const onRestore = vi.fn();
    const inactiveRecord = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, active: false } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
    const viewModel = createViewModel({ selectedRecord: inactiveRecord, onRequestLifecycleAction, onRestore });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));

    expect(onRequestLifecycleAction).toHaveBeenCalledWith('restore');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('keeps Repeat visible when the draft Status changes, because the gate reads the saved record (D10)', () => {
    // Record is finished (status > 0); draft is deliberately left at 0
    // ("Viendo") to prove the gate cannot be reading the draft -- if it read
    // `viewModel.draft.status` instead of `record.frequent.status`, Repeat
    // would be hidden here even though the saved record says it is finished.
    const finishedRecord = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, status: 1 } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ selectedRecord: finishedRecord, draft: { ...createViewModel().draft, status: 0 }, onDraftChange });

    const { rerender } = render(<AnimeEditorFormPanel viewModel={viewModel} />);
    expect(screen.getByRole('button', { name: 'Repeat' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Viendo Status/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Finalizado' }));
    expect(onDraftChange).toHaveBeenCalledWith('status', '1');

    // Re-render as the composed hook would after applying that draft change;
    // the saved record (and therefore Repeat's visibility) is unaffected.
    rerender(<AnimeEditorFormPanel viewModel={createViewModel({ selectedRecord: finishedRecord, draft: { ...viewModel.draft, status: 1 }, onDraftChange })} />);
    expect(screen.getByRole('button', { name: 'Repeat' })).toBeInTheDocument();
  });

  describe.each([
    { status: 1, active: true, expectRepeat: true, expectRestore: false, expectDeactivate: true, description: 'a finished active anime shows Repeat alongside Deactivate' },
    { status: 1, active: false, expectRepeat: true, expectRestore: true, expectDeactivate: false, description: 'a finished inactive anime shows Repeat and Restore together (correct overlap, not a defect)' },
    { status: 0, active: true, expectRepeat: false, expectRestore: false, expectDeactivate: true, description: 'an unfinished active anime shows neither Repeat nor Restore' },
    { status: 0, active: false, expectRepeat: false, expectRestore: true, expectDeactivate: false, description: 'an unfinished inactive anime shows Restore but not Repeat' },
  ])('lifecycle button visibility across status/active combinations (D9 guard) — $description', ({ status, active, expectRepeat, expectRestore, expectDeactivate }) => {
    it('renders exactly the expected button set', () => {
      const record = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, status, active } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
      const viewModel = createViewModel({ selectedRecord: record });

      render(<AnimeEditorFormPanel viewModel={viewModel} />);

      expect(screen.queryByRole('button', { name: 'Repeat' }) !== null).toBe(expectRepeat);
      expect(screen.queryByRole('button', { name: 'Restore' }) !== null).toBe(expectRestore);
      expect(screen.queryByRole('button', { name: 'Deactivate anime' }) !== null).toBe(expectDeactivate);
    });
  });

  it('asks for confirmation instead of repeating immediately', () => {
    const onRequestLifecycleAction = vi.fn();
    const onRepeat = vi.fn();
    const finishedRecord = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, status: 1 } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
    const viewModel = createViewModel({ selectedRecord: finishedRecord, onRequestLifecycleAction, onRepeat });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));

    expect(onRequestLifecycleAction).toHaveBeenCalledWith('repeat');
    expect(onRepeat).not.toHaveBeenCalled();
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

describe('AnimeEditorFormPanel -- MyAnimeList metadata lookup (SDD-70 slice 7)', () => {
  it('renders the Fetch metadata action beside Name, enabled once Name is non-empty', () => {
    const viewModel = createViewModel({ draft: { ...createViewModel().draft, name: 'Bleach' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeEnabled();
  });

  it('disables the Fetch metadata action while Name is empty', () => {
    const viewModel = createViewModel({ draft: { ...createViewModel().draft, name: '' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeDisabled();
  });

  it('shows no Undo affordance when nothing has been applied', () => {
    const viewModel = createViewModel();

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
  });

  it('forwards a typed Name to onDraftChange, exactly as hand-typing any other field would', () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Naruto' } });

    expect(onDraftChange).toHaveBeenCalledWith('name', 'Naruto');
  });

  it('shows Undo without an unfilled report when nothing was left unfilled', () => {
    const viewModel = createViewModel({
      appliedMetadata: {
        patch: { name: 'Bleach: Sennen Kessen-hen' },
        previous: { name: 'Bleach' },
        appliedFields: ['name'],
        unfilled: [],
      },
    });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Undo autofill' })).toBeInTheDocument();
    expect(screen.queryByText(/MyAnimeList did not provide/)).not.toBeInTheDocument();
  });

  it('shows Undo and the unfilled report once metadata is applied, and undoing calls onMetadataUndo', () => {
    const onMetadataUndo = vi.fn();
    const viewModel = createViewModel({
      onMetadataUndo,
      appliedMetadata: {
        patch: { name: 'Bleach: Sennen Kessen-hen' },
        previous: { name: 'Bleach' },
        appliedFields: ['name'],
        unfilled: ['kind', 'studios'],
      },
    });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    expect(screen.getByText('MyAnimeList did not provide: kind, studios')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo autofill' }));

    expect(onMetadataUndo).toHaveBeenCalledTimes(1);
  });

  it('confirming a candidate in the lookup modal reports the mapped selection to onMetadataApplied', async () => {
    const onMetadataApplied = vi.fn();
    const source: AnimeMetadataLookupSource = {
      SearchMyAnimeList: vi.fn().mockResolvedValue({
        outcome: 'applied',
        message: 'ok',
        candidates: [{ malId: 41467, name: 'Bleach: Sennen Kessen-hen' }],
      }),
      GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', title: 'Bleach: Sennen Kessen-hen' }),
    };
    const viewModel = createViewModel({
      draft: { ...createViewModel().draft, name: 'Bleach' },
      metadataLookupSource: source,
      onMetadataApplied,
    });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fetch metadata' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bleach' } });
    fireEvent.click(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this match' }));

    await vi.waitFor(() => {
      expect(onMetadataApplied).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'Bleach: Sennen Kessen-hen' }),
      );
    });
  });
});

describe('AnimeEditorFormPanel saved-cover header', () => {
  it('renders the selected record cover before the title', () => {
    const viewModel = createViewModel({ cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,x' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    const cover = screen.getByTestId('anime-editor-header-cover-image');
    expect(cover).toHaveAttribute('src', 'data:image/jpeg;base64,x');
    // "before title" is a layout claim, so assert the document order.
    expect(cover.compareDocumentPosition(screen.getByText('Frieren')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reports a header thumbnail decode failure for the selected anime', () => {
    const onCoverImageError = vi.fn();
    const viewModel = createViewModel({ cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,x' }, onCoverImageError });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.error(screen.getByTestId('anime-editor-header-cover-image'));

    // The workspace owns the degradation: the panel only names the anime whose
    // thumbnail failed, so a silent handler would leave the broken image up.
    expect(onCoverImageError).toHaveBeenCalledExactlyOnceWith('anime-1');
  });

  it('renders the shared placeholder when the selected record has no saved cover', () => {
    const viewModel = createViewModel();

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByTestId('anime-editor-header-cover-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('anime-editor-header-cover-image')).toBeNull();
  });

  it('announces a pending cover with a shape-matching skeleton, and never a bare image', () => {
    const viewModel = createViewModel({ cover: { status: 'loading' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('status', { name: 'Loading anime cover...' })).toBeInTheDocument();
    expect(screen.queryByTestId('anime-editor-header-cover-image')).toBeNull();
    expect(screen.queryByTestId('anime-editor-header-cover-placeholder')).toBeNull();
  });

  it('renders no header cover at all until a record is loaded', () => {
    const viewModel = createViewModel({ selectedRecord: undefined });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.queryByTestId('anime-editor-header-cover')).toBeNull();
  });

  it('leaves the header thumbnail untouched when the cover source draft changes', () => {
    // The header shows the SAVED cover: a draft edit must not preview, so the
    // rendered source stays exactly what the resolved entry carried.
    const { rerender } = render(<AnimeEditorFormPanel viewModel={createViewModel({ cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,saved' } })} />);

    rerender(<AnimeEditorFormPanel viewModel={createViewModel({ draft: { ...createViewModel().draft, coverPath: 'D:/covers/other.jpg', coverType: 'image' }, cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,saved' } })} />);

    expect(screen.getByTestId('anime-editor-header-cover-image')).toHaveAttribute('src', 'data:image/jpeg;base64,saved');
  });
});

describe('AnimeEditorFormPanel header title and status line', () => {
  it('prompts for a selection, as a title, while no anime is selected', () => {
    render(<AnimeEditorFormPanel viewModel={createViewModel({ selectedRecord: undefined })} />);

    // The empty selection is the only case with no anime name to show, so the
    // header must fall back to the prompt rather than render a blank heading.
    expect(screen.getByRole('heading', { name: 'Select an anime' })).toBeInTheDocument();
  });

  it.each([
    { isDirty: false, statusLine: 'Selected anime stays highlighted after each refresh.' },
    { isDirty: true, statusLine: 'You have unsaved changes.' },
  ])('tells the user whether the selected anime has unsaved edits ($statusLine)', ({ isDirty, statusLine }) => {
    render(<AnimeEditorFormPanel viewModel={createViewModel({ isDirty })} />);

    expect(screen.getByText(statusLine)).toBeInTheDocument();
  });
});
