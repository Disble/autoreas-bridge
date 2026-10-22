import archiveUpIcon from '@iconify-icons/solar/archive-up-linear';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IconActionButton } from '../IconActionButton';
import type { IconActionButtonProps } from '../icon-action-button.types';

/** Renders the button with test defaults, overridable per case. */
function renderButton(overrides: Partial<IconActionButtonProps> = {}) {
  return render(<IconActionButton ariaLabel="Restore Frieren" icon={archiveUpIcon} tooltip="Restore" onPress={vi.fn()} {...overrides} />);
}

/** Moves focus to the button the way a keyboard user does, which opens its tooltip at once. */
function focusByKeyboard(button: HTMLElement): void {
  fireEvent.keyDown(document.body, { key: 'Tab' });
  act(() => button.focus());
}

/**
 * Hovers an element with a mouse. A pointer press first puts React Aria in
 * pointer modality: a tooltip ignores hover while the last input was a keyboard.
 */
function hoverWithMouse(element: HTMLElement): void {
  fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
  fireEvent.pointerUp(document.body, { pointerType: 'mouse' });
  fireEvent.pointerOver(element, { pointerType: 'mouse' });
}

afterEach(() => {
  vi.useRealTimers();
});

describe('IconActionButton', () => {
  it('waits 300 ms on hover before naming the action', () => {
    vi.useFakeTimers();
    renderButton();
    const trigger = screen.getByRole('button', { name: 'Restore Frieren' }).parentElement as HTMLElement;

    hoverWithMouse(trigger);
    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByRole('tooltip')).toBeNull();

    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Restore');
  });

  it('renders an icon-only button named by its aria-label, with no visible text', () => {
    renderButton();

    expect(screen.getByRole('button', { name: 'Restore Frieren' })).toHaveTextContent(/^$/);
  });

  it('names the action in its tooltip on keyboard focus', () => {
    renderButton();

    focusByKeyboard(screen.getByRole('button', { name: 'Restore Frieren' }));

    expect(screen.getByRole('tooltip')).toHaveTextContent('Restore');
  });

  it('shows the extra data on a second line after the name', () => {
    renderButton({ ariaLabel: 'Open folder for Frieren', tooltip: 'Open folder', detail: 'D:\\Anime\\Frieren' });

    focusByKeyboard(screen.getByRole('button', { name: 'Open folder for Frieren' }));

    const lines = screen.getByRole('tooltip').querySelectorAll('span > span');
    expect([...lines].map((line) => line.textContent)).toEqual(['Open folder', 'D:\\Anime\\Frieren']);
  });

  it('explains a disabled button on hover, with the reason after the name', async () => {
    renderButton({ isDisabled: true, disabledReason: 'Nothing to restore' });
    const button = screen.getByRole('button', { name: 'Restore Frieren' });

    expect(button).toBeDisabled();
    hoverWithMouse(button.parentElement as HTMLElement);

    expect(await screen.findByRole('tooltip')).toHaveTextContent('Restore · Nothing to restore');
  });

  it('runs the action on press', () => {
    const onPress = vi.fn();
    renderButton({ onPress });

    fireEvent.click(screen.getByRole('button', { name: 'Restore Frieren' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('runs the secondary action on a context menu and suppresses the browser menu', () => {
    const onContextMenu = vi.fn();
    renderButton({ onContextMenu });

    const wasNotPrevented = fireEvent.contextMenu(screen.getByRole('button', { name: 'Restore Frieren' }));

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(wasNotPrevented).toBe(false);
  });

  it('leaves the browser menu alone without a secondary action', () => {
    renderButton();

    expect(fireEvent.contextMenu(screen.getByRole('button', { name: 'Restore Frieren' }))).toBe(true);
  });

  it.each([
    { scenario: 'tints on hover with its tone', props: { tone: 'danger' }, present: 'hover:text-danger', absent: 'text-danger' },
    { scenario: 'keeps its tint while tinted', props: { tone: 'success', isTinted: true }, present: 'text-success', absent: 'hover:text-success' },
  ] as const)('$scenario', ({ props, present, absent }) => {
    renderButton(props);
    const button = screen.getByRole('button', { name: 'Restore Frieren' });

    expect(button).toHaveClass(present);
    expect(button).not.toHaveClass(absent);
  });
});
