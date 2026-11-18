import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getKeyboardState, resetKeyboardStore } from '../../../keyboard-scope.helpers';
import type { CommandBinding } from '../../../keyboard.types';
import { KeyboardDispatcherListener } from '../../KeyboardDispatcherListener/KeyboardDispatcherListener';
import { KeymapBindingRow } from '../../KeymapBindingRow/KeymapBindingRow';
import { BRIDGE_READINESS_GATE } from '../../../../query/bridge-runtime/bridge-runtime.constants';

/** Renders the live router location so a navigation assertion reads where the app landed, not which function ran (mirrors `KeyboardDispatcherListener.react-aria.test.tsx`). */
function LocationProbe() {
  const location = useLocation();

  return <span data-testid="landed-on">{location.pathname}</span>;
}

/** Builds a minimal command binding for the row under test; its own chord is irrelevant here -- the adversarial chords are `?` and `alt+1`, both shipped elsewhere in `KEYBOARD_COMMANDS`. */
function buildBinding(): CommandBinding {
  return { id: 'test.command', scope: 'global', chord: 'ctrl+9', label: 'Test command', section: 'Navigation' };
}

beforeEach(() => {
  resetKeyboardStore();
  // KeyboardDispatcherListener loads the persisted keymap on mount (design
  // D11), once the settings module is ready. The readiness gate is stubbed
  // ready and GetKeymap attached, so the load resolves at once with no binding
  // poll left running; these suites are about the dispatcher, not the loader.
  vi.spyOn(BRIDGE_READINESS_GATE, 'whenReady').mockResolvedValue();
  window.go = { desktop: { App: { GetKeymap: () => Promise.resolve('') } } } as never;
});
afterEach(() => {
  cleanup();
  resetKeyboardStore();
  Reflect.deleteProperty(window, 'go');
});

describe('KeymapBindingRow capture suppression alongside the real dispatcher (R-4, design D7)', () => {
  it('suppresses both the help overlay chord and a shipped navigation chord while armed, never running either command', () => {
    render(
      <MemoryRouter initialEntries={['/notifications']}>
        <KeyboardDispatcherListener />
        <LocationProbe />
        <KeymapBindingRow
          binding={buildBinding()}
          effectiveChord="ctrl+9"
          hazard={null}
          isOverridden={false}
          onCaptureChord={() => Promise.resolve({ status: 'saved', message: null })}
          onRevert={() => {}}
          scopeNote={null}
        />
      </MemoryRouter>,
    );

    const rebindButton = screen.getByRole('button', { name: 'Rebind' });
    fireEvent.click(rebindButton);
    rebindButton.focus();

    // `?` is the help overlay's own shipped chord (`help.open`,
    // command-registry.constants.ts) -- the adversarial case this
    // requirement names explicitly: a naive capture would record it AND
    // still let it run, opening the overlay it is itself bound to.
    const helpKeydownNotCancelled = fireEvent.keyDown(rebindButton, { key: '?', code: 'Slash', shiftKey: true });
    expect(helpKeydownNotCancelled).toBe(false);
    expect(getKeyboardState().isHelpOpen).toBe(false);

    // `alt+1` is the shipped nav.today chord -- proves suppression is not
    // special-cased to the row's own binding or to `?`, but holds for any
    // chord reachable while the control is armed.
    const navKeydownNotCancelled = fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', altKey: true });
    expect(navKeydownNotCancelled).toBe(false);
    expect(screen.getByTestId('landed-on')).toHaveTextContent('/notifications');
  });
});
