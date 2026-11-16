import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRunStory as ActivityRunStoryData } from '../../../../../shared/contracts/activity-incident.types';
import type { ActivitySource } from '../../../../../shared/contracts/activity.types';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { ActivityRunStory } from '../ActivityRunStory';

/** The story every resolved case reads: a start, a retried probe, and the save. */
const STORY: ActivityRunStoryData = {
  correlationId: 'dl-7',
  truncated: false,
  steps: [
    { id: 1, atMs: 0, domain: 'download', level: 'info', eventType: 'download.started', message: 'Download started', correlationId: 'dl-7', durationMs: undefined, metadataJson: '{"episode":11}' },
    {
      id: 2,
      atMs: 1_000,
      domain: 'download',
      level: 'warn',
      eventType: 'download.hoster_retry',
      message: 'Hoster retried',
      correlationId: 'dl-7',
      durationMs: 1_500,
      metadataJson: '{"probes":[{"hoster":"mega","ok":false},{"hoster":"pixel","ok":true}]}',
    },
    { id: 3, atMs: 4_000, domain: 'download', level: 'info', eventType: 'download.completed', message: 'Episode 11 saved', correlationId: 'dl-7', durationMs: undefined, metadataJson: '' },
  ],
};

/** The run story read the mocked source answers with. */
const getRunStory = vi.fn<ActivitySource['getRunStory']>();

/** The one source instance the screen reads, as the real singleton is. */
const source = { getRunStory } as unknown as ActivitySource;

vi.mock('../../../../../shared/query/bridge-runtime/bridge-runtime.constants', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  /** The run story's default Activity port. */
  get BRIDGE_ACTIVITY_SOURCE() {
    return source;
  },
}));

describe('ActivityRunStory', () => {
  beforeEach(() => {
    getRunStory.mockReset();
  });

  it('shows only the loading region while the story is unresolved', () => {
    getRunStory.mockReturnValue(new Promise(() => undefined));
    render(<ActivityRunStory correlationId="dl-7" />, { wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper });

    expect(screen.getByRole('status', { name: 'Loading the run story' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows only the failure, and reads again on "Try again"', async () => {
    getRunStory.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(STORY);
    render(<ActivityRunStory correlationId="dl-7" />, { wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper });

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('The run story could not be read')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading the run story' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();

    fireEvent.click(retry);

    expect(await screen.findByRole('list', { name: 'Steps' })).toBeInTheDocument();
    expect(getRunStory).toHaveBeenCalledTimes(2);
  });

  it('draws the run as a timeline: time, a dot in its tone, the step and its sub-line, in order', async () => {
    getRunStory.mockResolvedValueOnce({ ...STORY, truncated: true });
    const { rerender } = render(<ActivityRunStory correlationId="dl-7" />, { wrapper: createModulesTestWrapper({ module: 'observability', state: 'ready' }).wrapper });

    const rows = within(await screen.findByRole('list', { name: 'Steps' })).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringMatching(/Download starteddownload started$/),
      expect.stringMatching(/Hoster retrieddownload hoster retry · 1\.5 s$/),
      expect.stringMatching(/Episode 11 saveddownload completed$/),
    ]);
    expect(rows.map((row) => row.querySelector('[data-step-tone]')?.getAttribute('data-step-tone'))).toEqual(['default', 'warning', 'success']);
    expect(within(rows[0]).queryByRole('button')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(getRunStory).toHaveBeenCalledExactlyOnceWith('dl-7');
    expect(screen.getByText('Showing the first 3 steps of a longer run.')).toBeInTheDocument();

    // A run with no recorded steps: an empty timeline and no truncation note.
    getRunStory.mockResolvedValueOnce({ correlationId: 'dl-8', steps: [], truncated: false });
    rerender(<ActivityRunStory correlationId="dl-8" />);

    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Steps' })).queryAllByRole('listitem')).toEqual([]));
    expect(screen.queryByText(/longer run/)).toBeNull();
  });
});
