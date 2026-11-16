import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { DAILY_BOARD_RECHECK_BUSY, DAILY_BOARD_SEND_BUSY } from '../daily-board.constants';
import { useDailyBoard } from '../use-daily-board';
import { useDailyBoardSend } from '../use-daily-board-send';
import { deferred, makeSeasonPort } from '../../../__tests__/season-port.test-support';

/** Renders one season screen hook over a ready season query client. */
const renderSeasonHook = renderHook;

/** Mounts a hook with the ready season query client the board reads through. */
function renderWithSeasonClient<T>(hook: () => T) {
  return renderSeasonHook(hook, { wrapper: createModulesTestWrapper({ module: 'season', state: 'ready' }).wrapper });
}

describe('Daily board busy feedback', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it.each([
    ['settles', (settle: { resolve: (value: string) => void }) => settle.resolve('ok'), undefined],
    ['fails', (settle: { reject: (error: unknown) => void }) => settle.reject(createBridgeError('internal', 'availability down')), 'availability down'],
  ] as const)('reports the recheck busy message while it runs and clears it once it %s', async (_case, settle, expectedError) => {
    const recheck = deferred<string>();
    const source = makeSeasonPort({ recheckAvailability: vi.fn().mockReturnValue(recheck.promise) });
    const { result } = renderWithSeasonClient(() => useDailyBoard(source));

    act(() => result.current.onRecheck());

    await waitFor(() => expect(getSeasonStoreState().busyMessage).toBe(DAILY_BOARD_RECHECK_BUSY));
    await act(async () => {
      settle(recheck);
      await recheck.promise.catch(() => undefined);
    });

    await waitFor(() => expect(getSeasonStoreState().busyMessage).toBeUndefined());
    expect(getSeasonStoreState().errorMessage).toBe(expectedError);
  });

  it.each([
    ['settles', (settle: { resolve: (value: { status: string; pastDownloadTime: boolean; downloadTime: string }) => void }) => settle.resolve({ status: 'ok', pastDownloadTime: false, downloadTime: '' }), undefined],
    ['fails', (settle: { reject: (error: unknown) => void }) => settle.reject(createBridgeError('internal', 'send down')), 'send down'],
  ] as const)('reports the send busy message while the batch is in flight and clears it once it %s', async (_case, settle, expectedError) => {
    const send = deferred<{ status: string; pastDownloadTime: boolean; downloadTime: string }>();
    const source = makeSeasonPort({ sendToVerHoy: vi.fn().mockReturnValue(send.promise) });
    const { result } = renderWithSeasonClient(() => useDailyBoardSend(source));
    act(() => result.current.toggleSelect('anime-1'));

    act(() => result.current.onSendToVerHoy());
    await waitFor(() => expect(getSeasonStoreState().busyMessage).toBe(DAILY_BOARD_SEND_BUSY));

    await act(async () => {
      settle(send);
      await send.promise.catch(() => undefined);
    });

    await waitFor(() => expect(getSeasonStoreState().busyMessage).toBeUndefined());
    expect(getSeasonStoreState().errorMessage).toBe(expectedError);
  });
});
