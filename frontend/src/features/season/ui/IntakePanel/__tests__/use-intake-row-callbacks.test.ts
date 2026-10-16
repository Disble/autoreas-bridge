import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SeasonSource } from '../../../../../infrastructure/season-source/season-source.types';
import { useIntakeEditorState } from '../use-intake-editor-state';
import { useIntakeRowCallbacks } from '../use-intake-row-callbacks';
import type { useIntakeStoreSlice } from '../use-intake-store-slice';
import { createSource } from './intake-panel.test-support';

/** The store actions the row callbacks drive, as spies. */
interface RowActionSpies {
  /** The matching spy. */
  readonly runMatching: ReturnType<typeof vi.fn>;
  /** The availability spy. */
  readonly recheckAvailability: ReturnType<typeof vi.fn>;
  /** The resolve spy. */
  readonly resolveMatch: ReturnType<typeof vi.fn>;
  /** The discard spy. */
  readonly discardName: ReturnType<typeof vi.fn>;
  /** The restore spy. */
  readonly restoreName: ReturnType<typeof vi.fn>;
}

/**
 * Builds the store-action spies the harness hands to the row callbacks.
 * @returns Store-shaped spies resolving like the real actions.
 */
function createRowSpies(): RowActionSpies {
  return {
    runMatching: vi.fn().mockResolvedValue('ok'),
    recheckAvailability: vi.fn().mockResolvedValue('ok'),
    resolveMatch: vi.fn().mockResolvedValue('ok'),
    discardName: vi.fn().mockResolvedValue(true),
    restoreName: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Renders the row callbacks over a real editor state, so each case drives the
 * selection exactly like the panel does.
 * @param source The season port the actions call into.
 * @param spies The store-action spies the slice exposes.
 * @returns The hook result for the case to drive.
 */
function renderRowCallbacks(source: SeasonSource, spies: RowActionSpies) {
  return renderHook(({ currentSource }: { readonly currentSource: SeasonSource }) => {
    const editor = useIntakeEditorState();
    const store = {
      runMatching: spies.runMatching,
      recheckAvailability: spies.recheckAvailability,
      resolveMatch: spies.resolveMatch,
      discardName: spies.discardName,
      restoreName: spies.restoreName,
    } as unknown as ReturnType<typeof useIntakeStoreSlice>;
    const callbacks = useIntakeRowCallbacks({ store, editor, source: currentSource });
    return { editor, callbacks };
  }, { initialProps: { currentSource: source } });
}

describe('useIntakeRowCallbacks', () => {
  it('runs matching through the source', async () => {
    const spies = createRowSpies();
    const source = createSource();
    const { result } = renderRowCallbacks(source, spies);

    await act(async () => {
      result.current.callbacks.onRunMatching();
    });

    expect(spies.runMatching).toHaveBeenCalledWith(source);
  });

  it('rechecks availability through the source', async () => {
    const spies = createRowSpies();
    const source = createSource();
    const { result } = renderRowCallbacks(source, spies);

    await act(async () => {
      result.current.callbacks.onRecheckAvailability();
    });

    expect(spies.recheckAvailability).toHaveBeenCalledWith(source);
  });

  it('resolves one row with its page URL', async () => {
    const spies = createRowSpies();
    const source = createSource();
    const { result } = renderRowCallbacks(source, spies);

    await act(async () => {
      result.current.callbacks.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });

    expect(spies.resolveMatch).toHaveBeenCalledWith(source, 'sa-1', 'https://jkanime.net/dr-stone/');
  });

  it.each([
    { callback: 'onDiscard', action: 'discardName' },
    { callback: 'onRestore', action: 'restoreName' },
  ] as const)('$callback sends one row to $action', async ({ callback, action }) => {
    const spies = createRowSpies();
    const source = createSource();
    const { result } = renderRowCallbacks(source, spies);

    await act(async () => {
      result.current.callbacks[callback]('sa-2');
    });

    expect(spies[action]).toHaveBeenCalledExactlyOnceWith(source, 'sa-2');
  });

  it('opens the matched page in the system browser', () => {
    const spies = createRowSpies();
    const source = createSource({ openPage: vi.fn() });
    const { result } = renderRowCallbacks(source, spies);

    act(() => {
      result.current.callbacks.onOpenPage('https://jkanime.net/dr-stone/');
    });

    expect(source.openPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
  });

  it('flips one row selection on and back off', () => {
    const { result } = renderRowCallbacks(createSource(), createRowSpies());

    act(() => {
      result.current.callbacks.toggleSelect('sa-1');
    });
    expect(result.current.editor.selected.has('sa-1')).toBe(true);

    act(() => {
      result.current.callbacks.toggleSelect('sa-1');
    });
    expect(result.current.editor.selected.has('sa-1')).toBe(false);
  });

  it('drives every action through the current source after it changes', async () => {
    const spies = createRowSpies();
    const firstSource = createSource({ openPage: vi.fn() });
    const nextSource = createSource({ openPage: vi.fn() });
    const { result, rerender } = renderRowCallbacks(firstSource, spies);

    rerender({ currentSource: nextSource });
    await act(async () => {
      result.current.callbacks.onRunMatching();
    });
    await act(async () => {
      result.current.callbacks.onRecheckAvailability();
    });
    await act(async () => {
      result.current.callbacks.onResolve('sa-1', 'https://jkanime.net/dr-stone/');
    });
    await act(async () => {
      result.current.callbacks.onDiscard('sa-2');
    });
    await act(async () => {
      result.current.callbacks.onRestore('sa-3');
    });
    act(() => {
      result.current.callbacks.onOpenPage('https://jkanime.net/dr-stone/');
    });

    expect(spies.runMatching).toHaveBeenCalledWith(nextSource);
    expect(spies.recheckAvailability).toHaveBeenCalledWith(nextSource);
    expect(spies.resolveMatch).toHaveBeenCalledWith(nextSource, 'sa-1', 'https://jkanime.net/dr-stone/');
    expect(spies.discardName).toHaveBeenCalledWith(nextSource, 'sa-2');
    expect(spies.restoreName).toHaveBeenCalledWith(nextSource, 'sa-3');
    expect(nextSource.openPage).toHaveBeenCalledWith('https://jkanime.net/dr-stone/');
    expect(firstSource.openPage).not.toHaveBeenCalled();
  });
});
