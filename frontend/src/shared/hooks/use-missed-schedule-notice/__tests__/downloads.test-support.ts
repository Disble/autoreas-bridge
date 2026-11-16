import { vi } from 'vitest';
import type { DownloadsSource, ScheduleConfig } from '../../../contracts/download.types';
import type { ModuleReadiness } from '../../../contracts/readiness.types';
import { BRIDGE_INVALIDATIONS } from '../../../query/bridge-runtime/bridge-runtime.constants';
import { connectInvalidationBridge } from '../../../query/invalidation-bridge/invalidation-bridge.helpers';
import { createReadinessGate } from '../../../query/readiness-gate/readiness-gate.helpers';
import { createBridgeQueryTestWrapper } from '../../../query/test-support/bridge-query.test-support';
import { staticSource, status } from '../../../query/test-support/readiness-source.test-support';

/** A schedule snapshot with no missed day pending; cases spread over it. */
export const DOWNLOADS_SCHEDULE_FIXTURE: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 1_700_000_000_000,
  lastRunStatus: 'ok',
  nextRunAtMs: 1_700_086_400_000,
  running: false,
  enabledWeekdays: 127,
  missedNotice: undefined,
};

/**
 * A downloads port whose every call is a `vi.fn`: reads answer stable fixtures,
 * commands resolve, and a case overrides what it spells out.
 * @param overrides The calls a case replaces.
 * @returns The port.
 */
export function createDownloadsSourceFake(overrides: Partial<DownloadsSource> = {}): DownloadsSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
    setJDConfig: vi.fn().mockResolvedValue(undefined),
    getScheduleConfig: vi.fn().mockResolvedValue(DOWNLOADS_SCHEDULE_FIXTURE),
    setScheduleConfig: vi.fn().mockResolvedValue(undefined),
    setHosterPriority: vi.fn().mockResolvedValue(undefined),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue(undefined),
    triggerDownloadCheck: vi.fn().mockResolvedValue(undefined),
    triggerAnimeDownload: vi.fn().mockResolvedValue(undefined),
    cancelDownloadRun: vi.fn().mockResolvedValue(undefined),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn().mockResolvedValue([]),
    listDownloadReadiness: vi.fn(),
    ...overrides,
  };
}

/**
 * A query wrapper whose downloads module is in `downloads` (ready by default),
 * connected to the app's real invalidation rules through a fake event source.
 * @param downloads The downloads module's readiness.
 * @returns The wrapper, its client, `emitEvent` (fires one backend event) and `emitReadiness`.
 */
export function createDownloadsWrapper(downloads: ModuleReadiness = status('downloads', 'ready')) {
  const readiness = staticSource(downloads);
  const { client, wrapper } = createBridgeQueryTestWrapper({ readinessGate: createReadinessGate(readiness.source) });
  const listeners = new Map<string, () => void>();
  connectInvalidationBridge(client, BRIDGE_INVALIDATIONS, {
    subscribe: (eventName, listener) => {
      listeners.set(eventName, listener);
      return () => listeners.delete(eventName);
    },
  });

  return { client, wrapper, emitEvent: (eventName: string) => listeners.get(eventName)?.(), emitReadiness: readiness.emit };
}

/**
 * A promise plus its resolver, so a case can hold a binding in flight and settle it on purpose.
 * @returns The promise and its resolve function.
 */
export function createDeferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });

  return { promise, resolve: resolvePromise };
}
