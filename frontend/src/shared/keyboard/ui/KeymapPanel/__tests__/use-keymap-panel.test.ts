import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBridgeError } from '../../../../query/bridge-error/bridge-error.helpers';
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
  it('reads load state from the store, keeps errorMessage null, and recomputes sections on later overrides', () => {
    const { result } = renderHook(() => useKeymapPanel());

    expect(result.current.keymapLoadState).toBe('pending');
    expect(result.current.errorMessage).toBeNull();

    act(() => {
      setKeymapOverrides({});
    });

    expect(result.current.keymapLoadState).toBe('loaded');
    expect(result.current.errorMessage).toBeNull();
    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('alt+1');

    act(() => {
      setKeymapOverrides({ 'nav.today': 'ctrl+1' });
    });

    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('ctrl+1');
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

  it('routes rebind, revert and reset through the source injected by the latest render', async () => {
    setKeymapOverrides({ 'nav.today': 'ctrl+1' });
    const firstSource = { setKeymap: vi.fn().mockResolvedValue(undefined) };
    const secondSource = { setKeymap: vi.fn().mockResolvedValue(undefined) };
    const { result, rerender } = renderHook(({ source }) => useKeymapPanel({ source }), {
      initialProps: { source: firstSource },
    });

    rerender({ source: secondSource });
    await act(async () => {
      await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(secondSource.setKeymap).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.onRevert('nav.today');
    });

    expect(secondSource.setKeymap).toHaveBeenCalledTimes(2);

    await act(async () => {
      await result.current.onResetToDefaults();
    });

    expect(secondSource.setKeymap).toHaveBeenCalledTimes(3);
    expect(firstSource.setKeymap).not.toHaveBeenCalled();
  });
});

describe('onRebind (task 10.2.1, design D6/D8)', () => {
  it('refuses a duplicate, saves two rebinds from fresh overrides, then saves a cross-scope shadow with a warning', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'alt+1');
    });

    expect(outcome?.status).toBe('refused');
    expect(outcome?.message).toContain('Today');
    expect(source.setKeymap).not.toHaveBeenCalled();
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');

    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(outcome).toEqual({ status: 'saved', message: null });
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('ctrl+2');
    expect(result.current.saveErrorMessage).toBeNull();

    await act(async () => {
      await result.current.onRebind('nav.editor', 'ctrl+3');
    });

    expect(source.setKeymap).toHaveBeenCalledTimes(2);
    const secondDocument = JSON.parse(source.setKeymap.mock.calls[1][0] as string) as { bindings: Record<string, string> };
    expect(secondDocument.bindings).toEqual({ 'nav.downloads': 'ctrl+2', 'nav.editor': 'ctrl+3' });

    await act(async () => {
      outcome = await result.current.onRebind('notification-center.mark-all-read', 'alt+1');
    });

    expect(outcome?.status).toBe('shadowed');
    expect(outcome?.message).toContain('Mark all as read');
    expect(source.setKeymap).toHaveBeenCalledTimes(3);
    expect(findRow(result.current.sections, 'notification-center.mark-all-read')?.effectiveChord).toBe('alt+1');
  });

  it('keeps overrides and surfaces the bridge message, then the generic message, when setKeymap rejects', async () => {
    setKeymapOverrides({});
    const source = {
      setKeymap: vi
        .fn()
        .mockRejectedValueOnce(createBridgeError('internal', 'disk is full'))
        .mockRejectedValueOnce(new Error('network down')),
    };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    let outcome: KeymapRebindOutcome | undefined;
    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(outcome?.status).toBe('failed');
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');
    expect(result.current.saveErrorMessage).toBe('disk is full');

    await act(async () => {
      outcome = await result.current.onRebind('nav.downloads', 'ctrl+2');
    });

    expect(outcome?.status).toBe('failed');
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');
    expect(result.current.saveErrorMessage).toBe(KEYMAP_PANEL_ERROR_MESSAGE);
  });

  it('does not throw for an id absent from the registry, and persists nothing new for it', async () => {
    setKeymapOverrides({});
    const source = { setKeymap: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    await act(async () => {
      await result.current.onRebind('nonexistent.command', 'ctrl+9');
    });

    expect(source.setKeymap).toHaveBeenCalledWith('');
  });
});

describe('onRevert (task 11.2.1/11.2.2, design D6, spec "Recovery Is Always Reachable By Pointer Alone")', () => {
  it('restores one shipped chord leaving other overrides, then a second revert reads fresh overrides', async () => {
    setKeymapOverrides({ 'nav.today': 'ctrl+1', 'nav.downloads': 'ctrl+2' });
    const source = { setKeymap: vi.fn().mockResolvedValue(undefined) };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    await act(async () => {
      await result.current.onRevert('nav.today');
    });

    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('alt+1');
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('ctrl+2');
    const document = JSON.parse(source.setKeymap.mock.calls[0][0] as string) as { bindings: Record<string, string> };
    expect(document.bindings).toEqual({ 'nav.downloads': 'ctrl+2' });

    await act(async () => {
      await result.current.onRevert('nav.downloads');
    });

    expect(source.setKeymap).toHaveBeenLastCalledWith('');
  });

  it('keeps the override and surfaces the bridge message, then the generic message, when setKeymap rejects', async () => {
    setKeymapOverrides({ 'nav.today': 'ctrl+1' });
    const source = {
      setKeymap: vi
        .fn()
        .mockRejectedValueOnce(createBridgeError('internal', 'disk is full'))
        .mockRejectedValueOnce(new Error('network down')),
    };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    await act(async () => {
      await result.current.onRevert('nav.today');
    });

    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('ctrl+1');
    expect(result.current.saveErrorMessage).toBe('disk is full');

    await act(async () => {
      await result.current.onRevert('nav.today');
    });

    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('ctrl+1');
    expect(result.current.saveErrorMessage).toBe(KEYMAP_PANEL_ERROR_MESSAGE);
  });
});

describe('onResetToDefaults (task 11.2.1/11.2.2, design D5/D6, spec "Recovery Is Always Reachable By Pointer Alone")', () => {
  it('keeps every override on a rejected write, then restores every shipped chord via SetKeymap("")', async () => {
    setKeymapOverrides({ 'nav.today': 'ctrl+1', 'nav.downloads': 'ctrl+2' });
    const source = {
      setKeymap: vi.fn().mockRejectedValueOnce(createBridgeError('internal', 'disk is full')).mockResolvedValue(undefined),
    };
    const { result } = renderHook(() => useKeymapPanel({ source }));

    await act(async () => {
      await result.current.onResetToDefaults();
    });

    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('ctrl+1');
    expect(result.current.saveErrorMessage).toBe('disk is full');

    await act(async () => {
      await result.current.onResetToDefaults();
    });

    expect(source.setKeymap).toHaveBeenLastCalledWith('');
    expect(findRow(result.current.sections, 'nav.today')?.effectiveChord).toBe('alt+1');
    expect(findRow(result.current.sections, 'nav.downloads')?.effectiveChord).toBe('alt+2');
  });
});
