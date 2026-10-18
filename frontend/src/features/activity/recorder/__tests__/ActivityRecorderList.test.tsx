import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActivityRecorderList } from '../ActivityRecorderList';
import type { ActivityRecorderLineModel } from '../activity-recorder.types';

/** The cap note the list shows once it holds the newest 500 rows. */
const CAP_NOTE = 'The recorder keeps the newest 500 rows. Older activity is in History.';

/** A line with only the fields a case names. */
function line(key: string, overrides: Partial<ActivityRecorderLineModel> = {}): ActivityRecorderLineModel {
  return { key, time: '10:00', title: `title ${key}`, detail: '', statusLabel: '', statusColor: 'default', ...overrides };
}

/** Renders the list over `lines`, at the cap or not. */
function renderList(lines: readonly ActivityRecorderLineModel[], isAtCap: boolean) {
  render(<ActivityRecorderList isAtCap={isAtCap} isLoadingMore={false} lines={lines} onScroll={() => undefined} />);
}

describe('ActivityRecorderList', () => {
  it('shows the detail and the status chip only for a line that has them', () => {
    renderList([line('bare'), line('full', { detail: 'Pixel · 12 ms', statusLabel: '503', statusColor: 'danger' })], false);

    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent(/^10:00title bare$/);
    expect(rows[1]).toHaveTextContent('Pixel · 12 ms');
    expect(rows[1]).toHaveTextContent('503');
  });

  it('points older rows to History only at the cap', () => {
    renderList([line('a')], true);
    expect(screen.getByText(CAP_NOTE)).toBeInTheDocument();
  });

  it('shows no cap note below the cap', () => {
    renderList([line('a')], false);
    expect(screen.queryByText(CAP_NOTE)).not.toBeInTheDocument();
  });
});
