import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { NotificationSource } from '../../../../../infrastructure/notification-source/notification-source.types';
import type { Notification } from '../../../../../shared/contracts/notification.types';
import type { ScheduleConfig } from '../../../../../shared/contracts/download.types';

/**
 * The two singleton ports `NotificationToasts` reaches through its resolvers'
 * default arguments. Hoisted so the `vi.mock` factories below -- which run
 * before the module body -- can close over them.
 */
const ports = vi.hoisted(() => {
  const notificationListeners = new Set<(notification: Notification) => void>();
  const archivedListeners = new Set<(recordIds: readonly number[]) => void>();
  return {
    notificationListeners,
    archivedListeners,
    getScheduleConfig: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    runMissedScheduleNow: vi.fn(),
  };
});

vi.mock('../../../../../infrastructure/notification-source/notification-source.helpers', () => {
  const source: NotificationSource = {
    subscribe(listener) {
      ports.notificationListeners.add(listener);
      return () => ports.notificationListeners.delete(listener);
    },
    subscribeArchived(listener) {
      ports.archivedListeners.add(listener);
      return () => ports.archivedListeners.delete(listener);
    },
  };
  return { notificationSource: source, createNotificationSource: () => source };
});

vi.mock('../../../../../infrastructure/download-runtime-source/download-runtime-source.helpers', () => {
  const source = {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn(),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
    setJDConfig: vi.fn(),
    getScheduleConfig: ports.getScheduleConfig,
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn(),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn(),
    runMissedScheduleNow: ports.runMissedScheduleNow,
    ignoreMissedSchedule: ports.ignoreMissedSchedule,
    listDownloadRuns: vi.fn().mockResolvedValue([]),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    subscribeMissedScheduleSettled: vi.fn().mockReturnValue(() => undefined),
  } satisfies DownloadRuntimeSource;
  return { downloadRuntimeSource: source, createDownloadRuntimeSource: () => source };
});

import { NotificationToasts } from '../NotificationToasts';
import { appToastQueue } from '../app-toast-queue';
import { resetDownloadRuntimeStore, getDownloadRuntimeStoreState } from '../../../../../shared/store/download-runtime-store/download-runtime-store.helpers';

/** The missed day both the backend record and the local notice are about. */
const MISSED_LOCAL_DATE = '2026-07-26';

/** Schedule snapshot with the missed day still unresolved. */
const SCHEDULE_WITH_MISSED_DAY: ScheduleConfig = {
  mode: 'in_process',
  dailyTimeHHMM: '03:30',
  enabled: true,
  lastRunAtMs: 0,
  lastRunStatus: '',
  nextRunAtMs: 0,
  running: false,
  enabledWeekdays: 127,
  missedNotice: { localDate: MISSED_LOCAL_DATE, dueAtMs: 1_721_000_000_000 },
};

/** The same schedule once the missed day has been settled. */
const SCHEDULE_SETTLED: ScheduleConfig = { ...SCHEDULE_WITH_MISSED_DAY, missedNotice: undefined };

/**
 * The record the Go producer raises at startup for the same missed day
 * (`app_missed_schedule_notification.go`). Its `Kind` is written as a literal:
 * it is a persisted string and a wire contract, so reading it from the
 * production constant would let a rename move both sides together while every
 * record already on disk kept the old spelling.
 */
const BACKEND_MISSED_SCHEDULE: Notification = {
  Title: 'Missed selected day',
  Body: `The scheduled download for ${MISSED_LOCAL_DATE} did not run: it came due while Bridge was closed.`,
  Level: 'warning',
  Source: 'schedule',
  Kind: 'missed_schedule',
  CorrelationID: '',
  Timestamp: '2026-07-26T21:05:00.000Z',
};

/** Delivers one backend notification to every live `notification.push` listener. */
function emitBackendNotification(notification: Notification): void {
  act(() => {
    for (const listener of ports.notificationListeners) {
      listener(notification);
    }
  });
}

/** Mounts the real toast surface with both resolvers live and unmocked. */
function renderToasts(): void {
  render(
    <MemoryRouter>
      <NotificationToasts />
    </MemoryRouter>,
  );
}

describe('NotificationToasts + the missed-schedule seam', () => {
  beforeEach(() => {
    ports.getScheduleConfig.mockResolvedValue(SCHEDULE_WITH_MISSED_DAY);
    ports.ignoreMissedSchedule.mockResolvedValue({ kind: 'settled', localDate: MISSED_LOCAL_DATE, settlementReason: 'ignored' });
    ports.runMissedScheduleNow.mockResolvedValue({ kind: 'settled', localDate: MISSED_LOCAL_DATE, settlementReason: 'ran' });
  });

  afterEach(() => {
    cleanup();
    appToastQueue.clear();
    resetDownloadRuntimeStore();
    ports.notificationListeners.clear();
    ports.archivedListeners.clear();
    vi.clearAllMocks();
  });

  it('shows ONE missed-schedule toast when the backend record and the local notice describe the same day', async () => {
    renderToasts();
    await waitFor(() => expect(screen.getByText('Missed selected day')).toBeInTheDocument());

    emitBackendNotification(BACKEND_MISSED_SCHEDULE);

    // Two producers now describe this one moment: the Go record raised at
    // startup so it can be found again, and the local notice derived from the
    // same backend schedule state. They must collapse to one interruption --
    // the toast the user can act on, with both buttons on it.
    expect(screen.getAllByText('Missed selected day')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Run now' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument();
  });

  it('lets an unrelated backend notification through, so the collapse is about this kind and not about backend toasts', async () => {
    renderToasts();
    await waitFor(() => expect(screen.getByText('Missed selected day')).toBeInTheDocument());

    emitBackendNotification({
      ...BACKEND_MISSED_SCHEDULE,
      Title: 'Download run completed',
      Kind: 'run_completed',
      Source: 'download',
      Level: 'success',
    });

    expect(screen.getByText('Download run completed')).toBeInTheDocument();
    expect(screen.getAllByText('Missed selected day')).toHaveLength(1);
  });

  it('settles the day from the surviving toast and stops the schedule read-model showing it', async () => {
    ports.getScheduleConfig.mockResolvedValueOnce(SCHEDULE_WITH_MISSED_DAY).mockResolvedValue(SCHEDULE_SETTLED);

    renderToasts();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ignore' })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Ignore' }));

    // The whole reason the local toast is the survivor: its buttons drive the
    // shared schedule read-model, not only the backend. A toast whose press
    // settled the day while the Downloads panel kept showing it would be worse
    // than the duplicate it replaced.
    expect(ports.ignoreMissedSchedule).toHaveBeenCalledWith(MISSED_LOCAL_DATE);
    await waitFor(() => expect(getDownloadRuntimeStoreState().scheduleConfig.missedNotice).toBeUndefined());
    await waitFor(() => expect(screen.queryByText('Missed selected day')).not.toBeInTheDocument());
  });
});
