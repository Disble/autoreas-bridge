import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SeasonAnimeRow } from '../../../../../shared/contracts/season.types';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';
import { seasonQueryWrapper, seasonRow } from './intake-panel.test-support';

vi.mock('../use-intake-panel', () => ({ useIntakePanel: vi.fn() }));

/** Hook result configured by each case: empty state, discarded view and row actions. */
type HookReturn = ReturnType<typeof useIntakePanel>;
/** Mocked hook setter. */
const mockedUseIntakePanel = vi.mocked(useIntakePanel);

/** Builds the smallest row needed to prove the populated state. */
function row(): SeasonAnimeRow {
  return { id: 'row-1', rawName: 'Dr. Stone', matchStatus: 'pending', matchedSlug: '', candidates: [], availability: 'waiting', availableEpisodes: 0, animeId: '', section: '', sectionOrder: 0, grade: 0, gradeSource: '', skipGrading: false, consideration: 'none' };
}

/** Sets the panel hook to an empty default with selected overrides. */
function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    asyncView: { kind: 'ready', data: [], isRefreshing: false }, readOnly: false, mode: 'list', switchMode: vi.fn(), rawDraft: '', onRawChange: vi.fn(), editableRows: [], selected: new Set(), toggleSelect: vi.fn(),
    folderOverrides: {}, folderPreviews: {}, onPickFolder: vi.fn(), metadataByRow: {}, appliedMetadataByRow: {}, metadataLookupSource: {} as HookReturn['metadataLookupSource'],
    onMetadataApplied: vi.fn(), onMetadataClear: vi.fn(), onMetadataUndo: vi.fn(), availableCount: 0, availabilityPendingCount: 0, onCreate: vi.fn(), unresolvedCount: 0, searchFailedCount: 0,
    errorMessage: undefined, busyMessage: undefined, matchingRun: null, matchingProgressMessage: undefined, onRunMatching: vi.fn(), onRecheckAvailability: vi.fn(), onResolve: vi.fn(), onDiscard: vi.fn(), onOpenPage: vi.fn(),
    discardedRows: [], discardedMetadataByRow: {}, view: 'active', onViewChange: vi.fn(), onRestore: vi.fn(), ...overrides,
  };
  mockedUseIntakePanel.mockReturnValue(value);
  return value;
}

describe('IntakePanel empty state', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows only a row-shaped loading skeleton while rows are unavailable', () => {
    mockHook({ asyncView: { kind: 'loading' }, editableRows: [row()] });
    render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
    expect(screen.getByRole('status', { name: 'Loading intake' })).toBeInTheDocument();
    expect(screen.queryByText('Dr. Stone')).not.toBeInTheDocument();
    expect(screen.queryByText('No intake rows yet')).not.toBeInTheDocument();
  });

  it('shows the query failure rather than rows or empty state', () => {
    mockHook({ asyncView: { kind: 'failure', code: 'internal', message: 'Load failed' }, editableRows: [row()] });
    render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(screen.queryByText('Dr. Stone')).not.toBeInTheDocument();
    expect(screen.queryByText('No intake rows yet')).not.toBeInTheDocument();
  });

  it('offers Paste list and switches to raw mode, without zero counters', () => {
    const hook = mockHook();
    render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
    expect(screen.getByText('No intake rows yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paste list' }));
    expect(hook.switchMode).toHaveBeenCalledWith('raw');
    expect(screen.queryByText(/unresolved ·/)).not.toBeInTheDocument();
  });

  it('hides the zero counters in raw mode too when there are no rows', () => {
    mockHook({ mode: 'raw' });
    render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
    expect(screen.queryByText(/unresolved ·/)).not.toBeInTheDocument();
  });

  it('shows counters with rows and does not show the empty state', () => {
    mockHook({ editableRows: [row()], unresolvedCount: 1 });
    render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
    expect(screen.queryByText('No intake rows yet')).not.toBeInTheDocument();
    expect(screen.getByText(/1 unresolved ·/)).toBeInTheDocument();
  });

  it('shows the error instead of the empty state when empty data has failed', () => {
    mockHook({ errorMessage: 'Intake failed' });
    render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
    expect(screen.getByText('Intake failed').closest('[data-slot="alert-root"]')).toHaveClass('alert--danger');
    expect(screen.queryByText('No intake rows yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/unresolved ·/)).not.toBeInTheDocument();
  });
});

/** The two active rows every case shows in the Active view. */
const ACTIVE_ROWS = [seasonRow({ id: 'row-1', rawName: 'Romeria Senki' }), seasonRow({ id: 'row-2', rawName: 'Kyouran Reijou' })];

/**
 * Mounts the panel in List mode over the active rows and returns the mocked hook.
 * @param overrides The hook fields a case is about (discarded rows, view, read-only).
 * @returns The hook result the panel rendered with.
 */
function renderDiscardedPanel(overrides: Partial<Record<keyof HookReturn, unknown>> = {}): HookReturn {
  const value = {
    asyncView: { kind: 'ready', data: [], isRefreshing: false }, readOnly: false, mode: 'list', switchMode: vi.fn(), rawDraft: '', onRawChange: vi.fn(), selected: new Set(), toggleSelect: vi.fn(),
    editableRows: ACTIVE_ROWS, discardedRows: [], discardedMetadataByRow: {}, view: 'active', onViewChange: vi.fn(), onRestore: vi.fn(),
    folderOverrides: {}, folderPreviews: {}, onPickFolder: vi.fn(), metadataByRow: {}, appliedMetadataByRow: {}, metadataLookupSource: {},
    onMetadataApplied: vi.fn(), onMetadataClear: vi.fn(), onMetadataUndo: vi.fn(), availableCount: 0, availabilityPendingCount: 0, onCreate: vi.fn(),
    unresolvedCount: 2, searchFailedCount: 0, errorMessage: undefined, busyMessage: undefined, onRunMatching: vi.fn(), onRecheckAvailability: vi.fn(), onResolve: vi.fn(),
    onDiscard: vi.fn(), onOpenPage: vi.fn(),
    ...overrides,
  } as unknown as HookReturn;
  mockedUseIntakePanel.mockReturnValue(value);
  render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
  return value;
}

describe('IntakePanel discarded view', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('shows no view toggle while nothing is discarded', () => {
    renderDiscardedPanel();

    expect(screen.queryByRole('radiogroup', { name: 'Intake view' })).toBeNull();
    expect(screen.getByRole('button', { name: 'List' })).toBeInTheDocument();
  });

  it('offers Active and Discarded with their counts once a row is discarded, and switches on press', () => {
    const hook = renderDiscardedPanel({ discardedRows: [seasonRow({ id: 'row-3', rawName: 'Zombie Sagashitemasu', matchStatus: 'discarded' })] });

    expect(screen.getByRole('radio', { name: /^Active/ })).toHaveTextContent(/^Active\s*2$/);
    expect(screen.getByRole('radio', { name: /^Active/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /^Discarded/ }));

    expect(screen.getByRole('radio', { name: /^Discarded/ })).toHaveTextContent(/^Discarded\s*1$/);
    expect(hook.onViewChange).toHaveBeenCalledExactlyOnceWith('discarded');
  });

  it('lists only the discarded rows like active rows, with a Restore button and no matching or creation controls', () => {
    const hook = renderDiscardedPanel({
      view: 'discarded',
      discardedRows: [
        seasonRow({ id: 'row-3', rawName: 'Zombie Sagashitemasu', matchStatus: 'discarded', matchedSlug: 'https://jkanime.net/zombie/' }),
        seasonRow({ id: 'row-4', rawName: 'Zombie Sagashitemsu', matchStatus: 'discarded' }),
      ],
      discardedMetadataByRow: { 'row-3': { totalEpisodes: '12', studios: 'Studio Comet' } },
    });

    const [matched, typo] = screen.getAllByRole('listitem');
    expect(within(matched).getByTestId('intake-row-summary')).toHaveTextContent('Studio Comet');
    expect(within(matched).queryByText(/Pending|Matched|available/)).toBeNull();
    expect(within(typo).queryByTestId('intake-row-summary')).toBeNull();
    expect(within(typo).getByTestId('season-cover-thumb-placeholder')).toBeInTheDocument();
    expect(within(typo).getByText('Pending')).toBeInTheDocument();
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
    renderDiscardedPanel({ ...overrides, discardedRows: [seasonRow({ id: 'row-3', matchStatus: 'discarded' })] });

    expect(screen.queryByRole('radiogroup', { name: 'Intake view' })).toBeNull();
  });
});

/** Candidate page the unresolved rows offer. */
const PAGE_URL = 'https://jkanime.net/dr-stone/';
/** A matched, available row: selectable and able to pick a folder. */
const CREATABLE = { matchStatus: 'matched', matchedSlug: PAGE_URL, availability: 'available' } as const;
/** An unresolved row offering one candidate to resolve to. */
const AMBIGUOUS = { matchStatus: 'ambiguous', candidates: [{ title: 'Dr. Stone', pageUrl: PAGE_URL, score: 0.91 }] } as const;

/** Mounts the panel in List mode over two rows and returns the mocked hook. */
function renderTwoRows(shape: Parameters<typeof seasonRow>[0]): HookReturn {
  const value = {
    asyncView: { kind: 'ready', data: [], isRefreshing: false }, readOnly: false, mode: 'list', switchMode: vi.fn(), rawDraft: '', onRawChange: vi.fn(), selected: new Set(), toggleSelect: vi.fn(),
    editableRows: [seasonRow({ id: 'row-1', rawName: 'First', ...shape }), seasonRow({ id: 'row-2', rawName: 'Second', ...shape })],
    folderOverrides: {}, folderPreviews: {}, onPickFolder: vi.fn(), metadataByRow: {}, appliedMetadataByRow: {}, metadataLookupSource: {},
    onMetadataApplied: vi.fn(), onMetadataClear: vi.fn(), onMetadataUndo: vi.fn(), availableCount: 0, availabilityPendingCount: 0, onCreate: vi.fn(),
    unresolvedCount: 0, searchFailedCount: 0, errorMessage: undefined, busyMessage: undefined, onRunMatching: vi.fn(), onRecheckAvailability: vi.fn(), onResolve: vi.fn(),
    onDiscard: vi.fn(), onOpenPage: vi.fn(), discardedRows: [], discardedMetadataByRow: {}, view: 'active', onViewChange: vi.fn(), onRestore: vi.fn(),
  } as unknown as HookReturn;
  mockedUseIntakePanel.mockReturnValue(value);
  render(<IntakePanel />, { wrapper: seasonQueryWrapper() });
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
