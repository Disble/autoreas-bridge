import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';
import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source/season-source.types';

vi.mock('../use-intake-panel', () => ({ useIntakePanel: vi.fn() }));

/** Hook result configured by each empty-state case. */
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
    readOnly: false, mode: 'list', switchMode: vi.fn(), rawDraft: '', onRawChange: vi.fn(), editableRows: [], selected: new Set(), toggleSelect: vi.fn(),
    folderOverrides: {}, folderPreviews: {}, onPickFolder: vi.fn(), metadataByRow: {}, appliedMetadataByRow: {}, metadataLookupSource: {} as HookReturn['metadataLookupSource'],
    onMetadataApplied: vi.fn(), onMetadataClear: vi.fn(), onMetadataUndo: vi.fn(), availableCount: 0, availabilityPendingCount: 0, onCreate: vi.fn(), unresolvedCount: 0,
    errorMessage: undefined, busyMessage: undefined, onRunMatching: vi.fn(), onRecheckAvailability: vi.fn(), onResolve: vi.fn(), onDiscard: vi.fn(), onOpenPage: vi.fn(), ...overrides,
  };
  mockedUseIntakePanel.mockReturnValue(value);
  return value;
}

describe('IntakePanel empty state', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('offers Paste list and switches to raw mode, without zero counters', () => {
    const hook = mockHook();
    render(<IntakePanel />);
    expect(screen.getByText('No intake rows yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Paste list' }));
    expect(hook.switchMode).toHaveBeenCalledWith('raw');
    expect(screen.queryByText(/unresolved ·/)).not.toBeInTheDocument();
  });

  it('hides the zero counters in raw mode too when there are no rows', () => {
    mockHook({ mode: 'raw' });
    render(<IntakePanel />);
    expect(screen.queryByText(/unresolved ·/)).not.toBeInTheDocument();
  });

  it('shows counters with rows and does not show the empty state', () => {
    mockHook({ editableRows: [row()], unresolvedCount: 1 });
    render(<IntakePanel />);
    expect(screen.queryByText('No intake rows yet')).not.toBeInTheDocument();
    expect(screen.getByText(/1 unresolved ·/)).toBeInTheDocument();
  });

  it('shows the error instead of the empty state when empty data has failed', () => {
    mockHook({ errorMessage: 'Intake failed' });
    render(<IntakePanel />);
    expect(screen.getByText('Intake failed').closest('[data-slot="alert-root"]')).toHaveClass('alert--danger');
    expect(screen.queryByText('No intake rows yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/unresolved ·/)).not.toBeInTheDocument();
  });
});
