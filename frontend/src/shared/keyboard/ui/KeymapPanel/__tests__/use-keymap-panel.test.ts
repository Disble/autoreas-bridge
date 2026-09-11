import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetKeyboardStore, setKeymapOverrides } from '../../../keyboard-scope.helpers';
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
