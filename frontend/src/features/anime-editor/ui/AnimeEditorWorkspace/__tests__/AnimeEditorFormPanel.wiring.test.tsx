import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAnimeEstadoLabel } from '../../../../../shared/helpers/anime-estado.helpers';
import { AnimeEditorFormPanel } from '../AnimeEditorFormPanel';
import type { AnimeEditorFormPanelViewModel } from '../anime-editor-workspace.types';

afterEach(cleanup);

/** The saved record of the default fixture: an active anime with status 0. */
const RECORD = {
  animeId: 'anime-1', modifiedAt: 1,
  frequent: { name: 'Frieren', status: 0, progress: 12, totalEpisodes: 28, active: true, kind: 1, page: 'https://x', folder: 'D:/a', placements: [] },
  details: { genres: [], studios: { kind: 'values', values: [] }, origin: 'Manga', duration: 24, cover: { type: 'url', path: 'https://c.jpg' } },
} as unknown as AnimeEditorFormPanelViewModel['selectedRecord'];

/**
 * Builds the form panel's slice for one case: a loaded, clean record with the details open.
 * @param overrides Fields to replace on the default fixture.
 * @returns The slice.
 */
function slice(overrides: Partial<AnimeEditorFormPanelViewModel> = {}): AnimeEditorFormPanelViewModel {
  return {
    selectedRecord: RECORD,
    draft: { name: 'Frieren', status: 0, progress: '12', totalEpisodes: '28', kind: '1', page: 'https://x', folder: 'D:/a', origin: 'Manga', duration: '24', genres: '', studios: '', coverType: 'url', coverPath: 'https://c.jpg' },
    cover: { status: 'placeholder' }, appliedMetadata: undefined,
    metadataLookupSource: { SearchMyAnimeList: vi.fn(), GetMyAnimeListDetail: vi.fn() },
    coverPreviewSource: {},
    isLoadingRecord: false, isSaving: false, isRecordDirty: false, canSave: false, isDetailsOpen: true,
    onCoverImageError: vi.fn(), onDraftChange: vi.fn(), onToggleDetails: vi.fn(), onDiscardChanges: vi.fn(),
    onPickFolder: vi.fn(), onPickCoverFile: vi.fn(), onSave: vi.fn(), onMetadataApplied: vi.fn(), onMetadataUndo: vi.fn(),
    onRequestLifecycleAction: vi.fn(),
    ...overrides,
  } as unknown as AnimeEditorFormPanelViewModel;
}

describe('AnimeEditorFormPanel field wiring', () => {
  it.each([
    ['Watched episodes', 'progress', '13'],
    ['Total episodes', 'totalEpisodes', '30'],
    ['Download page', 'page', 'https://y'],
    ['Folder', 'folder', 'D:/b'],
    ['Duration', 'duration', '25'],
    ['Origin', 'origin', 'Novel'],
    ['Cover image URL', 'coverPath', 'https://d.jpg'],
    ['Genres', 'genres', 'Drama'],
    ['Studios', 'studios', 'Madhouse'],
  ])('forwards an edit of %s as the %s draft field', (label, field, value) => {
    const viewModel = slice();
    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    fireEvent.change(screen.getByLabelText(label, { selector: 'input' }), { target: { value } });

    expect(viewModel.onDraftChange).toHaveBeenCalledExactlyOnceWith(field, value);
  });

  it('offers a cover file path with its own picker for an image cover, and a URL for any other source', () => {
    const viewModel = slice({ draft: { ...slice().draft, coverType: 'image', coverPath: 'D:/c.jpg' } });
    render(<AnimeEditorFormPanel viewModel={viewModel} />);

    expect(screen.queryByRole('textbox', { name: 'Cover image URL' })).toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Cover file path' }), { target: { value: 'D:/d.jpg' } });
    expect(viewModel.onDraftChange).toHaveBeenCalledExactlyOnceWith('coverPath', 'D:/d.jpg');

    const folderBrowse = screen.getByRole('button', { name: 'Choose folder' });
    const coverBrowse = screen.getByRole('button', { name: 'Choose cover image' });
    expect(folderBrowse).toHaveTextContent(/^$/);
    expect(coverBrowse).toHaveTextContent(/^$/);
    fireEvent.click(folderBrowse);
    expect(viewModel.onPickFolder).toHaveBeenCalledTimes(1);
    expect(viewModel.onPickCoverFile).not.toHaveBeenCalled();
    fireEvent.click(coverBrowse);
    expect(viewModel.onPickCoverFile).toHaveBeenCalledTimes(1);
  });

  it('previews the draft cover beside the cover field before it is saved', async () => {
    const previewAnimeCover = vi.fn().mockResolvedValue({ source: 'cover', dataUrl: 'data:image/jpeg;base64,draft' });
    render(<AnimeEditorFormPanel viewModel={slice({ coverPreviewSource: { previewAnimeCover } })} />);

    expect(await screen.findByRole('img', { name: 'Cover preview' })).toHaveAttribute('src', 'data:image/jpeg;base64,draft');
    expect(previewAnimeCover).toHaveBeenCalledExactlyOnceWith('https://c.jpg');
  });
});

describe('AnimeEditorFormPanel actions and empty selection', () => {
  it('prompts for a pick with no fields and no status chip, and disables Deactivate, while no anime is selected', () => {
    render(<AnimeEditorFormPanel viewModel={slice({ selectedRecord: undefined })} />);

    expect(screen.getByText('Pick an anime from the left to start editing.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Watched episodes')).toBeNull();
    expect(screen.queryByText(getAnimeEstadoLabel(0))).toBeNull();
    expect(screen.getByRole('button', { name: 'Deactivate anime' })).toBeDisabled();
  });

  it('enables Deactivate and Save for a selected, saveable record, and disables both while it saves', () => {
    const { rerender } = render(<AnimeEditorFormPanel viewModel={slice({ canSave: true })} />);

    // The header carries the status chip; the Status select repeats the label, so the query stays in the header.
    expect(within(screen.getByRole('heading', { level: 4 }).closest('header') as HTMLElement).getByText(getAnimeEstadoLabel(0))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deactivate anime' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    rerender(<AnimeEditorFormPanel viewModel={slice({ canSave: true, isSaving: true })} />);
    expect(screen.getByRole('button', { name: 'Deactivate anime' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  it('keeps Save disabled while the draft cannot be saved', () => {
    render(<AnimeEditorFormPanel viewModel={slice({ canSave: false })} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
