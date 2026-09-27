import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { AnimeCoverEntry } from '../../../../../shared/anime-cover/use-anime-cover';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import type { AnimeEditorCoverResult, AnimeEditorCoverSource, AnimeEditorListItemViewModel } from '../anime-editor-workspace.types';
import { useAnimeEditorCover } from '../use-anime-editor-cover';
import { useAnimeEditorCovers } from '../use-anime-editor-covers';

/** Builds one rail row, carrying a cover unless a case says otherwise. */
function row(animeId: string, hasCover = true): AnimeEditorListItemViewModel {
  return { id: animeId, animeId, nombre: animeId, subtitle: '1 watched', selected: false, hasCover };
}

/** Builds the rail's cover lookup around one caller-controlled binding. */
function sourceWith(getAnimeCover?: AnimeEditorCoverSource['getAnimeCover']): AnimeEditorCoverSource {
  return { getAnimeCover };
}

/** Builds a binding that resolves every lookup with the same result. */
function resolving(result: AnimeEditorCoverResult) {
  return vi.fn().mockResolvedValue(result);
}

/** Builds a saved record carrying the given stored cover source. */
function savedRecord(animeId: string, coverPath?: string): AnimeEditorRecord {
  return {
    animeId,
    modifiedAt: 1,
    frequent: { name: animeId, status: 0, progress: 1, active: true, placements: [] },
    details: { genres: [], studios: { kind: 'values', values: [] }, cover: coverPath === undefined ? null : { path: coverPath } },
  };
}

/** A binding result for one revision of an anime's cover art. */
function art(revision: string): AnimeEditorCoverResult {
  return { dataUrl: `data:image/jpeg;base64,${revision}`, source: 'cover' };
}

/** A binding result converted to the cache entry it must produce. */
function artEntry(revision: string): AnimeCoverEntry {
  return { dataUrl: `data:image/jpeg;base64,${revision}`, status: 'cover' };
}

/** A cover-binding result carrying real thumbnail bytes. */
const RESOLVED_COVER: AnimeEditorCoverResult = { dataUrl: 'data:image/jpeg;base64,x', source: 'cover' };

/** The cache entry `RESOLVED_COVER` must resolve to. */
const COVER_ENTRY: AnimeCoverEntry = { dataUrl: 'data:image/jpeg;base64,x', status: 'cover' };

describe('useAnimeEditorCovers', () => {
  it('asks the binding only for visible rows whose DTO reports a cover', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));

    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1'), row('anime-2', false), row('anime-3')], 2, undefined, source));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(1);
    expect(source.getAnimeCover).toHaveBeenCalledWith('anime-1');
    // The coverless row is never asked for a cover, and its entry is held at the
    // placeholder so art cached before a cover removal cannot linger in it.
    expect(result.current.covers.get('anime-2')).toEqual({ status: 'placeholder' });
    // anime-3 is past the visible window: not looked up, not even invalidated.
    expect(result.current.covers.has('anime-3')).toBe(false);
  });

  it('resolves a window row only once it actually enters the window', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));
    const items = [row('anime-1'), row('anime-2')];
    const { result, rerender } = renderHook(({ visibleCount }: { readonly visibleCount: number }) => useAnimeEditorCovers(items, visibleCount, undefined, source), {
      initialProps: { visibleCount: 1 },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(1);

    rerender({ visibleCount: 2 });

    await waitFor(() => expect(result.current.covers.get('anime-2')).toEqual(COVER_ENTRY));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(2);
  });

  it('resolves each anime at most once while the rows are rebuilt by scrolling and filtering', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));
    const { result, rerender } = renderHook(({ items }: { readonly items: readonly AnimeEditorListItemViewModel[] }) => useAnimeEditorCovers(items, 2, undefined, source), {
      initialProps: { items: [row('anime-1')] },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));

    // The progressive window grew into a second row.
    rerender({ items: [row('anime-1'), row('anime-2')] });
    await waitFor(() => expect(result.current.covers.get('anime-2')).toEqual(COVER_ENTRY));

    // A filter rebuilt the same rows with fresh identities.
    rerender({ items: [row('anime-1'), row('anime-2')] });

    expect(source.getAnimeCover).toHaveBeenCalledTimes(2);
    expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY);
  });

  it('resolves the selected saved record even when its row is outside the window', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));

    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1')], 1, savedRecord('anime-9', 'https://example.com/anime-9.jpg'), source));

    await waitFor(() => expect(result.current.covers.get('anime-9')).toEqual(COVER_ENTRY));
    expect(source.getAnimeCover).toHaveBeenCalledWith('anime-9');
  });

  it('resolves the same anime again when its saved cover source changes', async () => {
    const source = sourceWith(vi.fn().mockResolvedValueOnce(art('A')).mockResolvedValueOnce(art('B')));
    const { result, rerender } = renderHook(({ record }: { readonly record: AnimeEditorRecord | undefined }) => useAnimeEditorCovers([], 0, record, source), {
      initialProps: { record: savedRecord('anime-1', 'https://a.jpg') },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('A')));

    rerender({ record: savedRecord('anime-1', 'https://b.jpg') });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('B')));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(2);
  });

  it('moves the detail header and the rail row to the new cover together', async () => {
    const source = sourceWith(vi.fn().mockResolvedValueOnce(art('A')).mockResolvedValueOnce(art('B')));
    const { result, rerender } = renderHook(
      ({ record }: { readonly record: AnimeEditorRecord | undefined }) => {
        const cache = useAnimeEditorCovers([row('anime-1')], 1, record, source);
        return { cache, header: useAnimeEditorCover(record, cache.covers) };
      },
      { initialProps: { record: savedRecord('anime-1', 'https://a.jpg') } },
    );

    await waitFor(() => expect(result.current.header).toEqual(artEntry('A')));

    rerender({ record: savedRecord('anime-1', 'https://b.jpg') });

    await waitFor(() => expect(result.current.header).toEqual(artEntry('B')));
    expect(result.current.cache.covers.get('anime-1')).toEqual(artEntry('B'));
  });

  it('does not resolve again when the record changes without a new saved cover source', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));
    const renamedRecord = (): AnimeEditorRecord => ({
      ...savedRecord('anime-1', 'https://a.jpg'),
      frequent: { name: 'Renamed', status: 1, progress: 7, active: true, placements: [] },
    });
    const { result, rerender } = renderHook(({ record }: { readonly record: AnimeEditorRecord | undefined }) => useAnimeEditorCovers([], 0, record, source), {
      initialProps: { record: savedRecord('anime-1', 'https://a.jpg') },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));

    rerender({ record: renamedRecord() });

    expect(source.getAnimeCover).toHaveBeenCalledTimes(1);
    expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY);
  });

  it('keeps the newest saved cover when the older lookup resolves late', async () => {
    let resolveOlder: (result: AnimeEditorCoverResult) => void = () => undefined;
    const older = new Promise<AnimeEditorCoverResult>((resolve) => {
      resolveOlder = resolve;
    });
    const source = sourceWith(vi.fn().mockReturnValueOnce(older).mockResolvedValueOnce(art('B')));
    const { result, rerender } = renderHook(({ record }: { readonly record: AnimeEditorRecord | undefined }) => useAnimeEditorCovers([], 0, record, source), {
      initialProps: { record: savedRecord('anime-1', 'https://a.jpg') },
    });

    rerender({ record: savedRecord('anime-1', 'https://b.jpg') });
    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('B')));

    // The superseded lookup for the OLD source lands after its replacement.
    await act(async () => {
      resolveOlder(art('A'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.covers.get('anime-1')).toEqual(artEntry('B'));
  });

  it('still applies a row lookup that is in flight when the record then names its source', async () => {
    let resolveRowLookup: (result: AnimeEditorCoverResult) => void = () => undefined;
    const source = sourceWith(
      vi.fn().mockReturnValue(
        new Promise<AnimeEditorCoverResult>((resolve) => {
          resolveRowLookup = resolve;
        }),
      ),
    );
    const { result, rerender } = renderHook(({ record }: { readonly record: AnimeEditorRecord | undefined }) => useAnimeEditorCovers([row('anime-1')], 1, record, source), {
      initialProps: { record: undefined as AnimeEditorRecord | undefined },
    });

    await waitFor(() => expect(source.getAnimeCover).toHaveBeenCalledTimes(1));

    // The record loads and NAMES the source behind that row lookup, which is an
    // upgrade of what the rail knows -- not a reason to throw the answer away.
    rerender({ record: savedRecord('anime-1', 'https://a.jpg') });
    resolveRowLookup(art('A'));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('A')));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(1);
  });

  it('does not blank the newer thumbnail when a superseded lookup fails', async () => {
    let failOlder: (error: Error) => void = () => undefined;
    const older = new Promise<AnimeEditorCoverResult>((_resolve, reject) => {
      failOlder = reject;
    });
    const source = sourceWith(vi.fn().mockReturnValueOnce(older).mockResolvedValueOnce(art('B')));
    const { result, rerender } = renderHook(({ record }: { readonly record: AnimeEditorRecord | undefined }) => useAnimeEditorCovers([], 0, record, source), {
      initialProps: { record: savedRecord('anime-1', 'https://a.jpg') },
    });

    rerender({ record: savedRecord('anime-1', 'https://b.jpg') });
    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('B')));

    // The OLD source's lookup fails after the new cover is already up. Its
    // rejection degrades the source it was asked about, not the one on screen.
    await act(async () => {
      failOlder(new Error('thumbnail failed'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.covers.get('anime-1')).toEqual(artEntry('B'));
  });

  it('drops the resolved art when the saved cover is removed', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));
    const { result, rerender } = renderHook(({ record }: { readonly record: AnimeEditorRecord | undefined }) => useAnimeEditorCovers([], 0, record, source), {
      initialProps: { record: savedRecord('anime-1', 'https://a.jpg') },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));

    rerender({ record: savedRecord('anime-1', undefined) });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(1);
  });

  it('falls back to the placeholder when a row reloads without a cover', async () => {
    const source = sourceWith(resolving(RESOLVED_COVER));
    const { result, rerender } = renderHook(({ items }: { readonly items: readonly AnimeEditorListItemViewModel[] }) => useAnimeEditorCovers(items, 1, undefined, source), {
      initialProps: { items: [row('anime-1')] },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));

    rerender({ items: [row('anime-1', false)] });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));
  });

  it('drops an in-flight lookup when the row is reloaded as coverless', async () => {
    let resolveLookup: (result: AnimeEditorCoverResult) => void = () => undefined;
    const source = sourceWith(
      vi.fn().mockReturnValue(
        new Promise<AnimeEditorCoverResult>((resolve) => {
          resolveLookup = resolve;
        }),
      ),
    );
    const { result, rerender } = renderHook(({ items }: { readonly items: readonly AnimeEditorListItemViewModel[] }) => useAnimeEditorCovers(items, 1, undefined, source), {
      initialProps: { items: [row('anime-1')] },
    });

    await waitFor(() => expect(source.getAnimeCover).toHaveBeenCalledTimes(1));

    rerender({ items: [row('anime-1', false)] });
    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));

    // The lookup the removed cover started comes back afterwards. Its answer is
    // the art of a cover the list no longer reports, so it must not repaint the
    // row that is already on the placeholder.
    await act(async () => {
      resolveLookup(art('A'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' });
  });

  it('resolves a cover again after a removal, rather than showing the art it had before', async () => {
    const source = sourceWith(vi.fn().mockResolvedValueOnce(art('A')).mockResolvedValueOnce(art('C')));
    const { result, rerender } = renderHook(({ items }: { readonly items: readonly AnimeEditorListItemViewModel[] }) => useAnimeEditorCovers(items, 1, undefined, source), {
      initialProps: { items: [row('anime-1')] },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('A')));

    rerender({ items: [row('anime-1', false)] });
    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));

    rerender({ items: [row('anime-1', true)] });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(artEntry('C')));
    expect(source.getAnimeCover).toHaveBeenCalledTimes(2);
  });

  it('holds a loading entry while the lookup is still in flight', async () => {
    const source = sourceWith(vi.fn().mockReturnValue(new Promise(() => undefined)));

    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1')], 1, undefined, source));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'loading' }));
  });

  it.each<[string, AnimeEditorCoverResult, AnimeCoverEntry]>([
    ['a resolved thumbnail', RESOLVED_COVER, COVER_ENTRY],
    ['the explicit placeholder signal', { dataUrl: 'data:image/jpeg;base64,x', source: 'placeholder' }, { status: 'placeholder' }],
    ['a cover result carrying no bytes', { source: 'cover' }, { status: 'placeholder' }],
  ])('caches %s', async (_label, coverResult, expected) => {
    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1')], 1, undefined, sourceWith(resolving(coverResult))));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(expected));
  });

  it('degrades a rejected lookup to the placeholder instead of throwing', async () => {
    const source = sourceWith(vi.fn().mockRejectedValue(new Error('thumbnail failed')));

    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1')], 1, undefined, source));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));
  });

  it('degrades to the placeholder when the runtime exposes no cover binding at all', async () => {
    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1')], 1, undefined, sourceWith(undefined)));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));
  });

  it('drops an in-flight lookup when the runtime exposes no cover binding', async () => {
    let resolveLookup: (result: AnimeEditorCoverResult) => void = () => undefined;
    const binding = vi.fn().mockReturnValue(
      new Promise<AnimeEditorCoverResult>((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const { result, rerender } = renderHook(
      ({ record, source }: { readonly record: AnimeEditorRecord | undefined; readonly source: AnimeEditorCoverSource }) => useAnimeEditorCovers([], 0, record, source),
      { initialProps: { record: savedRecord('anime-1', 'https://a.jpg'), source: sourceWith(binding) } },
    );

    await waitFor(() => expect(binding).toHaveBeenCalledTimes(1));

    // The runtime loses the binding, so the rail can only degrade -- and the
    // answer still owed by the binding it no longer has must not land on top of
    // that placeholder when it finally arrives.
    rerender({ record: savedRecord('anime-1', 'https://b.jpg'), source: sourceWith(undefined) });
    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));

    await act(async () => {
      resolveLookup(art('A'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' });
  });

  it('keeps the decoder-failure handler identity stable across rerenders', async () => {
    // Contract, not mutant-killer: the ArrayDeclaration mutant that swaps `[]` for a fixed
    // literal survives this, because React's element-wise dep comparison keeps the identity.
    // It fails the moment the deps argument is dropped (recreated every render) or given a
    // dep that changes, which is the regression a memoized rail row would re-render on.
    const source = sourceWith(resolving(RESOLVED_COVER));
    const { result, rerender } = renderHook(({ items }: { readonly items: readonly AnimeEditorListItemViewModel[] }) => useAnimeEditorCovers(items, 1, undefined, source), {
      initialProps: { items: [row('anime-1')] },
    });

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));

    const handler = result.current.onCoverImageError;
    rerender({ items: [row('anime-1')] });

    expect(result.current.onCoverImageError).toBe(handler);
  });

  it('degrades one anime to the placeholder after its decoded image fails', async () => {
    const { result } = renderHook(() => useAnimeEditorCovers([row('anime-1')], 1, undefined, sourceWith(resolving(RESOLVED_COVER))));

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual(COVER_ENTRY));

    result.current.onCoverImageError('anime-1');

    await waitFor(() => expect(result.current.covers.get('anime-1')).toEqual({ status: 'placeholder' }));
  });
});
