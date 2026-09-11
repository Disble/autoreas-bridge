import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CommandBinding } from '../../../keyboard.types';
import { KeymapBindingRow } from '../KeymapBindingRow';
import type { KeymapBindingRowProps } from '../keymap-binding-row.types';

/** Builds a minimal command binding, overriding only what a case needs. */
function buildBinding(overrides: Partial<CommandBinding> = {}): CommandBinding {
  return {
    id: 'test.command',
    scope: 'global',
    chord: 'alt+1',
    label: 'Test command',
    section: 'Navigation',
    ...overrides,
  };
}

/** Builds a full set of row props, overriding only what a case needs. */
function buildProps(overrides: Partial<KeymapBindingRowProps> = {}): KeymapBindingRowProps {
  return {
    binding: buildBinding(),
    effectiveChord: 'alt+1',
    hazard: null,
    isOverridden: false,
    scopeNote: null,
    onCaptureChord: vi.fn().mockResolvedValue({ status: 'saved', message: null }),
    onRebind: vi.fn(),
    onRevert: vi.fn(),
    ...overrides,
  };
}

describe('KeymapBindingRow', () => {
  it('renders the binding label and its formatted effective chord', () => {
    render(
      <KeymapBindingRow
        {...buildProps({ binding: buildBinding({ label: 'Focus catalog search' }), effectiveChord: 'alt+f' })}
      />,
    );

    expect(screen.getByText('Focus catalog search')).toBeInTheDocument();
    expect(screen.getByText('Alt + F')).toBeInTheDocument();
  });

  it('renders a hazard chip only when the hazard is browser-zoom', () => {
    const { rerender } = render(<KeymapBindingRow {...buildProps({ hazard: null })} />);
    expect(screen.queryByText('Browser zoom')).not.toBeInTheDocument();

    rerender(<KeymapBindingRow {...buildProps({ hazard: 'browser-zoom' })} />);
    expect(screen.getByText('Browser zoom')).toBeInTheDocument();
  });

  it('renders the scope note only for a scoped binding', () => {
    const { rerender } = render(<KeymapBindingRow {...buildProps({ scopeNote: null })} />);
    expect(screen.queryByTestId('keymap-binding-row-scope-note')).not.toBeInTheDocument();

    rerender(<KeymapBindingRow {...buildProps({ scopeNote: 'while the Notification Center is open' })} />);
    expect(screen.getByTestId('keymap-binding-row-scope-note')).toHaveTextContent(
      'while the Notification Center is open',
    );
  });

  it('calls onRebind when the Rebind button is pressed', () => {
    const onRebind = vi.fn();
    render(<KeymapBindingRow {...buildProps({ onRebind })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Rebind' }));

    expect(onRebind).toHaveBeenCalledTimes(1);
  });

  it('shows a capture prompt once armed, then the recorded candidate chord once a key is captured', () => {
    render(<KeymapBindingRow {...buildProps({ effectiveChord: 'alt+1' })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    expect(screen.getByTestId('keymap-binding-row-chord')).toHaveTextContent('Press a key...');

    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', ctrlKey: true });
    expect(screen.getByTestId('keymap-binding-row-chord')).toHaveTextContent('Ctrl + 1');
  });

  it('disables Revert when the binding is not overridden, and calls onRevert when pressed while overridden', () => {
    const onRevert = vi.fn();
    const { rerender } = render(<KeymapBindingRow {...buildProps({ isOverridden: false, onRevert })} />);
    expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled();

    rerender(<KeymapBindingRow {...buildProps({ isOverridden: true, onRevert })} />);
    const revertButton = screen.getByRole('button', { name: 'Revert' });
    expect(revertButton).not.toBeDisabled();

    fireEvent.click(revertButton);

    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it('calls onCaptureChord with the captured chord, and displays the returned refusal message in the danger color (spec "A same-scope duplicate is refused")', async () => {
    const onCaptureChord = vi.fn().mockResolvedValue({
      status: 'refused',
      message: '"Today" already uses this chord in this scope.',
    });
    render(<KeymapBindingRow {...buildProps({ onCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', altKey: true });

    expect(onCaptureChord).toHaveBeenCalledWith('alt+1');
    const message = await screen.findByText('"Today" already uses this chord in this scope.');
    expect(message).toHaveClass('text-danger');
    expect(message).not.toHaveClass('text-warning');
  });

  it('displays a returned shadow warning in the warning color, distinct from a refusal (spec "A cross-scope shadow is saved with a warning")', async () => {
    const onCaptureChord = vi.fn().mockResolvedValue({
      status: 'shadowed',
      message: '"Mark all as read" takes precedence over this chord while its scope is active.',
    });
    render(<KeymapBindingRow {...buildProps({ onCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', ctrlKey: true });

    const message = await screen.findByText('"Mark all as read" takes precedence over this chord while its scope is active.');
    expect(message).toHaveClass('text-warning');
    expect(message).not.toHaveClass('text-danger');
  });

  it('stays armed after a refusal, so a second attempt is still captured (design D8: "stay armed")', async () => {
    const onCaptureChord = vi.fn().mockResolvedValue({ status: 'refused', message: 'refused' });
    render(<KeymapBindingRow {...buildProps({ onCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', altKey: true });
    await screen.findByText('refused');

    fireEvent.keyDown(rebindButton, { key: '2', code: 'Digit2', altKey: true });

    expect(onCaptureChord).toHaveBeenCalledTimes(2);
    expect(onCaptureChord).toHaveBeenLastCalledWith('alt+2');
  });

  it('disarms once a captured chord saves, so a later stray keypress no longer records or persists anything', async () => {
    const onCaptureChord = vi.fn().mockResolvedValue({ status: 'saved', message: null });
    render(<KeymapBindingRow {...buildProps({ onCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', ctrlKey: true });

    await waitFor(() => expect(onCaptureChord).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(rebindButton, { key: '2', code: 'Digit2', ctrlKey: true });

    expect(onCaptureChord).toHaveBeenCalledTimes(1);
    // A `{status: 'saved', message: null}` outcome has nothing to show --
    // distinct from an outcome existing at all (the `outcome !== null` half).
    expect(screen.queryByTestId('keymap-binding-row-message')).not.toBeInTheDocument();
  });

  it('calls the CURRENT onCaptureChord after Rebind is pressed again with a new prop, not a frozen first one', async () => {
    const firstOnCaptureChord = vi.fn().mockResolvedValue({ status: 'saved', message: null });
    const secondOnCaptureChord = vi.fn().mockResolvedValue({ status: 'saved', message: null });
    const { rerender } = render(<KeymapBindingRow {...buildProps({ onCaptureChord: firstOnCaptureChord })} />);

    rerender(<KeymapBindingRow {...buildProps({ onCaptureChord: secondOnCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });
    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', ctrlKey: true });

    expect(secondOnCaptureChord).toHaveBeenCalledTimes(1);
    expect(firstOnCaptureChord).not.toHaveBeenCalled();
  });

  it('clears a stale refusal/warning message when Rebind is pressed again', async () => {
    const onCaptureChord = vi.fn().mockResolvedValue({ status: 'refused', message: 'refused once' });
    render(<KeymapBindingRow {...buildProps({ onCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', altKey: true });
    await screen.findByText('refused once');

    fireEvent.click(rebindButton);

    expect(screen.queryByText('refused once')).not.toBeInTheDocument();
  });
});
