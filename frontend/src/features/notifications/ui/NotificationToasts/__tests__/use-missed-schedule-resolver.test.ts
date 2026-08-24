import { renderHook } from '@testing-library/react';
import type { AppNotification } from '../../../../../shared/contracts/app-notification.types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Stand-in for the router hook the resolver binds its navigate action to. */
const navigateMock = vi.fn();

/** Controls what `useMissedScheduleNotice` reports to the resolver per render. */
const noticeMock = vi.fn();

vi.mock('react-router', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../../../../../shared/hooks/use-missed-schedule-notice/use-missed-schedule-notice', () => ({
  useMissedScheduleNotice: () => noticeMock(),
}));

import { useMissedScheduleResolver } from '../use-missed-schedule-resolver';
import { MISSED_DECISION_TOAST_ID, MISSED_FAILURE_TOAST_ID } from '../notification-resolver.constants';

/** A notice with neither a decision nor a failure pending. */
const quietNotice = {
  decisionNotice: undefined,
  failureNotice: undefined,
  runNow: vi.fn(),
  ignore: vi.fn(),
};

describe('useMissedScheduleResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noticeMock.mockReturnValue(quietNotice);
  });

  it('pushes the decision notice with BOTH of its actions', () => {
    noticeMock.mockReturnValue({
      ...quietNotice,
      decisionNotice: { localDate: '2026-08-23' },
    });
    const push = vi.fn<(notification: AppNotification) => void>();

    renderHook(() => useMissedScheduleResolver(push, vi.fn()));

    const pushed = push.mock.calls.find(([n]) => n.dedupeKey === MISSED_DECISION_TOAST_ID)?.[0];
    expect(pushed).toBeDefined();
    // Two actions, not one. The toast layer truncated to the first for a long
    // time; this pins that the resolver has always been handing over both.
    expect(pushed?.actions?.map((action) => action.label)).toEqual(['Run now', 'Ignore']);
    expect(pushed?.persistent).toBe(true);
  });

  it('pushes the failure notice with both of its actions', () => {
    noticeMock.mockReturnValue({
      ...quietNotice,
      failureNotice: { localDate: '2026-08-22', attemptStatus: 'error' },
    });
    const push = vi.fn<(notification: AppNotification) => void>();

    renderHook(() => useMissedScheduleResolver(push, vi.fn()));

    const pushed = push.mock.calls.find(([n]) => n.dedupeKey === MISSED_FAILURE_TOAST_ID)?.[0];
    expect(pushed?.actions?.map((action) => action.label)).toEqual(['Open Downloads', 'Ignore this date']);
    expect(pushed?.severity).toBe('error');
  });

  it('removes each toast once its notice clears', () => {
    const remove = vi.fn();

    renderHook(() => useMissedScheduleResolver(vi.fn(), remove));

    expect(remove).toHaveBeenCalledWith(MISSED_DECISION_TOAST_ID);
    expect(remove).toHaveBeenCalledWith(MISSED_FAILURE_TOAST_ID);
  });

  it('uses the latest push after a re-render rather than the one captured on mount', () => {
    const firstPush = vi.fn();
    const latestPush = vi.fn();
    noticeMock.mockReturnValue(quietNotice);

    const { rerender } = renderHook(({ push }) => useMissedScheduleResolver(push, vi.fn()), {
      initialProps: { push: firstPush },
    });

    noticeMock.mockReturnValue({
      ...quietNotice,
      decisionNotice: { localDate: '2026-08-23' },
    });
    rerender({ push: latestPush });

    // The effects read `push` through a ref so they stay keyed on the notice
    // alone. That is only correct while the ref is refreshed after each
    // commit; refresh it during render instead and React may discard the pass
    // that wrote it.
    expect(latestPush).toHaveBeenCalled();
    expect(firstPush).not.toHaveBeenCalled();
  });
});
