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
    onRevert: vi.fn(),
    ...overrides,
  };
}

describe('KeymapBindingRow', () => {
  it('renders label and chord, then hazard chip, scope note and an enabled Revert once props call for them', () => {
    const onRevert = vi.fn();
    const props = buildProps({ binding: buildBinding({ label: 'Focus catalog search' }), effectiveChord: 'alt+f', onRevert });
    const { rerender } = render(<KeymapBindingRow {...props} />);

    expect(screen.getByText('Focus catalog search')).toBeInTheDocument();
    expect(screen.getByText('Alt + F')).toBeInTheDocument();
    expect(screen.queryByText('Browser zoom')).not.toBeInTheDocument();
    expect(screen.queryByTestId('keymap-binding-row-scope-note')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled();

    rerender(
      <KeymapBindingRow
        {...props}
        hazard="browser-zoom"
        isOverridden
        scopeNote="while the Notification Center is open"
      />,
    );

    expect(screen.getByText('Browser zoom')).toBeInTheDocument();
    expect(screen.getByTestId('keymap-binding-row-scope-note')).toHaveTextContent('while the Notification Center is open');
    const revertButton = screen.getByRole('button', { name: 'Revert' });
    expect(revertButton).not.toBeDisabled();

    fireEvent.click(revertButton);

    expect(onRevert).toHaveBeenCalledTimes(1);
  });

  it('prompts once armed, shows refusals in danger and stays armed, clears them on Rebind, warns a shadow', async () => {
    const onCaptureChord = vi
      .fn()
      .mockResolvedValueOnce({ status: 'refused', message: '"Today" already uses this chord in this scope.' })
      .mockResolvedValueOnce({ status: 'refused', message: 'refused once' })
      .mockResolvedValueOnce({
        status: 'shadowed',
        message: '"Mark all as read" takes precedence over this chord while its scope is active.',
      });
    render(<KeymapBindingRow {...buildProps({ effectiveChord: 'alt+1', onCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });

    fireEvent.click(rebindButton);
    expect(screen.getByTestId('keymap-binding-row-chord')).toHaveTextContent('Press a key...');

    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', ctrlKey: true });
    expect(screen.getByTestId('keymap-binding-row-chord')).toHaveTextContent('Ctrl + 1');
    expect(onCaptureChord).toHaveBeenCalledWith('ctrl+1');
    const refusal = await screen.findByText('"Today" already uses this chord in this scope.');
    expect(refusal).toHaveClass('text-danger');
    expect(refusal).not.toHaveClass('text-warning');

    fireEvent.keyDown(rebindButton, { key: '2', code: 'Digit2', altKey: true });

    expect(onCaptureChord).toHaveBeenCalledTimes(2);
    expect(onCaptureChord).toHaveBeenLastCalledWith('alt+2');
    await screen.findByText('refused once');

    fireEvent.click(rebindButton);

    expect(screen.queryByText('refused once')).not.toBeInTheDocument();

    fireEvent.keyDown(rebindButton, { key: '3', code: 'Digit3', ctrlKey: true });

    const warning = await screen.findByText('"Mark all as read" takes precedence over this chord while its scope is active.');
    expect(warning).toHaveClass('text-warning');
    expect(warning).not.toHaveClass('text-danger');
  });

  it('calls the CURRENT onCaptureChord after a new prop, then disarms once it saves so stray keys persist nothing', async () => {
    const firstOnCaptureChord = vi.fn().mockResolvedValue({ status: 'saved', message: null });
    const secondOnCaptureChord = vi.fn().mockResolvedValue({ status: 'saved', message: null });
    const { rerender } = render(<KeymapBindingRow {...buildProps({ onCaptureChord: firstOnCaptureChord })} />);

    rerender(<KeymapBindingRow {...buildProps({ onCaptureChord: secondOnCaptureChord })} />);
    const rebindButton = screen.getByRole('button', { name: 'Rebind' });
    fireEvent.click(rebindButton);
    fireEvent.keyDown(rebindButton, { key: '1', code: 'Digit1', ctrlKey: true });

    expect(secondOnCaptureChord).toHaveBeenCalledTimes(1);
    expect(firstOnCaptureChord).not.toHaveBeenCalled();

    await waitFor(() => expect(secondOnCaptureChord).toHaveBeenCalledTimes(1));

    fireEvent.keyDown(rebindButton, { key: '2', code: 'Digit2', ctrlKey: true });

    expect(secondOnCaptureChord).toHaveBeenCalledTimes(1);
    // A `{status: 'saved', message: null}` outcome has nothing to show --
    // distinct from an outcome existing at all (the `outcome !== null` half).
    expect(screen.queryByTestId('keymap-binding-row-message')).not.toBeInTheDocument();
  });
});
