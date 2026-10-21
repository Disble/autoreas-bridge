import { toast } from '@heroui/react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityRunStory as ActivityRunStoryData } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
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

vi.mock('../../../activity-source/activity-source.helpers', () => ({
  createActivitySource: () => source,
}));

describe('ActivityRunStory', () => {
  beforeEach(() => {
    getRunStory.mockReset();
  });

  it('shows only the loading region while the story is unresolved', () => {
    getRunStory.mockReturnValue(new Promise(() => undefined));
    render(<ActivityRunStory correlationId="dl-7" />);

    expect(screen.getByRole('status', { name: 'Loading the run story' })).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows only the failure, and reads again on "Try again"', async () => {
    getRunStory.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(STORY);
    render(<ActivityRunStory correlationId="dl-7" />);

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByText('The run story could not be read')).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: 'Loading the run story' })).toBeNull();
    expect(screen.queryByRole('list', { name: 'Steps' })).toBeNull();

    fireEvent.click(retry);

    expect(await screen.findByRole('list', { name: 'Steps' })).toBeInTheDocument();
    expect(getRunStory).toHaveBeenCalledTimes(2);
  });

  it('tells the run in order and opens on the warning with its probes drawn as a sequence', async () => {
    getRunStory.mockResolvedValueOnce({ ...STORY, truncated: true });
    const { rerender } = render(<ActivityRunStory correlationId="dl-7" />);

    const steps = within(await screen.findByRole('list', { name: 'Steps' })).getAllByRole('button');
    expect(steps.map((button) => button.textContent)).toEqual([
      expect.stringContaining('Download started'),
      expect.stringContaining('Hoster retried'),
      expect.stringContaining('Episode 11 saved'),
    ]);
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Recovered')).toBeInTheDocument();
    expect(getRunStory).toHaveBeenCalledExactlyOnceWith('dl-7');
    expect(within(screen.getByRole('list', { name: 'probes' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '1hoster: mega · ok: false',
      '2hoster: pixel · ok: true',
    ]);
    expect(screen.getByText('Started by: Download started')).toBeInTheDocument();
    expect(screen.getByText('Showing the first 3 steps of a longer run.')).toBeInTheDocument();

    // A run with no recorded steps: no domain, trigger, truncation note or step detail to show.
    getRunStory.mockResolvedValueOnce({ correlationId: 'dl-8', steps: [], truncated: false });
    rerender(<ActivityRunStory correlationId="dl-8" />);

    await screen.findByText('Run dl-8');
    expect(within(screen.getByRole('list', { name: 'Steps' })).queryAllByRole('button')).toEqual([]);
    expect(screen.queryByText(/Started by/)).toBeNull();
    expect(screen.queryByText(/longer run/)).toBeNull();
    expect(screen.queryByText('download')).toBeNull();
    expect(screen.queryByRole('list', { name: 'probes' })).toBeNull();
  });

  it('switches the recorded detail with the step and opens the raw metadata on demand', async () => {
    getRunStory.mockResolvedValue(STORY);
    render(<ActivityRunStory correlationId="dl-7" />);

    fireEvent.click(await screen.findByRole('button', { name: /Download started/ }));
    expect(screen.getByText('episode')).toBeInTheDocument();
    expect(screen.queryByText('Raw metadata')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show raw metadata' }));
    expect(screen.getByText('Raw metadata')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Episode 11 saved/ }));
    expect(screen.getByText('Nothing was recorded with this step.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show raw metadata' })).toBeNull();
  });

  it('copies an MCP-ready get_run_story reference for AI', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    getRunStory.mockResolvedValue(STORY);
    render(<ActivityRunStory correlationId="dl-7" />);

    const copyButton = await screen.findByRole('button', { name: 'Copy this run for AI' });
    await act(async () => fireEvent.click(copyButton));

    expect(writeText).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('get_run_story with {"correlation_id":"dl-7"}'));
    expect(success).toHaveBeenCalledTimes(1);
  });
});
