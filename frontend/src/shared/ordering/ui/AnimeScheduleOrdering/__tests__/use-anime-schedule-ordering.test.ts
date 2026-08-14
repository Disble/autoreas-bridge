import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAnimeScheduleOrdering } from '../use-anime-schedule-ordering';
import type { AnimeScheduleOrderingProps, AnimeScheduleOrderingTestDriverRef } from '../anime-schedule-ordering.types';

// The hook's own contract for a drag is "decide, then delegate": block the
// hover, or hand the projection to dnd-kit. Faking `move` is what makes that
// decision observable — otherwise the only way to reach the delegating branch
// is to synthesize a full dnd-kit operation, and the assertion ends up about
// dnd-kit's projection rather than about this hook.
vi.mock('@dnd-kit/helpers', () => ({
  move: vi.fn((order: Record<string, string[]>) => order),
}));

/**
 * Board sized so the predicates under test are actually observable:
 * `anime-multi` holds two placements and `anime-solo` one, so the "keep the
 * last card" rule differs between them; and the destinations are deliberately
 * NOT in alphabetical order, so column order proves board rank rather than a
 * lucky sort.
 */
const board = {
  originAnimeId: 'anime-multi',
  boardModifiedAt: 100,
  destinations: [
    { id: 'Miercoles', label: 'Miercoles', kind: 'weekday' },
    { id: 'Lunes', label: 'Lunes', kind: 'weekday' },
    { id: 'Sin ver', label: 'Sin ver', kind: 'special' },
  ],
  entries: [
    {
      animeId: 'anime-multi', name: 'Frieren', active: true, modifiedAt: 100,
      placements: [{ day: 'Lunes', order: 1 }, { day: 'Miercoles', order: 1 }],
      status: 0, progress: 1, originHighlighted: true,
    },
    {
      animeId: 'anime-solo', name: 'Dandadan', active: true, modifiedAt: 100,
      placements: [{ day: 'Lunes', order: 2 }],
      status: 0, progress: 1, originHighlighted: false,
    },
  ],
} as const;

/**
 * Renders the hook with the shared board and any per-test overrides.
 * @param overrides Props to merge over the defaults.
 * @returns The `renderHook` result, so tests can rerender with new props.
 */
function renderOrdering(overrides: Partial<AnimeScheduleOrderingProps> = {}) {
  const initial = { board, onApply: vi.fn(), ...overrides } as AnimeScheduleOrderingProps;
  return renderHook((props: AnimeScheduleOrderingProps) => useAnimeScheduleOrdering(props), {
    initialProps: initial,
  });
}

/**
 * Builds the drag-over event shape the hover guard reads.
 * @param sourceId The dragged card key.
 * @param targetId The hovered card key or container id.
 * @returns An event carrying a spy `preventDefault`.
 */
function dragOverEvent(sourceId: string, targetId: string) {
  return {
    operation: { source: { id: sourceId }, target: { id: targetId } },
    preventDefault: vi.fn(),
  } as unknown as Parameters<ReturnType<typeof renderOrdering>['result']['current']['onDragOver']>[0] & {
    preventDefault: ReturnType<typeof vi.fn>;
  };
}

describe('useAnimeScheduleOrdering — derived view model', () => {
  it('orders columns by board position rather than alphabetically', () => {
    const { result } = renderOrdering();

    expect(result.current.columns.map((column) => column.id)).toEqual(['Miercoles', 'Lunes', 'Sin ver']);
  });

  it('splits weekday and special destinations', () => {
    const { result } = renderOrdering();

    expect(result.current.weekdayColumns.map((column) => column.id)).toEqual(['Miercoles', 'Lunes']);
    expect(result.current.specialColumns.map((column) => column.id)).toEqual(['Sin ver']);
  });

  it('places each anime card in its authoritative destination, in placement order', () => {
    const { result } = renderOrdering();
    const lunes = result.current.columns.find((column) => column.id === 'Lunes');

    expect(lunes?.cards.map((card) => card.animeId)).toEqual(['anime-multi', 'anime-solo']);
  });

  it('reports zero changes for the authoritative board', () => {
    expect(renderOrdering().result.current.changeCount).toBe(0);
  });
});

describe('useAnimeScheduleOrdering — canRemove', () => {
  it('allows removing a card from an anime that holds more than one', () => {
    expect(renderOrdering().result.current.canRemove('anime-multi')).toBe(true);
  });

  it('refuses to remove the only card an anime has', () => {
    expect(renderOrdering().result.current.canRemove('anime-solo')).toBe(false);
  });

  it('refuses for an anime that is not on the board at all', () => {
    expect(renderOrdering().result.current.canRemove('anime-absent')).toBe(false);
  });

  it('turns permissive for a solo anime once a second card is staged', () => {
    const { result } = renderOrdering();
    expect(result.current.canRemove('anime-solo')).toBe(false);

    act(() => result.current.onDuplicate('anime-solo'));

    expect(result.current.canRemove('anime-solo')).toBe(true);
  });
});

describe('useAnimeScheduleOrdering — getOverlayName', () => {
  it('resolves a card key to the anime name shown in the drag overlay', () => {
    const { result } = renderOrdering();

    expect(result.current.getOverlayName('anime-multi#0')).toBe('Frieren');
    expect(result.current.getOverlayName('anime-solo#0')).toBe('Dandadan');
  });

  it('returns an empty string for an id that is not a card', () => {
    expect(renderOrdering().result.current.getOverlayName('Lunes')).toBe('');
  });

  it('accepts a numeric id without throwing', () => {
    expect(renderOrdering().result.current.getOverlayName(42)).toBe('');
  });

  it('sees a name that appeared after the draft changed', () => {
    const { result } = renderOrdering();
    expect(result.current.getOverlayName('anime-solo#1')).toBe('');

    act(() => result.current.onDuplicate('anime-solo'));

    expect(result.current.getOverlayName('anime-solo#1')).toBe('Dandadan');
  });
});

describe('useAnimeScheduleOrdering — onDragOver', () => {
  it('cancels a hover that would put the same anime twice in one weekday', () => {
    const { result } = renderOrdering();
    act(() => result.current.onDuplicate('anime-solo'));
    const before = result.current.columns.map((column) => column.cards.map((card) => card.key));

    const event = dragOverEvent('anime-solo#1', 'Lunes');
    act(() => result.current.onDragOver(event));

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(result.current.columns.map((column) => column.cards.map((card) => card.key))).toEqual(before);
  });

  it('lets a hover through when it introduces no duplicate', () => {
    const { result } = renderOrdering();

    const event = dragOverEvent('anime-solo#0', 'Miercoles');
    act(() => result.current.onDragOver(event));

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('lets a hover through when the target is not a container or a card', () => {
    const { result } = renderOrdering();

    const event = dragOverEvent('anime-solo#0', 'nowhere');
    act(() => result.current.onDragOver(event));

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe('useAnimeScheduleOrdering — staging and reset', () => {
  it('stages a duplicate without counting it as a change yet', () => {
    const { result } = renderOrdering();

    act(() => result.current.onDuplicate('anime-multi'));

    expect(result.current.stagedAnimeCount).toBe(1);
    expect(result.current.stagingCards.map((card) => card.animeId)).toEqual(['anime-multi']);
    expect(result.current.changeCount).toBe(0);
    expect(result.current.validationMessage).toBeUndefined();
  });

  it('removes a staged card and leaves the authoritative ones alone', () => {
    const { result } = renderOrdering();
    act(() => result.current.onDuplicate('anime-multi'));
    const stagedKey = result.current.stagingCards[0].key;

    act(() => result.current.onRemove(stagedKey));

    expect(result.current.stagingCards).toEqual([]);
    expect(result.current.canRemove('anime-multi')).toBe(true);
  });

  it('refuses to remove an anime last remaining card', () => {
    const { result } = renderOrdering();
    const soloKey = result.current.columns
      .flatMap((column) => column.cards)
      .find((card) => card.animeId === 'anime-solo')!.key;

    act(() => result.current.onRemove(soloKey));

    expect(result.current.columns.flatMap((column) => column.cards).some((card) => card.key === soloKey)).toBe(true);
  });

  it('resets the draft back to authoritative state', () => {
    const { result } = renderOrdering();
    act(() => result.current.onDuplicate('anime-multi'));

    act(() => result.current.onReset());

    expect(result.current.stagedAnimeCount).toBe(0);
    expect(result.current.changeCount).toBe(0);
  });
});

// These are the tests the previous suite lacked entirely: every case rendered
// once, so nothing could tell a live dependency array from an empty one.
describe('useAnimeScheduleOrdering — reacting to new props', () => {
  it('rebuilds the draft when a new board arrives, discarding staged work', () => {
    const { result, rerender } = renderOrdering();
    act(() => result.current.onDuplicate('anime-multi'));
    expect(result.current.stagedAnimeCount).toBe(1);

    const nextBoard = {
      ...board,
      entries: [{
        animeId: 'anime-other', name: 'Bocchi', active: true, modifiedAt: 200,
        placements: [{ day: 'Miercoles', order: 1 }], status: 0, progress: 1, originHighlighted: false,
      }],
    } as unknown as AnimeScheduleOrderingProps['board'];
    rerender({ board: nextBoard, onApply: vi.fn() } as AnimeScheduleOrderingProps);

    expect(result.current.stagedAnimeCount).toBe(0);
    expect(result.current.columns.flatMap((column) => column.cards).map((card) => card.animeId)).toEqual(['anime-other']);
  });

  it('reconciles staging when the create-mode draft rows change', () => {
    const { result, rerender } = renderOrdering({ draftEntries: [{ draftId: '__draft__:1', name: 'First' }] });
    expect(result.current.stagingCards.map((card) => card.name)).toEqual(['First']);

    rerender({
      board, onApply: vi.fn(),
      draftEntries: [{ draftId: '__draft__:1', name: 'Renamed' }, { draftId: '__draft__:2', name: 'Second' }],
    } as AnimeScheduleOrderingProps);

    expect(result.current.stagingCards.map((card) => card.name)).toEqual(['Renamed', 'Second']);
  });

  it('rebinds the test driver when a new ref arrives', () => {
    const first: AnimeScheduleOrderingTestDriverRef = {};
    const second: AnimeScheduleOrderingTestDriverRef = {};
    const { rerender } = renderOrdering({ testDriverRef: first });
    expect(first.current).toBeDefined();

    rerender({ board, onApply: vi.fn(), testDriverRef: second } as AnimeScheduleOrderingProps);

    expect(second.current).toBeDefined();
    expect(first.current).toBeUndefined();
  });

  it('scrolls the newly highlighted origin card into view when the origin changes', () => {
    const multi = document.createElement('div');
    multi.dataset.originAnime = 'anime-multi';
    multi.scrollIntoView = vi.fn();
    const solo = document.createElement('div');
    solo.dataset.originAnime = 'anime-solo';
    solo.scrollIntoView = vi.fn();
    document.body.append(multi, solo);

    const { rerender } = renderOrdering();
    expect(multi.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    rerender({ board: { ...board, originAnimeId: 'anime-solo' }, onApply: vi.fn() } as AnimeScheduleOrderingProps);

    expect(solo.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    multi.remove();
    solo.remove();
  });

  it('recomputes the change count against the board it was given', () => {
    const testDriverRef: AnimeScheduleOrderingTestDriverRef = {};
    const { result } = renderOrdering({ testDriverRef });

    act(() => testDriverRef.current?.moveAnime({ animeId: 'anime-solo', destinationId: 'Sin ver', order: 1 }));

    expect(result.current.changeCount).toBe(1);
    expect(result.current.specialColumns[0]?.cards.map((card) => card.animeId)).toEqual(['anime-solo']);
  });
});

describe('useAnimeScheduleOrdering — create mode and apply', () => {
  it('seeds create-mode rows into the staging area', () => {
    const { result } = renderOrdering({ draftEntries: [{ draftId: '__draft__:1', name: 'New Anime' }] });

    expect(result.current.stagingCards.map((card) => card.animeId)).toEqual(['__draft__:1']);
  });

  it('locks the named existing cards and leaves the rest draggable', () => {
    const { result } = renderOrdering({ lockedAnimeIds: ['anime-solo'] });
    const cards = result.current.columns.flatMap((column) => column.cards);

    expect(cards.filter((card) => card.locked === true).map((card) => card.animeId)).toEqual(['anime-solo']);
    expect(cards.some((card) => card.animeId === 'anime-multi' && card.locked === undefined)).toBe(true);
  });

  it('leaves an edit-mode caller with no staging and no locks', () => {
    const { result } = renderOrdering();

    expect(result.current.stagingCards).toEqual([]);
    expect(result.current.columns.flatMap((column) => column.cards).every((card) => card.locked === undefined)).toBe(true);
  });

  it('routes apply through onApply with the changed entries', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const testDriverRef: AnimeScheduleOrderingTestDriverRef = {};
    const { result } = renderOrdering({ onApply, testDriverRef });

    act(() => testDriverRef.current?.moveAnime({ animeId: 'anime-solo', destinationId: 'Sin ver', order: 1 }));
    await act(async () => { await result.current.onApply(); });

    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].map((entry: { animeId: string }) => entry.animeId)).toEqual(['anime-solo']);
  });

  it('routes apply through onApplyCreateSubmit when present, splitting drafts from neighbors', async () => {
    const onApplyCreateSubmit = vi.fn().mockResolvedValue(undefined);
    const onApply = vi.fn().mockResolvedValue(undefined);
    const testDriverRef: AnimeScheduleOrderingTestDriverRef = {};
    const { result } = renderOrdering({
      onApply, onApplyCreateSubmit, testDriverRef,
      draftEntries: [{ draftId: '__draft__:1', name: 'New Anime' }],
    });

    act(() => testDriverRef.current?.moveAnime({ animeId: '__draft__:1', destinationId: 'Sin ver', order: 1 }));
    await act(async () => { await result.current.onApply(); });

    expect(onApply).not.toHaveBeenCalled();
    expect(onApplyCreateSubmit).toHaveBeenCalledWith({
      creates: { '__draft__:1': [{ day: 'Sin ver', order: 1 }] },
      changedNeighbors: [],
    });
  });

  // The early return on `validationMessage` is defensive: `applyOrdering`
  // refuses to build a duplicated destination in the first place, so no public
  // sequence reaches an invalid draft. What is worth pinning is the other half
  // — a blocked hover leaves the draft valid, so apply still goes through.
  it('still applies after a hover was blocked, because the draft stayed valid', async () => {
    const onApply = vi.fn().mockResolvedValue(undefined);
    const { result } = renderOrdering({ onApply });

    act(() => result.current.onDuplicate('anime-multi'));
    const stagedKey = result.current.stagingCards[0].key;
    const event = dragOverEvent(stagedKey, 'Lunes');
    act(() => result.current.onDragOver(event));

    await act(async () => { await result.current.onApply(); });

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(onApply).toHaveBeenCalledOnce();
  });
});
