import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';
import { seasonRow } from './intake-panel.test-support';

vi.mock('../use-intake-panel', () => ({ useIntakePanel: vi.fn() }));

/** Hook result configured by each discarded-view case. */
type HookReturn = ReturnType<typeof useIntakePanel>;
/** Mocked hook setter. */
const mockedUseIntakePanel = vi.mocked(useIntakePanel);
/** The two active rows every case shows in the Active view. */
const ACTIVE_ROWS = [seasonRow({ id: 'row-1', rawName: 'Romeria Senki' }), seasonRow({ id: 'row-2', rawName: 'Kyouran Reijou' })];

/**
 * Mounts the panel in List mode over the active rows and returns the mocked hook.
 * @param overrides The hook fields a case is about (discarded rows, view, read-only).
 * @returns The hook result the panel rendered with.
 */
function renderPanel(overrides: Partial<Record<keyof HookReturn, unknown>> = {}): HookReturn {
  const value = {
    readOnly: false, mode: 'list', switchMode: vi.fn(), rawDraft: '', onRawChange: vi.fn(), selected: new Set(), toggleSelect: vi.fn(),
    editableRows: ACTIVE_ROWS, discardedRows: [], view: 'active', onViewChange: vi.fn(), onRestore: vi.fn(),
    folderOverrides: {}, folderPreviews: {}, onPickFolder: vi.fn(), metadataByRow: {}, appliedMetadataByRow: {}, metadataLookupSource: {}, providerSearchSource: {},
    onMetadataApplied: vi.fn(), onMetadataClear: vi.fn(), onMetadataUndo: vi.fn(), availableCount: 0, availabilityPendingCount: 0, onCreate: vi.fn(),
    unresolvedCount: 2, searchFailedCount: 0, errorMessage: undefined, busyMessage: undefined, onRunMatching: vi.fn(), onRecheckAvailability: vi.fn(), onResolve: vi.fn(),
    onDiscard: vi.fn(), onOpenPage: vi.fn(),
    ...overrides,
  } as unknown as HookReturn;
  mockedUseIntakePanel.mockReturnValue(value);
  render(<IntakePanel />);
  return value;
}

describe('IntakePanel discarded view', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows no view toggle while nothing is discarded', () => {
    renderPanel();

    expect(screen.queryByRole('radiogroup', { name: 'Intake view' })).toBeNull();
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
  });

  it('offers Active and Discarded with their counts once a row is discarded, and switches on press', () => {
    const hook = renderPanel({ discardedRows: [seasonRow({ id: 'row-3', rawName: 'Zombie Sagashitemasu', matchStatus: 'discarded' })] });

    expect(screen.getByRole('radio', { name: /^Active/ })).toHaveTextContent(/^Active\s*2$/);
    expect(screen.getByRole('radio', { name: /^Active/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^Discarded/ }));

    expect(screen.getByRole('radio', { name: /^Discarded/ })).toHaveTextContent(/^Discarded\s*1$/);
    expect(hook.onViewChange).toHaveBeenCalledExactlyOnceWith('discarded');
  });

  it('lists only the discarded rows with a Restore button, and no matching or creation controls', () => {
    const hook = renderPanel({
      view: 'discarded',
      discardedRows: [seasonRow({ id: 'row-3', rawName: 'Zombie Sagashitemasu', matchStatus: 'discarded' })],
    });

    fireEvent.click(screen.getByRole('button', { name: 'Restore Zombie Sagashitemasu' }));

    expect(hook.onRestore).toHaveBeenCalledExactlyOnceWith('row-3');
    expect(screen.queryByText('Romeria Senki')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Run matching' })).toBeNull();
    expect(screen.queryByText(/unresolved/)).toBeNull();
  });

  it.each([
    { scenario: 'a read-only season', overrides: { readOnly: true } },
    { scenario: 'Raw mode', overrides: { mode: 'raw' } },
  ])('shows no view toggle in $scenario', ({ overrides }) => {
    renderPanel({ ...overrides, discardedRows: [seasonRow({ id: 'row-3', matchStatus: 'discarded' })] });

    expect(screen.queryByRole('radiogroup', { name: 'Intake view' })).toBeNull();
  });
});
