import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';
import { seasonRow } from './intake-panel.test-support';

vi.mock('../use-intake-panel', () => ({ useIntakePanel: vi.fn() }));

/** Hook result configured by each row-action case. */
type HookReturn = ReturnType<typeof useIntakePanel>;
/** Mocked hook setter. */
const mockedUseIntakePanel = vi.mocked(useIntakePanel);
/** Candidate page the unresolved rows offer. */
const PAGE_URL = 'https://jkanime.net/dr-stone/';
/** A matched, available row: selectable and able to pick a folder. */
const CREATABLE = { matchStatus: 'matched', matchedSlug: PAGE_URL, availability: 'available' } as const;
/** An unresolved row offering one candidate to resolve to. */
const AMBIGUOUS = { matchStatus: 'ambiguous', candidates: [{ title: 'Dr. Stone', pageUrl: PAGE_URL, score: 0.91 }] } as const;

/** Mounts the panel in List mode over two rows and returns the mocked hook. */
function renderTwoRows(shape: Parameters<typeof seasonRow>[0]): HookReturn {
  const value = {
    readOnly: false, mode: 'list', switchMode: vi.fn(), rawDraft: '', onRawChange: vi.fn(), selected: new Set(), toggleSelect: vi.fn(),
    editableRows: [seasonRow({ id: 'row-1', rawName: 'First', ...shape }), seasonRow({ id: 'row-2', rawName: 'Second', ...shape })],
    folderOverrides: {}, folderPreviews: {}, onPickFolder: vi.fn(), metadataByRow: {}, appliedMetadataByRow: {}, metadataLookupSource: {}, providerSearchSource: {},
    onMetadataApplied: vi.fn(), onMetadataClear: vi.fn(), onMetadataUndo: vi.fn(), availableCount: 0, availabilityPendingCount: 0, onCreate: vi.fn(),
    unresolvedCount: 0, searchFailedCount: 0, errorMessage: undefined, busyMessage: undefined, onRunMatching: vi.fn(), onRecheckAvailability: vi.fn(), onResolve: vi.fn(),
    onDiscard: vi.fn(), onOpenPage: vi.fn(), discardedRows: [], view: 'active', onViewChange: vi.fn(), onRestore: vi.fn(),
  } as unknown as HookReturn;
  mockedUseIntakePanel.mockReturnValue(value);
  render(<IntakePanel />);
  return value;
}

describe('IntakePanel row actions', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('picks the folder of the row whose folder button was pressed', () => {
    const hook = renderTwoRows(CREATABLE);
    fireEvent.click(screen.getByRole('button', { name: 'Set download folder for Second' }));
    expect(hook.onPickFolder).toHaveBeenCalledExactlyOnceWith('row-2');
  });

  it('resolves the row whose candidate was pressed, to that candidate page', () => {
    const hook = renderTwoRows(AMBIGUOUS);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dr. Stone (91%)' })[1]);
    expect(hook.onResolve).toHaveBeenCalledExactlyOnceWith('row-2', PAGE_URL);
  });

  it('toggles the selection of the row whose checkbox was clicked', () => {
    const hook = renderTwoRows(CREATABLE);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    expect(hook.toggleSelect).toHaveBeenCalledExactlyOnceWith('row-2');
  });
});
