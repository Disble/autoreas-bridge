import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import type { NavigateFunction } from 'react-router';
import { MemoryRouter, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYBOARD_COMMANDS } from '../../../command-registry.constants';
import { dispatchKeyboardEvent } from '../../../dispatch.helpers';
import type { KeyboardDispatchEvent } from '../../../dispatch.helpers';
import {
  getKeyboardState,
  popKeyboardScopeFrame,
  pushKeyboardScopeFrame,
  resetKeyboardStore,
  setKeyboardHelpOpen,
  setKeymapOverrides,
} from '../../../keyboard-scope.helpers';
import type { CommandDefinition, KeyboardScopeFrame } from '../../../keyboard.types';
import { ShortcutsHelpDialog } from '../ShortcutsHelpDialog';

/** A command this suite injects, deliberately absent from `KEYBOARD_COMMANDS` (spec S14). */
const INJECTED_COMMAND: CommandDefinition = {
  id: 'test.injected',
  scope: 'global',
  chord: 'ctrl+shift+z',
  label: 'Injected test command',
  section: 'Help',
  run: () => undefined,
};

/**
 * Hands the router's live `navigate` function back to the test via `onReady`,
 * renders nothing itself. React Aria marks everything outside an open modal
 * `aria-hidden` (correct: the background truly is inert while it is open), so
 * a test proving the overlay reacts to navigation drives the router directly
 * -- exactly what the real `Alt+<digit>` global dispatcher does -- instead of
 * clicking a background element a real user could not reach either.
 */
function NavigateCapture({ onReady }: Readonly<{ onReady: (navigate: NavigateFunction) => void }>) {
  const navigate = useNavigate();

  useEffect(() => {
    onReady(navigate);
  }, [navigate, onReady]);

  return null;
}

beforeEach(resetKeyboardStore);
afterEach(() => {
  cleanup();
  resetKeyboardStore();
});

describe('ShortcutsHelpDialog', () => {
  it('renders every KEYBOARD_COMMANDS label under its own section while open', () => {
    setKeyboardHelpOpen(true);

    render(
      <MemoryRouter>
        <ShortcutsHelpDialog />
      </MemoryRouter>,
    );

    for (const command of KEYBOARD_COMMANDS) {
      const section = screen.getByRole('region', { name: command.section });
      expect(within(section).getByText(command.label)).toBeInTheDocument();
    }
  });

  it('renders nothing while isHelpOpen is false', () => {
    render(
      <MemoryRouter>
        <ShortcutsHelpDialog />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders a command supplied through the commands prop, with no change to the dialog itself (S14)', () => {
    setKeyboardHelpOpen(true);

    render(
      <MemoryRouter>
        <ShortcutsHelpDialog commands={[INJECTED_COMMAND]} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Injected test command')).toBeInTheDocument();
  });

  it("shows a mounted scope frame's command and hides it once the frame is popped", () => {
    setKeyboardHelpOpen(true);
    const scopedCommand: CommandDefinition = {
      id: 'test.scoped',
      scope: 'notification-center',
      chord: 'alt+r',
      label: 'Scoped test command',
      section: 'Notifications',
      run: () => undefined,
    };
    const frame: KeyboardScopeFrame = { id: 1, scope: 'notification-center', getCommands: () => [scopedCommand] };
    pushKeyboardScopeFrame(frame);

    render(
      <MemoryRouter>
        <ShortcutsHelpDialog />
      </MemoryRouter>,
    );

    expect(screen.getByText('Scoped test command')).toBeInTheDocument();

    act(() => {
      popKeyboardScopeFrame(1);
    });

    expect(screen.queryByText('Scoped test command')).not.toBeInTheDocument();
  });

  it('closes the overlay when the route changes, without needing the dialog itself to unmount', () => {
    setKeyboardHelpOpen(true);
    let navigate: NavigateFunction | undefined;

    render(
      <MemoryRouter initialEntries={['/today']}>
        <ShortcutsHelpDialog />
        <NavigateCapture onReady={(readyNavigate) => (navigate = readyNavigate)} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();

    act(() => {
      navigate?.('/notifications');
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('flips isHelpOpen back to false in the store when the dialog is dismissed (Escape)', () => {
    setKeyboardHelpOpen(true);

    render(
      <MemoryRouter>
        <ShortcutsHelpDialog />
      </MemoryRouter>,
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(getKeyboardState().isHelpOpen).toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it("displays an overridden command's new chord, not its declared one (spec: an overridden chord displays identically to what the dispatcher now answers to)", () => {
    setKeyboardHelpOpen(true);
    setKeymapOverrides({ 'nav.today': 'ctrl+1' });

    render(
      <MemoryRouter>
        <ShortcutsHelpDialog />
      </MemoryRouter>,
    );

    const section = screen.getByRole('region', { name: 'Navigation' });
    expect(within(section).getByText('Ctrl + 1')).toBeInTheDocument();
    expect(within(section).queryByText('Alt + 1')).not.toBeInTheDocument();
  });

  it('R-8: resolves and displays a rebind identically across the dispatcher and the overlay, in one test', () => {
    setKeyboardHelpOpen(true);
    setKeymapOverrides({ 'nav.today': 'ctrl+1' });
    const navigate = vi.fn();

    render(
      <MemoryRouter>
        <ShortcutsHelpDialog />
      </MemoryRouter>,
    );

    const overriddenEvent: KeyboardDispatchEvent = {
      key: '1',
      code: 'Digit1',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
      defaultPrevented: false,
      isComposing: false,
      target: null,
      preventDefault: () => undefined,
    };

    act(() => {
      dispatchKeyboardEvent(overriddenEvent, { navigate });
    });

    expect(navigate).toHaveBeenCalledWith('/today');
    const section = screen.getByRole('region', { name: 'Navigation' });
    expect(within(section).getByText('Ctrl + 1')).toBeInTheDocument();
  });
});
