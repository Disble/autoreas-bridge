import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { NotificationDetailMeta } from '../NotificationDetailMeta';

afterEach(cleanup);

describe('NotificationDetailMeta', () => {
  it('renders each entry as a label and its value, exactly as the artboard foots the pane', () => {
    render(
      <NotificationDetailMeta
        entries={[
          { label: 'Kind', value: 'download.run_stopped_early' },
          { label: 'Correlation ID', value: 'run-8f21c4' },
        ]}
      />,
    );

    expect(screen.getByText('Kind')).toBeInTheDocument();
    expect(screen.getByText('download.run_stopped_early')).toBeInTheDocument();
    expect(screen.getByText('Correlation ID')).toBeInTheDocument();
    expect(screen.getByText('run-8f21c4')).toBeInTheDocument();
  });

  // Presence of the block itself, not just of text: an empty <dl> would satisfy
  // a text-absence assertion too, and an empty labelled area is exactly the
  // wrong fix here.
  it('renders no metadata block at all when the record identifies itself by nothing', () => {
    render(<NotificationDetailMeta entries={[]} />);

    expect(screen.queryByTestId('notification-detail-meta')).not.toBeInTheDocument();
  });

  it('renders the block once at least one entry survives', () => {
    render(<NotificationDetailMeta entries={[{ label: 'Correlation ID', value: 'run-8f21c4' }]} />);

    expect(screen.getByTestId('notification-detail-meta')).toBeInTheDocument();
  });
});
