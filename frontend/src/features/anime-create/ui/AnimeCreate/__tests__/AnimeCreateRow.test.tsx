import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnimeMetadataLookupSource } from '../../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { AnimeCreateRow } from '../AnimeCreateRow';
import { createAnimeCreateRow } from '../anime-create.helpers';
import type { AnimeCreateRowDraft, AnimeCreateViewModel } from '../anime-create.types';

/**
 * A fake lookup source resolving with no candidates by default, so a test
 * only overrides what it cares about instead of driving a real Wails call.
 * @returns A fake source suitable for the row's injected lookup modal.
 */
function fakeMetadataLookupSource(): AnimeMetadataLookupSource {
  return {
    SearchMyAnimeList: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '', candidates: [] }),
    GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'no_op', message: '' }),
  };
}

/**
 * Builds a minimal view model, so a test only overrides the row-facing
 * fields it exercises instead of restating every one of
 * {@link AnimeCreateViewModel}'s callbacks.
 * @param overrides Per-test field replacements.
 * @returns A view model suitable for rendering one {@link AnimeCreateRow}.
 */
function createViewModel(overrides: Partial<AnimeCreateViewModel> = {}): AnimeCreateViewModel {
  return {
    rows: [],
    draftEntries: [],
    lockedAnimeIds: [],
    nameConflicts: {},
    appliedMetadataByRow: {},
    metadataLookupSource: fakeMetadataLookupSource(),
    isSubmitting: false,
    canRemoveRow: true,
    canOpenBoard: false,
    isBoardOpen: false,
    isRemoveConfirmOpen: false,
    onAddRow: vi.fn(),
    onRemoveRow: vi.fn(),
    onConfirmRemove: vi.fn(),
    onCancelRemove: vi.fn(),
    onRowChange: vi.fn(),
    onMetadataApplied: vi.fn(),
    onMetadataUndo: vi.fn(),
    onBrowseFolder: vi.fn(),
    onBrowseCover: vi.fn(),
    onOpenBoard: vi.fn(),
    onCloseBoard: vi.fn(),
    onApplyCreateSubmit: vi.fn(),
    ...overrides,
  };
}

/**
 * Builds one draft row, so a test only overrides the field it cares about.
 * @param overrides Per-test field replacements.
 * @returns A draft row ready to render.
 */
function draftRow(overrides: Partial<AnimeCreateRowDraft> = {}): AnimeCreateRowDraft {
  return { ...createAnimeCreateRow(1), ...overrides };
}

describe('AnimeCreateRow -- MyAnimeList metadata lookup (SDD-70 slice 6)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the Fetch metadata action outside the optional-metadata disclosure, reachable while it is collapsed', () => {
    const row = draftRow({ name: 'Bleach' });
    render(<AnimeCreateRow index={0} row={row} viewModel={createViewModel()} />);

    // Disclosure starts collapsed -- its own content is not visible.
    expect(screen.getByLabelText('Watched episodes')).not.toBeVisible();

    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeInTheDocument();
  });

  it('keeps the Fetch metadata action reachable once the disclosure is expanded', () => {
    const row = draftRow({ name: 'Bleach' });
    render(<AnimeCreateRow index={0} row={row} viewModel={createViewModel()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Optional details' }));

    expect(screen.getByLabelText('Watched episodes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeInTheDocument();
  });

  it('disables the Fetch metadata action while Name is empty', () => {
    const row = draftRow({ name: '' });
    render(<AnimeCreateRow index={0} row={row} viewModel={createViewModel()} />);

    expect(screen.getByRole('button', { name: 'Fetch metadata' })).toBeDisabled();
  });

  it('shows no Undo affordance for a row with nothing applied', () => {
    const row = draftRow({ name: 'Bleach' });
    render(<AnimeCreateRow index={0} row={row} viewModel={createViewModel()} />);

    expect(screen.queryByRole('button', { name: 'Undo autofill' })).not.toBeInTheDocument();
  });

  it('shows Undo and the unfilled report once metadata is applied, and undoing calls onMetadataUndo', () => {
    const row = draftRow({ name: 'Bleach' });
    const onMetadataUndo = vi.fn();
    const viewModel = createViewModel({
      appliedMetadataByRow: {
        [row.draftId]: {
          patch: { name: 'Bleach: Sennen Kessen-hen' },
          previous: { name: 'Bleach' },
          appliedFields: ['name'],
          unfilled: ['kind', 'studios'],
        },
      },
      onMetadataUndo,
    });
    render(<AnimeCreateRow index={0} row={row} viewModel={viewModel} />);

    expect(screen.getByText('MyAnimeList did not provide: kind, studios')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo autofill' }));

    expect(onMetadataUndo).toHaveBeenCalledWith(row.draftId);
  });

  it('shows Undo without an unfilled report when nothing was left unfilled', () => {
    const row = draftRow({ name: 'Bleach' });
    const viewModel = createViewModel({
      appliedMetadataByRow: {
        [row.draftId]: {
          patch: { name: 'Bleach: Sennen Kessen-hen' },
          previous: { name: 'Bleach' },
          appliedFields: ['name'],
          unfilled: [],
        },
      },
    });
    render(<AnimeCreateRow index={0} row={row} viewModel={viewModel} />);

    expect(screen.getByRole('button', { name: 'Undo autofill' })).toBeInTheDocument();
    expect(screen.queryByText(/MyAnimeList did not provide/)).not.toBeInTheDocument();
  });

  it('confirming a candidate in the lookup modal reports the mapped selection to onMetadataApplied for this row', async () => {
    const row = draftRow({ name: 'Bleach' });
    const onMetadataApplied = vi.fn();
    const source: AnimeMetadataLookupSource = {
      SearchMyAnimeList: vi.fn().mockResolvedValue({
        outcome: 'applied',
        message: 'ok',
        candidates: [{ malId: 41467, name: 'Bleach: Sennen Kessen-hen' }],
      }),
      GetMyAnimeListDetail: vi.fn().mockResolvedValue({ outcome: 'applied', message: 'ok', title: 'Bleach: Sennen Kessen-hen' }),
    };
    render(<AnimeCreateRow index={0} row={row} viewModel={createViewModel({ metadataLookupSource: source, onMetadataApplied })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Fetch metadata' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'bleach' } });
    fireEvent.click(await screen.findByRole('button', { name: /Bleach: Sennen Kessen-hen/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this match' }));

    await vi.waitFor(() => {
      expect(onMetadataApplied).toHaveBeenCalledExactlyOnceWith(
        row.draftId,
        expect.objectContaining({ name: 'Bleach: Sennen Kessen-hen' }),
      );
    });
  });
});
