import { afterEach, describe, expect, it, vi } from 'vitest';
import { frontendErrorReporter, sendReportToBridge } from '../frontend-error-source.helpers';

/** Removes any stubbed binding after a scenario. */
afterEach(() => {
  delete window.go;
  vi.restoreAllMocks();
});

/** A minimal valid report. */
const report = { kind: 'error' as const, message: 'm', stack: '', source: '', route: '', occurredAtMs: 1 };

describe('sendReportToBridge', () => {
  it('rejects as unavailable without calling anything when the binding is not attached', async () => {
    await expect(sendReportToBridge(report)).rejects.toMatchObject({ name: 'BridgeError', code: 'unavailable', message: expect.stringMatching(/\S/) });
  });

  it('passes the report to the bound Go method and resolves when it records it', async () => {
    const bound = vi.fn().mockResolvedValue(undefined);
    window.go = { desktop: { App: { ReportFrontendError: bound } } };

    await expect(sendReportToBridge(report)).resolves.toBeUndefined();
    expect(bound).toHaveBeenCalledTimes(1);
    expect(bound.mock.calls[0][0]).toMatchObject(report);
  });

  it('rejects with the coded failure the binding answers', async () => {
    const bound = vi.fn().mockRejectedValue(new Error('{"code":"invalid_argument","message":"frontend error message is required"}'));
    window.go = { desktop: { App: { ReportFrontendError: bound } } };

    await expect(sendReportToBridge(report)).rejects.toMatchObject({
      name: 'BridgeError',
      code: 'invalid_argument',
      message: 'frontend error message is required',
    });
  });
});

describe('frontendErrorReporter', () => {
  it('sends a report through the binding once and throttles an identical one', async () => {
    const bound = vi.fn().mockResolvedValue(undefined);
    window.go = { desktop: { App: { ReportFrontendError: bound } } };
    const throttled = { ...report, message: 'throttled once' };

    frontendErrorReporter(throttled);
    frontendErrorReporter(throttled);
    await Promise.resolve();

    expect(bound).toHaveBeenCalledTimes(1);
    expect(bound.mock.calls[0][0]).toMatchObject(throttled);
  });
});
