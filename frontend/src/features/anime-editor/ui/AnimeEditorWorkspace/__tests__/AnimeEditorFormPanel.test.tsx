import { cleanup, fireEvent, render as renderWithoutClient, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMetadataLookupSource } from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';
import { AnimeEditorFormPanel } from '../AnimeEditorFormPanel';
import type { AnimeEditorWorkspaceViewModel } from '../anime-editor-workspace.types';

afterEach(cleanup);

/**
 * Renders inside a query client whose `anime` module is ready, which the
 * cover field's preview reads through; `rerender` keeps the same client.
 * @param ui The element under test.
 * @returns The render result.
 */
function render(ui: ReactElement) {
  return renderWithoutClient(ui, { wrapper: createModulesTestWrapper(status('anime', 'ready')).wrapper });
}

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
    selectedRecord: { animeId: 'anime-1', modifiedAt: 1, frequent: { name: 'Frieren', status: 0, progress: 12, totalEpisodes: 28, active: true, kind: 1, page: 'https://x', folder: 'D:/a', placements: [] }, details: { genres: [], studios: { kind: 'values', values: [] }, origin: 'Manga', duration: 24, cover: { type: 'url', path: 'https://c.jpg' } } } as unknown as AnimeEditorWorkspaceViewModel['selectedRecord'],
    draft: { name: 'Frieren', status: 0, progress: '12', totalEpisodes: '28', kind: '1', page: 'https://x', folder: 'D:/a', origin: 'Manga', duration: '24', genres: '', studios: '', coverType: 'url', coverPath: 'https://c.jpg' },
    appliedMetadata: undefined,
    cover: { status: 'placeholder' },
    metadataLookupSource: fakeMetadataLookupSource(),
    coverPreviewSource: { previewAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }) },
    isLoadingList: false, isLoadingRecord: false, isSaving: false, isApplyingSchedule: false, isDirty: false, isRecordDirty: false,
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
  it('renders a loaded active record without emitting a draft change: placeholder cover, icon-only Fetch metadata, no Undo, no schedule or Episodes card', async () => {
    const onDraftChange = vi.fn();
    render(<AnimeEditorFormPanel viewModel={createViewModel({ onDraftChange })} />);
    await Promise.resolve();

    expect(onDraftChange).not.toHaveBeenCalled();
    // The Fetch metadata action sits beside Name, enabled once Name is non-empty.
    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toHaveTextContent(/^$/);
    // No Undo affordance when nothing has been applied.
    expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
    // The shared placeholder when the selected record has no saved cover.
    expect(screen.getByTestId('anime-editor-header-cover-placeholder')).toBeInTheDocument();
    expect(screen.queryByTestId('anime-editor-header-cover-image')).toBeNull();
    // The anime data card holds neither the schedule button nor the Episodes card.
    expect(screen.queryByRole('button', { name: 'Open schedule editor' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show episodes' })).toBeNull();
    // The status line tells the user the selected anime has no unsaved edits.
    expect(screen.getByText('Selected anime stays highlighted after each refresh.')).toBeInTheDocument();
  });

  it('forwards Name, status and cover source edits and the Deactivate request, and explains the Folder label', async () => {
    const onDraftChange = vi.fn();
    const onRequestLifecycleAction = vi.fn();
    const onDeactivate = vi.fn();
    render(<AnimeEditorFormPanel viewModel={createViewModel({ onDraftChange, onRequestLifecycleAction, onDeactivate })} />);

    // A typed Name reaches onDraftChange exactly as hand-typing any other field would.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Naruto' } });
    expect(onDraftChange).toHaveBeenCalledWith('name', 'Naruto');

    // The custom status chip options survive a status change through the local select.
    fireEvent.click(screen.getByRole('button', { name: /Viendo Status/i }));
    fireEvent.click(screen.getByRole('option', { name: 'Finalizado' }));
    expect(onDraftChange).toHaveBeenCalledWith('status', '1');
    expect(screen.getAllByText('Viendo').length).toBeGreaterThan(0);

    // Deactivate asks for confirmation instead of deactivating immediately.
    const deactivate = screen.getByRole('button', { name: 'Deactivate anime' });
    // Icon-only like Repeat and Restore, tinting danger on hover; its confirm dialog keeps the words.
    expect(deactivate).toHaveTextContent(/^$/);
    expect(deactivate).toHaveClass('hover:text-danger');
    fireEvent.click(deactivate);
    expect(onRequestLifecycleAction).toHaveBeenCalledWith('deactivate');
    expect(onDeactivate).not.toHaveBeenCalled();

    // The plain cover source select uses the shared labeled-select semantics.
    fireEvent.click(screen.getByRole('button', { name: 'More details' }));
    fireEvent.click(screen.getByLabelText('Cover source'));
    fireEvent.click(screen.getByRole('option', { name: 'Image' }));
    expect(onDraftChange).toHaveBeenCalledWith('coverType', 'image');

    // A folder change does not re-measure episode durations, as the Folder label explains.
    screen.getByRole('button', { name: 'About the folder and episode durations' }).focus();
    expect(await screen.findByText('Changing the folder does not recalculate episode durations. To measure them again, use "Re-analyze folder" in the Episodes card.')).toBeInTheDocument();
  });

  it('does not emit draft changes on mount with the details section open, and never offers a Premiere date input', async () => {
    const onDraftChange = vi.fn();
    render(<AnimeEditorFormPanel viewModel={createViewModel({ onDraftChange, isDetailsOpen: true })} />);
    await Promise.resolve();

    expect(onDraftChange).not.toHaveBeenCalled();
    // premieredAt is set by the backend on the first zero-to-positive watched
    // progress transition; authoring it here would let the UI overwrite it.
    expect(screen.queryByLabelText('Premiere date')).not.toBeInTheDocument();
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

  it('shows Restore (not Deactivate) for an already-deactivated anime and asks for confirmation instead of restoring immediately', () => {
    const onRequestLifecycleAction = vi.fn();
    const onRestore = vi.fn();
    const inactiveRecord = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, active: false } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
    const viewModel = createViewModel({ selectedRecord: inactiveRecord, onRequestLifecycleAction, onRestore });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Restore' })).toHaveTextContent(/^$/);
    expect(screen.queryByRole('button', { name: 'Deactivate anime' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect(onRequestLifecycleAction).toHaveBeenCalledWith('restore');
    expect(onRestore).not.toHaveBeenCalled();
  });

  it('keeps Repeat visible when the draft Status changes, because the gate reads the saved record (D10), and asks before repeating', () => {
    // Record is finished (status > 0); draft is deliberately left at 0
    // ("Viendo") to prove the gate cannot be reading the draft -- if it read
    // `viewModel.draft.status` instead of `record.frequent.status`, Repeat
    // would be hidden here even though the saved record says it is finished.
    const finishedRecord = { ...createViewModel().selectedRecord, frequent: { ...createViewModel().selectedRecord!.frequent, status: 1 } } as AnimeEditorWorkspaceViewModel['selectedRecord'];
    const onDraftChange = vi.fn();
    const onRequestLifecycleAction = vi.fn();
    const onRepeat = vi.fn();
    const viewModel = createViewModel({ selectedRecord: finishedRecord, draft: { ...createViewModel().draft, status: 0 }, onDraftChange, onRequestLifecycleAction, onRepeat });

    const { rerender } = render(<AnimeEditorFormPanel viewModel={viewModel} />);
    expect(screen.getByRole('button', { name: 'Repeat' })).toHaveTextContent(/^$/);

    // Repeat asks for confirmation instead of repeating immediately.
    fireEvent.click(screen.getByRole('button', { name: 'Repeat' }));
    expect(onRequestLifecycleAction).toHaveBeenCalledWith('repeat');
    expect(onRepeat).not.toHaveBeenCalled();

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

  it('changes the plain type select through the shared labeled-select semantics', () => {
    const onDraftChange = vi.fn();
    const viewModel = createViewModel({ onDraftChange, draft: { ...createViewModel().draft, kind: '' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);
    fireEvent.click(screen.getByRole('button', { name: /Type/i }));
    fireEvent.click(screen.getByRole('option', { name: 'OVA' }));

    expect(onDraftChange).toHaveBeenCalledWith('kind', '3');
  });
});

describe('AnimeEditorFormPanel -- MyAnimeList metadata lookup (SDD-70 slice 7)', () => {
  it('disables the Fetch metadata action while Name is empty', () => {
    const viewModel = createViewModel({ draft: { ...createViewModel().draft, name: '' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeDisabled();
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

  it('silently skips unfilled metadata and keeps Undo functional', () => {
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
    expect(screen.queryByText(/MyAnimeList did not provide/)).not.toBeInTheDocument();
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
  it('renders the selected record cover before the title and reports its decode failure for the selected anime', () => {
    const onCoverImageError = vi.fn();
    const viewModel = createViewModel({ cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,x' }, onCoverImageError });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    const cover = screen.getByTestId('anime-editor-header-cover-image');
    expect(cover).toHaveAttribute('src', 'data:image/jpeg;base64,x');
    // "before title" is a layout claim, so assert the document order.
    expect(cover.compareDocumentPosition(screen.getByText('Frieren')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.error(cover);
    // The workspace owns the degradation: the panel only names the anime whose
    // thumbnail failed, so a silent handler would leave the broken image up.
    expect(onCoverImageError).toHaveBeenCalledExactlyOnceWith('anime-1');
  });

  it('announces a pending cover with a shape-matching skeleton, and never a bare image', () => {
    const viewModel = createViewModel({ cover: { status: 'loading' } });

    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.getByRole('status', { name: 'Loading anime cover...' })).toBeInTheDocument();
    expect(screen.queryByTestId('anime-editor-header-cover-image')).toBeNull();
    expect(screen.queryByTestId('anime-editor-header-cover-placeholder')).toBeNull();
  });

  it('renders no header cover and prompts for a selection, as a title, until a record is loaded', () => {
    render(<AnimeEditorFormPanel viewModel={createViewModel({ selectedRecord: undefined })} />);

    expect(screen.queryByTestId('anime-editor-header-cover')).toBeNull();
    // The empty selection is the only case with no anime name to show, so the
    // header must fall back to the prompt rather than render a blank heading.
    expect(screen.getByRole('heading', { name: 'Select an anime' })).toBeInTheDocument();
  });

  it('leaves the header thumbnail untouched when the cover source draft changes', () => {
    // The header shows the SAVED cover: a draft edit must not preview, so the
    // rendered source stays exactly what the resolved entry carried.
    const { rerender } = render(<AnimeEditorFormPanel viewModel={createViewModel({ cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,saved' } })} />);

    rerender(<AnimeEditorFormPanel viewModel={createViewModel({ draft: { ...createViewModel().draft, coverPath: 'D:/covers/other.jpg', coverType: 'image' }, cover: { status: 'cover', dataUrl: 'data:image/jpeg;base64,saved' } })} />);

    expect(screen.getByTestId('anime-editor-header-cover-image')).toHaveAttribute('src', 'data:image/jpeg;base64,saved');
  });
});

describe('AnimeEditorFormPanel anime data card only', () => {
  it('reads only the anime data draft: episode edits elsewhere neither mark it unsaved nor enable its Discard changes', () => {
    render(<AnimeEditorFormPanel viewModel={createViewModel({ isDirty: true, isRecordDirty: false })} />);

    expect(screen.getByText('Selected anime stays highlighted after each refresh.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
  });

  it('tells the user about its own unsaved fields and discards them through its own handler', () => {
    const onDiscardChanges = vi.fn();
    render(<AnimeEditorFormPanel viewModel={createViewModel({ isRecordDirty: true, onDiscardChanges })} />);

    expect(screen.getByText('You have unsaved changes.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(onDiscardChanges).toHaveBeenCalledTimes(1);
  });
});
