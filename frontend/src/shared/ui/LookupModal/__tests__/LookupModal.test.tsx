import { Button } from '@heroui/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LookupModal } from '../LookupModal';
import type { LookupModalProps, LookupModalState } from '../lookup-modal.types';

/** Copy a test lookup renders, distinct per slot so each assertion names one slot. */
const TEST_COPY: LookupModalProps['copy'] = {
  heading: 'Find it',
  searchLabel: 'Search the source',
  searchPlaceholder: 'Search the source...',
  loadingLabel: 'Searching the source...',
  errorTitle: 'The source failed',
  emptyTitle: (query) => `Nothing for "${query}"`,
  emptyDescription: 'Try another title.',
  listLabel: 'Source candidates',
  confirmLabel: 'Use this one',
  cancelLabel: 'Cancel',
};

/**
 * Renders the shell open, with defaults a test overrides only where it cares.
 * @param overrides Per-test prop replacements.
 * @returns Nothing -- the dialog is on screen once this returns.
 */
function renderShell(overrides: Partial<LookupModalProps> = {}): void {
  render(
    <LookupModal
      confirmError=""
      copy={TEST_COPY}
      errorMessage=""
      hasCandidates={false}
      isConfirmDisabled
      isConfirming={false}
      isOpen
      query="bleach"
      state="idle"
      trigger={<Button>Open</Button>}
      onConfirm={vi.fn()}
      onOpenChange={vi.fn()}
      onQueryChange={vi.fn()}
      {...overrides}
    >
      <button type="button">Bleach row</button>
    </LookupModal>,
  );
}

/**
 * Reports which of the exclusive list states are on screen.
 * @returns One flag per state.
 */
function visibleStates(): Record<'loading' | 'failed' | 'empty' | 'list', boolean> {
  return {
    loading: screen.queryByRole('status', { name: TEST_COPY.loadingLabel }) !== null,
    failed: screen.queryByText(TEST_COPY.errorTitle) !== null,
    empty: screen.queryByText('Nothing for "bleach"') !== null,
    list: screen.queryByLabelText(TEST_COPY.listLabel) !== null,
  };
}

describe('LookupModal', () => {
  afterEach(() => {
    cleanup();
  });

  it.each<{ state: LookupModalState; hasCandidates: boolean; visible: readonly string[] }>([
    { state: 'idle', hasCandidates: false, visible: [] },
    { state: 'loading', hasCandidates: false, visible: ['loading'] },
    { state: 'failed', hasCandidates: false, visible: ['failed'] },
    { state: 'resolved', hasCandidates: false, visible: ['empty'] },
    { state: 'resolved', hasCandidates: true, visible: ['list'] },
  ])('renders only $visible for state $state with candidates=$hasCandidates', ({ state, hasCandidates, visible }) => {
    renderShell({ state, hasCandidates, errorMessage: 'boom' });

    const shown = Object.entries(visibleStates())
      .filter(([, isShown]) => isShown)
      .map(([name]) => name);
    expect(shown).toEqual(visible);
    expect(screen.queryByRole('button', { name: 'Bleach row' }) !== null).toBe(visible.includes('list'));
  });

  it('names the search field from the copy and reports typing', () => {
    const onQueryChange = vi.fn();
    renderShell({ onQueryChange });

    fireEvent.change(screen.getByRole('searchbox', { name: TEST_COPY.searchLabel }), { target: { value: 'naruto' } });

    expect(onQueryChange).toHaveBeenCalledWith('naruto');
  });

  it.each([true, false])('disables confirm while isConfirmDisabled=%s', (isConfirmDisabled) => {
    const onConfirm = vi.fn();
    renderShell({ isConfirmDisabled, onConfirm });

    fireEvent.click(screen.getByRole('button', { name: TEST_COPY.confirmLabel }));

    expect(screen.getByRole('button', { name: TEST_COPY.confirmLabel }).hasAttribute('disabled')).toBe(isConfirmDisabled);
    expect(onConfirm).toHaveBeenCalledTimes(isConfirmDisabled ? 0 : 1);
  });

  it('closes through onOpenChange when Cancel is pressed', () => {
    const onOpenChange = vi.fn();
    renderShell({ onOpenChange });

    fireEvent.click(screen.getByRole('button', { name: TEST_COPY.cancelLabel }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it.each([
    { confirmError: '', shown: false },
    { confirmError: 'detail failed', shown: true },
  ])('shows the confirm error alert only when one is reported ($confirmError)', ({ confirmError, shown }) => {
    renderShell({ confirmError });

    expect(screen.queryByText('detail failed') !== null).toBe(shown);
    expect(screen.queryByText(TEST_COPY.errorTitle) !== null).toBe(shown);
  });
});
