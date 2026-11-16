import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { getSeasonStoreState, resetSeasonStore } from '../../../../../shared/store/season-store/season-store.helpers';
import { makeCreatedRow, makeSeasonPort } from '../../../__tests__/season-port.test-support';
import { useEvaluationPanel } from '../use-evaluation-panel';

/** Mounts the evaluation screen hook over a ready season query client. */
function renderPanel(source: ReturnType<typeof makeSeasonPort>) {
  return renderHook(() => useEvaluationPanel(source, { getAnimeCover: vi.fn().mockResolvedValue({ source: 'placeholder' }) }), {
    wrapper: createModulesTestWrapper({ module: 'season', state: 'ready' }).wrapper,
  });
}

describe('Evaluation panel failed refetch', () => {
  afterEach(() => {
    resetSeasonStore();
    vi.clearAllMocks();
  });

  it('keeps the loaded candidates and reports the failure when the refetch after a skip rejects', async () => {
    const rows = [makeCreatedRow({ id: 'row-1', rawName: 'Naruto' })];
    // An `internal` code, so the refetch does not retry and the case stays fast.
    const readSeasonAnimes = vi.fn().mockResolvedValueOnce(rows).mockRejectedValue(createBridgeError('internal', 'rows refresh failed'));
    const source = makeSeasonPort({ readSeasonAnimes, skipGrading: vi.fn().mockResolvedValue('ok') });
    const { result } = renderPanel(source);
    await waitFor(() => expect(result.current.items).toHaveLength(1));

    await act(async () => {
      result.current.onSkip('row-1');
    });
    await waitFor(() => expect(readSeasonAnimes).toHaveBeenCalledTimes(2));

    // The rejected refetch keeps the rows the screen already loaded beside the banner.
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]?.row.rawName).toBe('Naruto');
    await waitFor(() => expect(getSeasonStoreState().errorMessage).toBe('rows refresh failed'));
  });
});
