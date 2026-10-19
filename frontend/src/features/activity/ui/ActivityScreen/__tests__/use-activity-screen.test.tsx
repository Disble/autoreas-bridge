import { toast } from '@heroui/react';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivitySource } from '../../../activity-source/activity-source.types';
import { ACTIVITY_PIN_FAILURE_MESSAGE, ACTIVITY_PIN_SUCCESS_MESSAGE } from '../activity-screen.constants';
import { useActivityScreen } from '../use-activity-screen';

/** A fake source whose pin the test controls. */
function createFakeSource(pinMoment: ActivitySource['pinMoment']): ActivitySource {
  return { getNow: vi.fn(), pinMoment, subscribeRecorder: () => () => undefined, listIncidents: vi.fn(), getIncident: vi.fn(), getRequest: vi.fn(), listRecoveredRuns: vi.fn(), getRunStory: vi.fn() };
}

/** Wraps the hook in a router, since "Pair a phone" navigates. */
function RouterWrapper({ children }: { readonly children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('useActivityScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on Now and follows the selected tab', () => {
    const { result } = renderHook(() => useActivityScreen(createFakeSource(vi.fn())), { wrapper: RouterWrapper });

    expect(result.current.selectedTab).toBe('now');
    act(() => result.current.selectTab('history'));
    expect(result.current.selectedTab).toBe('history');
  });

  it('switches to Incidents with the incident Now opened, as a new request each time', () => {
    const { result } = renderHook(() => useActivityScreen(createFakeSource(vi.fn())), { wrapper: RouterWrapper });
    expect(result.current.incidentRequest).toBeUndefined();

    act(() => result.current.openIncident(9));
    const first = result.current.incidentRequest;
    act(() => result.current.openIncident(9));

    expect(result.current.selectedTab).toBe('incidents');
    expect(first).toEqual({ incidentId: 9 });
    expect(result.current.incidentRequest).toEqual({ incidentId: 9 });
    expect(result.current.incidentRequest).not.toBe(first);
  });

  it('pins the moment, reports it, and is busy only while the write runs', async () => {
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    let finish: () => void = () => undefined;
    const pinMoment = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const { result } = renderHook(() => useActivityScreen(createFakeSource(pinMoment)), { wrapper: RouterWrapper });

    act(() => result.current.pin());
    expect(result.current.isPinning).toBe(true);
    await act(async () => finish());

    expect(pinMoment).toHaveBeenCalledTimes(1);
    expect(success).toHaveBeenCalledWith(ACTIVITY_PIN_SUCCESS_MESSAGE);
    expect(result.current.isPinning).toBe(false);
  });

  it('opens the recorder over the tabs and returns to the tab it left', () => {
    const { result } = renderHook(() => useActivityScreen(createFakeSource(vi.fn())), { wrapper: RouterWrapper });
    expect(result.current.isRecorderOpen).toBe(false);

    act(() => result.current.selectTab('history'));
    act(() => result.current.openRecorder());
    expect(result.current.isRecorderOpen).toBe(true);
    act(() => result.current.closeRecorder());

    expect(result.current.isRecorderOpen).toBe(false);
    expect(result.current.selectedTab).toBe('history');
  });

  it('sends "Pair a phone" to the pairing route', () => {
    /** Runs the hook and fires its pairing action once. */
    function PairProbe() {
      const { pairPhone } = useActivityScreen(createFakeSource(vi.fn()));
      return (
        <button onClick={pairPhone} type="button">
          pair
        </button>
      );
    }
    render(
      <MemoryRouter initialEntries={['/activity']}>
        <Routes>
          <Route element={<PairProbe />} path="/activity" />
          <Route element={<p>pairing page</p>} path="/pairing" />
        </Routes>
      </MemoryRouter>,
    );

    act(() => screen.getByRole('button', { name: 'pair' }).click());

    expect(screen.getByText('pairing page')).toBeInTheDocument();
  });

  it('reports a failed pin', async () => {
    const danger = vi.spyOn(toast, 'danger').mockReturnValue('t');
    const success = vi.spyOn(toast, 'success').mockReturnValue('t');
    const { result } = renderHook(() => useActivityScreen(createFakeSource(() => Promise.reject(new Error('disk')))), { wrapper: RouterWrapper });

    await act(async () => result.current.pin());

    expect(danger).toHaveBeenCalledWith(ACTIVITY_PIN_FAILURE_MESSAGE);
    expect(success).not.toHaveBeenCalled();
    expect(result.current.isPinning).toBe(false);
  });
});
