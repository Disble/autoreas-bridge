import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useJDConfigPanel } from '../use-jdconfig-panel';
import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';
import type { JDStatus } from '../../../../../shared/contracts/download.types';

const baseStatus: JDStatus = {
  email: 'user@example.com',
  hasPassword: true,
  deviceName: 'desktop-1',
  exePathOverride: '',
  defaultDestDir: 'D:/downloads',
  lastSeenStatus: 'online',
  lastSeenAtMs: 1_700_000_000_000,
};

function createSource(overrides: Partial<DownloadRuntimeSource> = {}): DownloadRuntimeSource {
  return {
    getDownloadConfig: vi.fn(),
    getJDStatus: vi.fn().mockResolvedValue(baseStatus),
    getJDMaxSimultaneousDownloads: vi.fn().mockResolvedValue(0),
    setJDConfig: vi.fn().mockResolvedValue('ok'),
    getScheduleConfig: vi.fn(),
    setScheduleConfig: vi.fn(),
    setHosterPriority: vi.fn(),
    setEpisodeRenameEnabled: vi.fn().mockResolvedValue('ok'),
    triggerDownloadCheck: vi.fn(),
    triggerAnimeDownload: vi.fn(),
    cancelDownloadRun: vi.fn().mockResolvedValue('ok'),
    runMissedScheduleNow: vi.fn(),
    ignoreMissedSchedule: vi.fn(),
    listDownloadRuns: vi.fn(),
    listDownloadReadiness: vi.fn(),
    subscribeRunEvents: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

describe('useJDConfigPanel', () => {
  it('starts in the loading status', () => {
    const source = createSource();
    const { result } = renderHook(() => useJDConfigPanel(source));

    expect(result.current.status).toBe('loading');
  });

  it('loads JD status and maps it to form values without the password', async () => {
    const source = createSource();
    const { result } = renderHook(() => useJDConfigPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(result.current.form.email).toBe('user@example.com');
    expect(result.current.form.plaintextPassword).toBe('');
    expect(result.current.liveStatus.hasPassword).toBe(true);
  });

  it('surfaces an error status when getJDStatus rejects', async () => {
    const source = createSource({ getJDStatus: vi.fn().mockRejectedValue(new Error('boom')) });
    const { result } = renderHook(() => useJDConfigPanel(source));

    await waitFor(() => expect(result.current.status).toBe('error'));
  });

  it('updateField updates a single form field', async () => {
    const source = createSource();
    const { result } = renderHook(() => useJDConfigPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.updateField('plaintextPassword', 'new-secret');
    });

    expect(result.current.form.plaintextPassword).toBe('new-secret');
  });

  it('save calls setJDConfig with the mapped input and refreshes liveStatus', async () => {
    const source = createSource();
    const { result } = renderHook(() => useJDConfigPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.updateField('plaintextPassword', 'new-secret');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(source.setJDConfig).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user@example.com', plaintextPassword: 'new-secret' }),
    );
    expect(result.current.saveSucceeded).toBe(true);
    expect(source.getJDStatus).toHaveBeenCalledTimes(2);
  });

  it('save surfaces saveErrorMessage and leaves saveSucceeded false when setJDConfig rejects', async () => {
    const source = createSource({ setJDConfig: vi.fn().mockRejectedValue(new Error('save failed')) });
    const { result } = renderHook(() => useJDConfigPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.saveErrorMessage).toBe('save failed');
    expect(result.current.saveSucceeded).toBe(false);
  });

  it('clears the password field after a successful save (write-only contract)', async () => {
    const source = createSource();
    const { result } = renderHook(() => useJDConfigPanel(source));

    await waitFor(() => expect(result.current.status).toBe('ready'));

    act(() => {
      result.current.updateField('plaintextPassword', 'new-secret');
    });

    await act(async () => {
      await result.current.save();
    });

    expect(result.current.form.plaintextPassword).toBe('');
  });
});
