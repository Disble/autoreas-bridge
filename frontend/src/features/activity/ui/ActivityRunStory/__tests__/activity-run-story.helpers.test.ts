import { describe, expect, it, vi } from 'vitest';
import type { ActivityRunStep, ActivityRunStory } from '../../../activity-source/activity-incident.types';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import {
  describeActivityRunOutcome,
  pickActivityRunStepId,
  readActivityRunStory,
  toActivityRunCopyText,
  toActivityRunMetadata,
  toActivityRunStoryModel,
  toActivitySelectedStepId,
  toggleActivityRawOpen,
} from '../activity-run-story.helpers';

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
  it.each([
    ['error', { label: 'Failed', color: 'danger' }],
    ['warn', { label: 'Recovered', color: 'warning' }],
    ['info', { label: 'Finished', color: 'success' }],
    ['debug', { label: 'Finished', color: 'success' }],
  ])('words a %s run outcome', (level, expected) => {
    expect(describeActivityRunOutcome(level)).toEqual(expected);
  });

  it('words the header and every step of a run, in order', () => {
    const model = toActivityRunStoryModel(
      story([
        step({ id: 1, atMs: at(17, 0, 0, 5), message: 'Download started' }),
        step({ id: 2, atMs: at(17, 0, 1), level: 'warn', eventType: 'download.hoster_retry', message: '', durationMs: 1_500 }),
        step({ id: 3, atMs: at(17, 0, 4), eventType: 'download.completed', message: 'Episode 11 saved', durationMs: 41 }),
      ]),
    );

    expect(model).toEqual({
      title: 'Download started',
      domain: 'download',
      outcome: { label: 'Recovered', color: 'warning' },
      trigger: 'Download started',
      span: 'Oct 17, 17:00 · took 4.0 s',
      steps: [
        { id: 1, time: '17:00:00.005', title: 'Download started', detail: 'download started', tone: 'default' },
        { id: 2, time: '17:00:01.000', title: 'download hoster retry', detail: 'download hoster retry · 1.5 s', tone: 'warning' },
        { id: 3, time: '17:00:04.000', title: 'Episode 11 saved', detail: 'download completed · 41 ms', tone: 'success' },
      ],
      truncatedNote: '',
      copyText: toActivityRunCopyText('c-1', 'Download started'),
    });
  });

  it('takes the worst level of any step as the outcome and marks errors danger', () => {
    const model = toActivityRunStoryModel(story([step({ id: 1, level: 'warn' }), step({ id: 2, level: 'error', eventType: 'download.failed' }), step({ id: 3 })]));
    const single = toActivityRunStoryModel(story([step({ id: 1, level: 'error', atMs: at(17, 0) })]));

    expect(model.outcome).toEqual({ label: 'Failed', color: 'danger' });
    expect(model.steps.map((item) => item.tone)).toEqual(['warning', 'danger', 'default']);
    expect(toActivityRunStoryModel(story([step({ level: 'debug' }), step({ level: 'trace' })])).outcome).toEqual({ label: 'Finished', color: 'success' });
    expect(single.outcome).toEqual({ label: 'Failed', color: 'danger' });
    expect(single.span).toBe('Oct 17, 17:00 · took 0 ms');
    expect(toActivityRunStoryModel(story([step({ id: 1, atMs: at(17, 0) }), step({ id: 2, atMs: at(17, 0, 2) })])).span).toBe('Oct 17, 17:00 · took 2.0 s');
  });

  it('notes a capped story', () => {
    expect(toActivityRunStoryModel(story([step({})], true)).truncatedNote).toBe('Showing the first 1 steps of a longer run.');
  });

  it('words an empty story without inventing steps', () => {
    const model = toActivityRunStoryModel(story([]));

    expect(model.steps).toEqual([]);
    expect(model.title).toBe('Run c-1');
    expect(model.domain).toBe('');
    expect(model.trigger).toBe('');
    expect(model.span).toBe('');
    expect(model.outcome).toEqual({ label: 'Finished', color: 'success' });
  });

  it('picks the first error, else the first warning, else the first step', () => {
    expect(pickActivityRunStepId([step({ id: 1 }), step({ id: 2, level: 'warn' }), step({ id: 3, level: 'error' }), step({ id: 4, level: 'error' })])).toBe(3);
    expect(pickActivityRunStepId([step({ id: 1 }), step({ id: 2, level: 'warn' }), step({ id: 5, level: 'warn' })])).toBe(2);
    expect(pickActivityRunStepId([step({ id: 7 }), step({ id: 8 })])).toBe(7);
    expect(pickActivityRunStepId([])).toBeUndefined();
  });

  it('lays recorded metadata out as labelled fields, arrays of objects as a sequence', () => {
    const metadata = toActivityRunMetadata(
      '{"hoster":"mega","attempt":2,"dead":false,"note":null,"tags":["a","b"],"probes":[{"hoster":"mega","ok":false},{"hoster":"pixel","ok":true}],"extra":{"k":1}}',
    );
    const lists = toActivityRunMetadata('{"none":[],"mixed":[{"k":1},"x"]}');

    expect(metadata.fields).toEqual([
      { kind: 'value', label: 'hoster', value: 'mega' },
      { kind: 'value', label: 'attempt', value: '2' },
      { kind: 'value', label: 'dead', value: 'false' },
      { kind: 'value', label: 'note', value: '—' },
      { kind: 'value', label: 'tags', value: 'a, b' },
      { kind: 'sequence', label: 'probes', items: ['hoster: mega · ok: false', 'hoster: pixel · ok: true'] },
      { kind: 'value', label: 'extra', value: '{"k":1}' },
    ]);
    expect(lists.fields).toEqual([
      { kind: 'value', label: 'none', value: '' },
      { kind: 'value', label: 'mixed', value: '{"k":1}, x' },
    ]);
    expect(metadata.raw).toBe(JSON.stringify(JSON.parse('{"hoster":"mega","attempt":2,"dead":false,"note":null,"tags":["a","b"],"probes":[{"hoster":"mega","ok":false},{"hoster":"pixel","ok":true}],"extra":{"k":1}}'), null, 2));
  });

  it('keeps unreadable or non-object metadata raw, and nothing recorded as empty', () => {
    expect(toActivityRunMetadata('')).toEqual({ fields: [], raw: '' });
    expect(toActivityRunMetadata('{not json')).toEqual({ fields: [], raw: '{not json' });
    expect(toActivityRunMetadata('[1,2]')).toEqual({ fields: [], raw: '[\n  1,\n  2\n]' });
    expect(toActivityRunMetadata('null')).toEqual({ fields: [], raw: 'null' });
  });

  it('copies an MCP-ready reference naming the run_story tool and the correlation id', () => {
    expect(toActivityRunCopyText('dl-7', 'Download started')).toBe(
      'Use the autoreas-request-mcp tool get_run_story with {"correlation_id":"dl-7"}.\nRun: Download started.',
    );
  });
});

describe('activity step selection helpers', () => {
  it('keeps a chosen step only for the run it was chosen in, else opens the default step', () => {
    const steps = [step({ id: 1 }), step({ id: 2, level: 'error' })];
    expect(toActivitySelectedStepId({ correlationId: 'c-1', stepId: 1 }, 'c-1', steps)).toBe(1);
    expect(toActivitySelectedStepId({ correlationId: 'c-0', stepId: 1 }, 'c-1', steps)).toBe(2);
    expect(toActivitySelectedStepId(undefined, 'c-1', steps)).toBe(2);
    expect(toActivitySelectedStepId(undefined, 'c-1', [])).toBeUndefined();
  });

  it('opens the raw metadata of the selected step, and closes it when it is already open', () => {
    expect(toggleActivityRawOpen(undefined, 3)).toBe(3);
    expect(toggleActivityRawOpen(2, 3)).toBe(3);
    expect(toggleActivityRawOpen(3, 3)).toBeUndefined();
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
