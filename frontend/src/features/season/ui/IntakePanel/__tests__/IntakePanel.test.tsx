import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SeasonAnimeRow } from '../../../../../infrastructure/season-source';
import { IntakePanel } from '../IntakePanel';
import { useIntakePanel } from '../use-intake-panel';

vi.mock('../use-intake-panel', () => ({
  useIntakePanel: vi.fn(),
}));

const mockedUseIntakePanel = vi.mocked(useIntakePanel);
type HookReturn = ReturnType<typeof useIntakePanel>;

function row(overrides: Partial<SeasonAnimeRow> = {}): SeasonAnimeRow {
  return {
    id: 'sa-1',
    rawName: 'Dr. Stone',
    matchStatus: 'pending',
    matchedSlug: '',
    candidates: [],
    availability: 'waiting',
    animeId: '',
    ...overrides,
  };
}

function mockHook(overrides: Partial<HookReturn> = {}): HookReturn {
  const value: HookReturn = {
    rows: [],
    unresolvedCount: 0,
    errorMessage: undefined,
    onImport: vi.fn(),
    onRunMatching: vi.fn(),
    onResolve: vi.fn(),
    onDiscard: vi.fn(),
    ...overrides,
  };
  mockedUseIntakePanel.mockReturnValue(value);
  return value;
}

describe('IntakePanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the empty state when there are no rows', () => {
    mockHook();
    render(<IntakePanel />);
    expect(screen.getByText('Paste the season intake list to begin.')).toBeInTheDocument();
  });

  it('renders a row with its status chip', () => {
    mockHook({ rows: [row({ matchStatus: 'ambiguous' })], unresolvedCount: 1 });
    render(<IntakePanel />);
    expect(screen.getByText('Dr. Stone')).toBeInTheDocument();
    expect(screen.getByText('Ambiguous')).toBeInTheDocument();
    expect(screen.getByText('1 unresolved')).toBeInTheDocument();
  });

  it('resolves via a candidate button', () => {
    const onResolve = vi.fn();
    mockHook({
      rows: [
        row({
          matchStatus: 'ambiguous',
          candidates: [{ title: 'Dr. Stone: Science Future Part 3', pageUrl: 'https://jkanime.net/dr-stone-science-future-part-3/', score: 0.98 }],
        }),
      ],
      onResolve,
    });
    render(<IntakePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Dr. Stone: Science Future Part 3 (98%)' }));
    expect(onResolve).toHaveBeenCalledWith('sa-1', 'https://jkanime.net/dr-stone-science-future-part-3/');
  });

  it('discards a row', () => {
    const onDiscard = vi.fn();
    mockHook({ rows: [row()], onDiscard });
    render(<IntakePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Discard Dr. Stone' }));
    expect(onDiscard).toHaveBeenCalledWith('sa-1');
  });

  it('runs matching', () => {
    const onRunMatching = vi.fn();
    mockHook({ rows: [row()], onRunMatching });
    render(<IntakePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Run matching' }));
    expect(onRunMatching).toHaveBeenCalled();
  });

  it('surfaces an error message', () => {
    mockHook({ errorMessage: 'no active season' });
    render(<IntakePanel />);
    expect(screen.getByText('no active season')).toBeInTheDocument();
  });
});
