import { fireEvent, render, screen } from '@testing-library/react';
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
});
