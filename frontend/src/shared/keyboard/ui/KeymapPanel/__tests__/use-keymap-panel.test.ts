import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { failKeymapLoad, resetKeyboardStore, setKeymapOverrides } from '../../../keyboard-scope.helpers';
import { KEYMAP_PANEL_ERROR_MESSAGE } from '../keymap-panel.constants';
import { useKeymapPanel } from '../use-keymap-panel';

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
