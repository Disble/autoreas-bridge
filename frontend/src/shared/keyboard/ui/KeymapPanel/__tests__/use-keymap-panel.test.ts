import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { failKeymapLoad, resetKeyboardStore, setKeymapOverrides } from '../../../keyboard-scope.helpers';
import { KEYMAP_PANEL_ERROR_MESSAGE } from '../keymap-panel.constants';
import type { KeymapRebindOutcome } from '../keymap-panel.types';
import { useKeymapPanel } from '../use-keymap-panel';

/** Finds one row across every section by command id, the shape every `onRebind` test below reads back. */
function findRow(sections: ReturnType<typeof useKeymapPanel>['sections'], id: string) {
  return sections.flatMap((section) => section.rows).find((row) => row.binding.id === id);
}

beforeEach(resetKeyboardStore);
afterEach(resetKeyboardStore);

describe('useKeymapPanel', () => {
  it('reads keymapLoadState from the store rather than a fixed value', () => {
    const { result } = renderHook(() => useKeymapPanel());

    expect(result.current.keymapLoadState).toBe('pending');

    act(() => {
      setKeymapOverrides({});
    });

    expect(result.current.keymapLoadState).toBe('loaded');
  });

  it('errorMessage stays null while pending and while loaded, distinct from a "loaded with zero overrides" outcome (task 8.2.2)', () => {
    const { result } = renderHook(() => useKeymapPanel());

    expect(result.current.errorMessage).toBeNull();

    act(() => {
      setKeymapOverrides({});
    });

    expect(result.current.keymapLoadState).toBe('loaded');
    expect(result.current.errorMessage).toBeNull();
  });

  it('errorMessage becomes KEYMAP_PANEL_ERROR_MESSAGE when the load fails, without waiting on saveErrorMessage', () => {
    const { result } = renderHook(() => useKeymapPanel());

    act(() => {
      failKeymapLoad();
    });

    expect(result.current.keymapLoadState).toBe('failed');
    expect(result.current.errorMessage).toBe(KEYMAP_PANEL_ERROR_MESSAGE);
    expect(result.current.saveErrorMessage).toBeNull();
  });

  it('recomputes sections when the store overrides change after mount, rather than closing over the first render forever', () => {
    setKeymapOverrides({});
    const { result } = renderHook(() => useKeymapPanel());
    const findTodayRow = () => result.current.sections.flatMap((section) => section.rows).find((row) => row.binding.id === 'nav.today');

    expect(findTodayRow()?.effectiveChord).toBe('alt+1');

    act(() => {
      setKeymapOverrides({ 'nav.today': 'ctrl+1' });
    });

    expect(findTodayRow()?.effectiveChord).toBe('ctrl+1');
  });
});

describe('onRebind (task 10.2.1, design D6/D8)', () => {
  it('refuses a same-scope duplicate, names the colliding command, and leaves overrides unchanged (spec "A same-scope duplicate is refused")', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn() };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'alt+1');
    });

    expect(outcome?.status).toBe('refused');
    expect(outcome?.message).toContain('Today');
    expect(source.setKeymap).not.toHaveBeenCalled();
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');
  });

  it('saves and warns on a cross-scope shadow, naming the scoped command that takes precedence (spec "A cross-scope shadow is saved with a warning")', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue('ok') };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('notification-center.mark-all-read', 'alt+1');
    });

    expect(outcome?.status).toBe('shadowed');
    expect(outcome?.message).toContain('Mark all as read');
    expect(source.setKeymap).toHaveBeenCalledTimes(1);
    expect(findRow(result.current.sections, 'notification-center.mark-all-read')?.effectiveChord).toBe('alt+1');
  });

  it('publishes the candidate override only once setKeymap resolves "ok" (design D6: persist then publish)', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue('ok') };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(outcome).toEqual({ status: 'saved', message: null });
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('ctrl+2');
    expect(result.current.saveErrorMessage).toBeNull();
  });

  it('leaves overrides untouched and surfaces the raw status when setKeymap does not resolve "ok" (design D6: no optimistic publish)', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue('disk is full') };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(outcome?.status).toBe('failed');
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');
    expect(result.current.saveErrorMessage).toBe('disk is full');
  });

  it('surfaces a generic failure and leaves overrides untouched when setKeymap rejects outright', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockRejectedValue(new Error('network down')) };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(outcome?.status).toBe('failed');
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');
    expect(result.current.saveErrorMessage).toBe(KEYMAP_PANEL_ERROR_MESSAGE);
  });

  it('does not throw for an id absent from the registry, and persists nothing new for it', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue('ok') };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    await act(async () => {
      await result.current.onRebind('nonexistent.command', 'ctrl+9');
    });

    expect(source.setKeymap).toHaveBeenCalledWith('');
  });

  it('reads fresh overrides on a second rebind in the same session, persisting both together rather than a frozen first snapshot', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue('ok') };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    await act(async () => {
      await result.current.onRebind('nav.downloads', 'ctrl+2');
    });
    await act(async () => {
      await result.current.onRebind('nav.editor', 'ctrl+3');
    });

    expect(source.setKeymap).toHaveBeenCalledTimes(2);
    const secondDocument = JSON.parse(source.setKeymap.mock.calls[1][0] as string) as { bindings: Record<string, string> };
    expect(secondDocument.bindings).toEqual({ 'nav.downloads': 'ctrl+2', 'nav.editor': 'ctrl+3' });
  });

  it('re-derives the injected source when the prop changes across a render, instead of freezing the first one', async () => {
    setKeymapOverrides({});
    const firstSource = { setKeymap: vi.fn().mockResolvedValue('ok') };
    const secondSource = { setKeymap: vi.fn().mockResolvedValue('ok') };
    const { result, rerender } = renderHook(({ source }) => useKeymapPanel({ source }), {
      initialProps: { source: firstSource },
    });

    rerender({ source: secondSource });
    await act(async () => {
      await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(secondSource.setKeymap).toHaveBeenCalledTimes(1);
    expect(firstSource.setKeymap).not.toHaveBeenCalled();
  });
});
