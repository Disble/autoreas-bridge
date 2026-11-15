import { describe, expect, it, vi } from 'vitest';

import type { ActivityFeedSource, ActivitySource } from '../../../shared/contracts/activity.types';
import { useIsolatedWailsRuntime } from '../../__tests__/bridge-runtime-source.test-support';

/** Both Activity sources, as the bridge runtime builds them. */
interface ActivitySources {
  readonly activity: ActivitySource;
  readonly feed: ActivityFeedSource;
}

/** Every Activity binding, as `window.go.desktop.App` exposes it, mapped to its source call. */
const CALLS: ReadonlyArray<readonly [binding: string, call: (sources: ActivitySources) => Promise<unknown>]> = [
  ['PinActivityMoment', ({ activity }) => activity.pinMoment()],
  ['GetActivityIncident', ({ activity }) => activity.getIncident(1)],
  ['GetActivityRequest', ({ activity }) => activity.getRequest('req-1')],
  ['GetActivityRunStory', ({ activity }) => activity.getRunStory('run-1')],
  ['SearchActivityFeed', ({ feed }) => feed.searchFeed({ fromMs: 0, toMs: 0, origin: 'all', types: [], failuresOnly: false, cursor: '', limit: 40 })],
  ['GetActivityOverview', ({ feed }) => feed.getOverview('24h', 0, 0, 'all', [], false)],
  ['GetActivityEvent', ({ feed }) => feed.getEvent(1)],
  ['GetActivityChangeContext', ({ feed }) => feed.getChangeContext(1, 2)],
  ['GetActivityPhoneReport', ({ feed }) => feed.getPhoneReport(1)],
];

/** Attaches Activity bindings to a fake Wails `window.go`. */
function attachBindings(bindings: Readonly<Record<string, unknown>>) {
  window.go = { desktop: { App: bindings } } as never;
}

/**
 * Imports both adapters fresh, after the runtime was isolated.
 * @returns The two sources.
 */
async function importSources(): Promise<ActivitySources> {
  const { createActivityWailsSource } = await import('../activity-source.helpers');
  const { createActivityFeedSource } = await import('../activity-feed-source.helpers');

  return { activity: createActivityWailsSource(), feed: createActivityFeedSource() };
}

describe('createActivityWailsSource', () => {
  useIsolatedWailsRuntime();

  it('pins the moment through PinActivityMoment and passes its failure on as a BridgeError', async () => {
    const pin = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('disk full'));
    attachBindings({ PinActivityMoment: pin });
    const { activity } = await importSources();

    await expect(activity.pinMoment()).resolves.toBeUndefined();
    await expect(activity.pinMoment()).rejects.toMatchObject({ name: 'BridgeError', code: 'internal', message: 'disk full' });
    expect(pin).toHaveBeenCalledTimes(2);
  });

  it('reads one incident and one request by id, a missing one as undefined', async () => {
    const getIncident = vi.fn().mockResolvedValue({ found: false, detail: {} });
    const getRequest = vi.fn().mockResolvedValue({ found: false, detail: {} });
    attachBindings({ GetActivityIncident: getIncident, GetActivityRequest: getRequest });
    const { activity } = await importSources();

    await expect(activity.getIncident(42)).resolves.toBeUndefined();
    await expect(activity.getRequest('req-9')).resolves.toBeUndefined();
    expect(getIncident).toHaveBeenCalledExactlyOnceWith(42);
    expect(getRequest).toHaveBeenCalledExactlyOnceWith('req-9');
  });

  it('reads a run story through its binding', async () => {
    const getStory = vi.fn().mockResolvedValue({ CorrelationID: 'c-1', Steps: null, Truncated: false });
    attachBindings({ GetActivityRunStory: getStory });
    const { activity } = await importSources();

    await expect(activity.getRunStory('c-1')).resolves.toEqual({ correlationId: 'c-1', steps: [], truncated: false });
    expect(getStory).toHaveBeenCalledExactlyOnceWith('c-1');
  });

  it.each([
    ['the module is starting', '{"code":"unavailable","message":"observability is starting"}', { code: 'unavailable', message: 'observability is starting' }],
    ['the module failed', '{"code":"failed_precondition","message":"observability: db closed"}', { code: 'failed_precondition', message: 'observability: db closed' }],
    ['a plain rejection', 'boom', { code: 'internal', message: 'boom' }],
  ])('rejects every Activity call with a BridgeError when %s, never with a fallback', async (_label, rejection, expected) => {
    attachBindings(Object.fromEntries(CALLS.map(([binding]) => [binding, vi.fn().mockRejectedValue(new Error(rejection))])));
    const sources = await importSources();

    for (const [, call] of CALLS) {
      await expect(call(sources)).rejects.toMatchObject({ name: 'BridgeError', ...expected });
    }
  });

  it('rejects every Activity call as unavailable when the bindings never attach', async () => {
    const { WAILS_BINDINGS_TIMEOUT_MS } = await import('../../wails-bindings.helpers');
    const sources = await importSources();

    const rejections = CALLS.map(([, call]) =>
      expect(call(sources)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) }),
    );
    await vi.advanceTimersByTimeAsync(WAILS_BINDINGS_TIMEOUT_MS);

    await Promise.all(rejections);
  });
});
