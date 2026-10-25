import { describe, expect, it, vi } from 'vitest';
import type { ActivityRunStep, ActivityRunStory } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { readActivityRunStory, toActivityRunStoryModel } from '../activity-run-story.helpers';

/** Local epoch milliseconds of Oct 17 at the given time. */
function at(hours: number, minutes: number, seconds = 0, ms = 0): number {
  return new Date(2026, 9, 17, hours, minutes, seconds, ms).getTime();
}

/** One run step with defaults. */
function step(overrides: Partial<ActivityRunStep>): ActivityRunStep {
  return {
    id: 1,
    atMs: at(17, 0),
    domain: 'download',
    level: 'info',
    eventType: 'download.started',
    message: 'Download started',
    correlationId: 'c-1',
    durationMs: undefined,
    metadataJson: '',
    ...overrides,
  };
}

/** A story of the given steps. */
function story(steps: readonly ActivityRunStep[], truncated = false): ActivityRunStory {
  return { correlationId: 'c-1', steps, truncated };
}

describe('activity-run-story.helpers', () => {
  it('words every step of a run, in order', () => {
    const model = toActivityRunStoryModel(
      story([
        step({ id: 1, atMs: at(17, 0, 0, 5), message: 'Download started' }),
        step({ id: 2, atMs: at(17, 0, 1), level: 'warn', eventType: 'download.hoster_retry', message: '', durationMs: 1_500 }),
        step({ id: 3, atMs: at(17, 0, 4), eventType: 'download.completed', message: 'Episode 11 saved', durationMs: 41 }),
      ]),
    );

    expect(model).toEqual({
      steps: [
        { id: 1, time: '17:00:00.005', title: 'Download started', detail: 'download started', tone: 'default' },
        { id: 2, time: '17:00:01.000', title: 'download hoster retry', detail: 'download hoster retry · 1.5 s', tone: 'warning' },
        { id: 3, time: '17:00:04.000', title: 'Episode 11 saved', detail: 'download completed · 41 ms', tone: 'success' },
      ],
      truncatedNote: '',
    });
  });

  it('marks errors danger and warnings warning', () => {
    const model = toActivityRunStoryModel(story([step({ id: 1, level: 'warn' }), step({ id: 2, level: 'error', eventType: 'download.failed' }), step({ id: 3 })]));

    expect(model.steps.map((item) => item.tone)).toEqual(['warning', 'danger', 'default']);
  });

  it('notes a capped story', () => {
    expect(toActivityRunStoryModel(story([step({})], true)).truncatedNote).toBe('Showing the first 1 steps of a longer run.');
  });

  it('words an empty story without inventing steps', () => {
    expect(toActivityRunStoryModel(story([]))).toEqual({ steps: [], truncatedNote: '' });
  });
});

describe('readActivityRunStory', () => {
  it('reads the story of one run as ready', async () => {
    const found = story([step({})]);
    const getRunStory = vi.fn(() => Promise.resolve(found));
    await expect(readActivityRunStory({ getRunStory } as unknown as ActivitySource, 'c-1')).resolves.toEqual({ status: 'ready', value: found });
    expect(getRunStory).toHaveBeenCalledExactlyOnceWith('c-1');
  });
});
