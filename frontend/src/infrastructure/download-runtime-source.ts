import {
  GetDownloadConfig,
  GetJDStatus,
  GetScheduleConfig,
  ListDownloadRuns,
  SetHosterPriority,
  SetJDConfig,
  SetScheduleConfig,
  TriggerDownloadCheck,
} from '../../wailsjs/go/main/App';
import { EventsOn } from '../../wailsjs/runtime/runtime';
import type {
  DownloadConfig,
  DownloadRunView,
  HosterPriorityItem,
  JDConfigInput,
  JDStatus,
  ScheduleConfig,
} from '../shared/contracts/download.types';

/** Poll interval (ms) while waiting for the Wails runtime to become ready. */
export const DOWNLOAD_BINDINGS_POLL_MS = 50;
/** Maximum time (ms) to wait for the Wails runtime before degrading to a safe default. */
export const DOWNLOAD_BINDINGS_TIMEOUT_MS = 5000;
const DOWNLOAD_RUN_EVENT_NAMES = ['download.run_started', 'download.run_progress', 'download.run_finished'] as const;

const EMPTY_JD_STATUS: JDStatus = {
  email: '',
  hasPassword: false,
  deviceName: '',
  exePathOverride: '',
  defaultDestDir: '',
  lastSeenStatus: 'unknown',
  lastSeenAtMs: 0,
};

const EMPTY_SCHEDULE_CONFIG: ScheduleConfig = {
  mode: 'manual',
  dailyTimeHHMM: '',
  enabled: false,
  lastRunAtMs: 0,
  lastRunStatus: '',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: 127,
};

const EMPTY_DOWNLOAD_CONFIG: DownloadConfig = {
  jd: EMPTY_JD_STATUS,
  schedule: EMPTY_SCHEDULE_CONFIG,
  hosterPriority: [],
};

let sharedSource: DownloadRuntimeSource | null = null;

/**
 * DownloadRuntimeSource is the request/reply port for every download
 * settings/history Wails binding. Run-history freshness comes from the
 * backend's run lifecycle events, with each event causing a safe re-fetch
 * through `listDownloadRuns`.
 */
export interface DownloadRuntimeSource {
  readonly getDownloadConfig: () => Promise<DownloadConfig>;
  readonly getJDStatus: () => Promise<JDStatus>;
  readonly setJDConfig: (input: JDConfigInput) => Promise<string>;
  readonly getScheduleConfig: () => Promise<ScheduleConfig>;
  readonly setScheduleConfig: (config: ScheduleConfig) => Promise<string>;
  readonly setHosterPriority: (site: string, items: readonly HosterPriorityItem[]) => Promise<string>;
  readonly triggerDownloadCheck: () => Promise<string>;
  readonly listDownloadRuns: () => Promise<readonly DownloadRunView[]>;
  readonly subscribeRunEvents: (listener: () => void) => () => void;
}

function hasGoBinding(name: string): boolean {
  const app = window.go?.main?.App;
  return typeof app === 'object' && app !== null && typeof (app as Record<string, unknown>)[name] === 'function';
}

function waitForBindings(isReady: () => boolean): Promise<boolean> {
  if (isReady()) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    const intervalId = window.setInterval(() => {
      const isTimedOut = Date.now() - startedAt >= DOWNLOAD_BINDINGS_TIMEOUT_MS;

      if (isReady()) {
        window.clearInterval(intervalId);
        resolve(true);
        return;
      }

      if (isTimedOut) {
        window.clearInterval(intervalId);
        resolve(false);
      }
    }, DOWNLOAD_BINDINGS_POLL_MS);
  });
}

function hasRuntimeBindings(): boolean {
  return Boolean(window.runtime);
}

/**
 * createDownloadRuntimeSource returns the singleton runtime-backed download
 * source. Degrades to safe empty defaults when the Wails runtime is
 * unavailable (plain browser / Vite dev).
 */
export function createDownloadRuntimeSource(): DownloadRuntimeSource {
  if (sharedSource !== null) {
    return sharedSource;
  }

  const runListeners = new Set<() => void>();
  let runtimeUnsubscribes: readonly (() => void)[] = [];

  const handleRunEvent = () => {
    for (const listener of runListeners) {
      listener();
    }
  };

  const releaseRunRuntimeListeners = () => {
    if (runtimeUnsubscribes.length === 0) {
      return;
    }

    const unsubscribes = runtimeUnsubscribes;
    runtimeUnsubscribes = [];
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  };

  const ensureRunRuntimeListeners = () => {
    void waitForBindings(hasRuntimeBindings).then((isReady) => {
      if (!isReady || runtimeUnsubscribes.length > 0 || runListeners.size === 0) {
        return;
      }

      runtimeUnsubscribes = DOWNLOAD_RUN_EVENT_NAMES.map((eventName) => EventsOn(eventName, handleRunEvent));
    });
  };

  sharedSource = {
    getDownloadConfig() {
      return waitForBindings(() => hasGoBinding('GetDownloadConfig')).then((isReady) => {
        return isReady ? (GetDownloadConfig() as Promise<DownloadConfig>) : Promise.resolve(EMPTY_DOWNLOAD_CONFIG);
      });
    },
    getJDStatus() {
      return waitForBindings(() => hasGoBinding('GetJDStatus')).then((isReady) => {
        return isReady ? (GetJDStatus() as Promise<JDStatus>) : Promise.resolve(EMPTY_JD_STATUS);
      });
    },
    setJDConfig(input) {
      return waitForBindings(() => hasGoBinding('SetJDConfig')).then((isReady) => {
        return isReady ? SetJDConfig(input) : Promise.resolve('runtime unavailable');
      });
    },
    getScheduleConfig() {
      return waitForBindings(() => hasGoBinding('GetScheduleConfig')).then((isReady) => {
        return isReady ? (GetScheduleConfig() as Promise<ScheduleConfig>) : Promise.resolve(EMPTY_SCHEDULE_CONFIG);
      });
    },
    setScheduleConfig(config) {
      return waitForBindings(() => hasGoBinding('SetScheduleConfig')).then((isReady) => {
        return isReady ? SetScheduleConfig(config) : Promise.resolve('runtime unavailable');
      });
    },
    setHosterPriority(site, items) {
      return waitForBindings(() => hasGoBinding('SetHosterPriority')).then((isReady) => {
        return isReady ? SetHosterPriority(site, [...items]) : Promise.resolve('runtime unavailable');
      });
    },
    triggerDownloadCheck() {
      return waitForBindings(() => hasGoBinding('TriggerDownloadCheck')).then((isReady) => {
        return isReady ? TriggerDownloadCheck() : Promise.resolve('runtime unavailable');
      });
    },
    listDownloadRuns() {
      return waitForBindings(() => hasGoBinding('ListDownloadRuns')).then((isReady) => {
        return isReady ? (ListDownloadRuns() as Promise<readonly DownloadRunView[]>) : Promise.resolve([]);
      });
    },
    subscribeRunEvents(listener) {
      runListeners.add(listener);
      ensureRunRuntimeListeners();

      let subscribed = true;

      return () => {
        if (!subscribed) {
          return;
        }

        subscribed = false;
        runListeners.delete(listener);

        if (runListeners.size === 0) {
          releaseRunRuntimeListeners();
        }
      };
    },
  };

  return sharedSource;
}

/**
 * downloadRuntimeSource exposes the shared runtime-backed download source to
 * every download feature hook.
 */
export const downloadRuntimeSource = createDownloadRuntimeSource();
